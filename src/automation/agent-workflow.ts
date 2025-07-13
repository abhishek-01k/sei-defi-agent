import {
  ConsoleKit,
  WorkflowExecutionStatus,
  WorkflowStateResponse
} from 'brahma-console-kit';
import { ethers, JsonRpcProvider, Wallet } from 'ethers';
import { encodeMulti } from 'ethers-multisend';
import { logger } from '../utils/logger';
import { YeiClient } from '../clients/yei-client';
import { AstroportClient } from '../clients/astroport-client';
import { SiloClient } from '../clients/silo-client';
import { YieldOptimizationStrategy } from '../strategies/yield-optimization';
import {
  TaskParams,
  ExecutionResult,
  AgentConfig,
  RiskLimits,
  AgentError,
  PerformanceMetrics,
  TradeRecord
} from '../types';
import { poll } from '../utils/polling';

// Environment variables
const ExecutorEoaPK = process.env.EXECUTOR_EOA_PRIVATE_KEY!;
const ExecutorRegistryId = process.env.EXECUTOR_REGISTRY_ID!;
const JsonRpcUrl = process.env.SEI_RPC_URL!;
const ConsoleApiKey = process.env.CONSOLE_API_KEY!;
const ConsoleBaseUrl = process.env.CONSOLE_BASE_URL!;
const YeiApiUrl = process.env.YEI_API_BASE_URL!;

// Agent configuration
const POLLING_WAIT_INTERVAL = parseInt(process.env.POLLING_INTERVAL || '10000');
const MAX_SLIPPAGE = parseInt(process.env.MAX_SLIPPAGE || '200');
const MIN_YIELD_THRESHOLD = parseInt(process.env.MIN_YIELD_THRESHOLD || '500');
const RISK_TOLERANCE = (process.env.RISK_TOLERANCE || 'medium') as 'low' | 'medium' | 'high';
const AUTO_REBALANCE_ENABLED = process.env.AUTO_REBALANCE_ENABLED === 'true';
const MAX_POSITION_SIZE = process.env.MAX_POSITION_SIZE || '1000000000000000000';

let pollCount = 0;

interface SeiAgentWorkflow {
  yieldStrategy: YieldOptimizationStrategy;
  consoleKit: ConsoleKit;
  provider: JsonRpcProvider;
  config: AgentConfig;
  riskLimits: RiskLimits;
  performanceMetrics: PerformanceMetrics;
  tradeHistory: TradeRecord[];
}

class SeiDeFiAgent implements SeiAgentWorkflow {
  public yieldStrategy: YieldOptimizationStrategy;
  public consoleKit: ConsoleKit;
  public provider: JsonRpcProvider;
  public config: AgentConfig;
  public riskLimits: RiskLimits;
  public performanceMetrics: PerformanceMetrics;
  public tradeHistory: TradeRecord[];

  private yeiClient: YeiClient;
  private astroportClient: AstroportClient;
  private siloClient: SiloClient;

  constructor() {
    this.provider = new JsonRpcProvider(JsonRpcUrl);
    this.consoleKit = new ConsoleKit({
      apiKey: ConsoleApiKey,
      baseUrl: ConsoleBaseUrl
    });

    // Initialize clients
    this.yeiClient = new YeiClient(YeiApiUrl, JsonRpcUrl, 1329);
    this.astroportClient = new AstroportClient(JsonRpcUrl, 1329);
    this.siloClient = new SiloClient(JsonRpcUrl, 1329);

    // Initialize configuration
    this.config = {
      pollingInterval: POLLING_WAIT_INTERVAL,
      maxSlippage: MAX_SLIPPAGE,
      minYieldThreshold: MIN_YIELD_THRESHOLD,
      riskTolerance: RISK_TOLERANCE,
      autoRebalanceEnabled: AUTO_REBALANCE_ENABLED,
      maxPositionSize: MAX_POSITION_SIZE,
      rebalanceThreshold: 0.1, // 10% threshold
      emergencyStopLoss: 0.2, // 20% stop loss
      maxGasPrice: '50000000000', // 50 gwei
      preferredProtocols: ['yei', 'astroport', 'silo']
    };

    // Initialize risk limits
    this.riskLimits = {
      maxPositionSizeUSD: MAX_POSITION_SIZE,
      maxProtocolExposure: 0.4, // 40% max in single protocol
      minHealthFactor: '1.5',
      maxLeverage: 3,
      maxSlippage: MAX_SLIPPAGE / 100,
      emergencyStopLoss: 0.2
    };

    // Initialize yield optimization strategy
    this.yieldStrategy = new YieldOptimizationStrategy(
      this.yeiClient,
      this.astroportClient,
      this.siloClient,
      this.config,
      this.riskLimits
    );

    // Initialize performance tracking
    this.performanceMetrics = {
      totalProfit: '0',
      totalFees: '0',
      netProfit: '0',
      roi: '0',
      sharpeRatio: 0,
      maxDrawdown: '0',
      winRate: 0,
      avgTradeSize: '0',
      totalTrades: 0,
      period: {
        start: Date.now(),
        end: Date.now()
      }
    };

    this.tradeHistory = [];
  }

  /**
   * Execute the main agent strategy
   */
  async executeHandler(taskParams: TaskParams): Promise<ExecutionResult> {
    try {
      logger.info(`Executing Sei DeFi agent for: ${taskParams.subAccountAddress}`);

      // Validate task parameters
      if (!this.validateTaskParams(taskParams)) {
        return {
          skip: true,
          message: 'Invalid task parameters'
        };
      }

      // Extract parameters
      const { subAccountAddress, chainID, subscription } = taskParams;
      const metadata = subscription.metadata;

      // Check if automation is enabled
      if (!this.config.autoRebalanceEnabled) {
        return {
          skip: true,
          message: 'Auto-rebalancing is disabled'
        };
      }

      // Execute yield optimization strategy
      const result = await this.yieldStrategy.executeStrategy(taskParams);

      // Update performance metrics if transactions were executed
      if (result.transactions && result.transactions.length > 0) {
        await this.updatePerformanceMetrics(result, subAccountAddress);
      }

      // Log execution result
      logger.info(`Agent execution completed: ${result.message}`);

      return result;
    } catch (error) {
      logger.error('Error in agent execution:', error);
      return {
        skip: true,
        message: `Agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validate task parameters
   */
  private validateTaskParams(taskParams: TaskParams): boolean {
    try {
      if (!taskParams.subAccountAddress || !ethers.isAddress(taskParams.subAccountAddress)) {
        logger.error('Invalid subAccountAddress');
        return false;
      }

      if (!taskParams.chainID || taskParams.chainID !== 1329) {
        logger.error('Invalid chainID - must be Sei mainnet (1329)');
        return false;
      }

      if (!taskParams.subscription || !taskParams.subscription.metadata) {
        logger.error('Missing subscription metadata');
        return false;
      }

      const metadata = taskParams.subscription.metadata;
      if (!metadata.baseToken || !ethers.isAddress(metadata.baseToken)) {
        logger.error('Invalid baseToken address');
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error validating task parameters:', error);
      return false;
    }
  }

  /**
   * Update performance metrics after trade execution
   */
  private async updatePerformanceMetrics(
    result: ExecutionResult,
    subAccountAddress: string
  ): Promise<void> {
    try {
      if (!result.transactions || result.transactions.length === 0) {
        return;
      }

      // Update trade count
      this.performanceMetrics.totalTrades += result.transactions.length;

      // Calculate trade details (simplified)
      const estimatedProfit = result.expectedProfit ? parseFloat(result.expectedProfit) : 0;
      const estimatedFees = result.gasEstimate ? parseFloat(result.gasEstimate) * 0.000000001 : 0; // Convert to SEI

      // Update totals
      const currentProfit = parseFloat(this.performanceMetrics.totalProfit);
      const currentFees = parseFloat(this.performanceMetrics.totalFees);

      this.performanceMetrics.totalProfit = (currentProfit + estimatedProfit).toString();
      this.performanceMetrics.totalFees = (currentFees + estimatedFees).toString();
      this.performanceMetrics.netProfit = (currentProfit + estimatedProfit - currentFees - estimatedFees).toString();

      // Update period end
      this.performanceMetrics.period.end = Date.now();

      // Calculate ROI (simplified)
      const initialValue = 1000; // Placeholder - would need actual initial portfolio value
      const currentValue = initialValue + parseFloat(this.performanceMetrics.netProfit);
      this.performanceMetrics.roi = (((currentValue - initialValue) / initialValue) * 100).toString();

      // Update win rate (simplified)
      const winningTrades = estimatedProfit > 0 ? 1 : 0;
      this.performanceMetrics.winRate = (winningTrades / this.performanceMetrics.totalTrades) * 100;

      // Create trade record
      const tradeRecord: TradeRecord = {
        id: `trade_${Date.now()}`,
        timestamp: Date.now(),
        type: 'deposit', // Simplified - would need actual trade type
        amount: result.expectedProfit || '0',
        price: '1', // Placeholder
        fees: estimatedFees.toString(),
        profit: estimatedProfit.toString(),
        transactionHash: '', // Would be populated after execution
        gasUsed: result.gasEstimate || '0'
      };

      this.tradeHistory.push(tradeRecord);

      // Keep only last 1000 trades
      if (this.tradeHistory.length > 1000) {
        this.tradeHistory = this.tradeHistory.slice(-1000);
      }

      logger.info(`Performance metrics updated: ${JSON.stringify(this.performanceMetrics)}`);
    } catch (error) {
      logger.error('Error updating performance metrics:', error);
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get trade history
   */
  getTradeHistory(): TradeRecord[] {
    return [...this.tradeHistory];
  }

  /**
   * Emergency stop - disable all automation
   */
  emergencyStop(): void {
    logger.warn('Emergency stop activated - disabling all automation');
    this.config.autoRebalanceEnabled = false;
  }

  /**
   * Resume automation
   */
  resumeAutomation(): void {
    logger.info('Resuming automation');
    this.config.autoRebalanceEnabled = true;
  }

  /**
   * Update agent configuration
   */
  updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info(`Agent configuration updated: ${JSON.stringify(newConfig)}`);
  }

  /**
   * Update risk limits
   */
  updateRiskLimits(newLimits: Partial<RiskLimits>): void {
    this.riskLimits = { ...this.riskLimits, ...newLimits };
    logger.info(`Risk limits updated: ${JSON.stringify(newLimits)}`);
  }
}

/**
 * Poll for tasks and execute them
 */
async function pollTasksAndSubmit(
  agent: SeiDeFiAgent,
  consoleKit: ConsoleKit,
  chainId: number,
  executorWallet: Wallet,
  registryId: string,
  executorAddress: string
): Promise<boolean> {
  try {
    pollCount++;
    logger.info(`[Poll ${pollCount}] Checking for new tasks...`);

    // Get pending tasks from Console Kit
    const tasks = await consoleKit.getPendingTasks(registryId);
    
    if (!tasks || tasks.length === 0) {
      logger.info('No pending tasks found');
      return true;
    }

    logger.info(`Found ${tasks.length} pending tasks`);

    // Process each task
    for (const task of tasks) {
      try {
        const taskParams: TaskParams = {
          subAccountAddress: task.subAccountAddress,
          chainID: chainId,
          subscription: task.subscription
        };

        // Execute the agent strategy
        const result = await agent.executeHandler(taskParams);

        if (result.skip) {
          logger.info(`Task ${task.id} skipped: ${result.message}`);
          continue;
        }

        if (result.transactions && result.transactions.length > 0) {
          // Submit transaction for execution
          await executeTransaction(
            consoleKit,
            executorWallet,
            registryId,
            task.id,
            taskParams,
            result.transactions,
            task.executorNonce,
            executorAddress,
            result.message
          );
        }
      } catch (error) {
        logger.error(`Error processing task ${task.id}:`, error);
        continue;
      }
    }

    return true;
  } catch (error) {
    logger.error('Error in polling tasks:', error);
    return false;
  }
}

/**
 * Execute transaction through Console Kit
 */
async function executeTransaction(
  consoleKit: ConsoleKit,
  executorWallet: Wallet,
  registryId: string,
  taskId: string,
  taskParams: TaskParams,
  transactions: any[],
  executorNonce: string,
  executorAddress: string,
  successMessage: string
): Promise<boolean> {
  try {
    logger.info(`Executing transaction for task ${taskId}`);

    // Encode multiple transactions if needed
    let txData: string;
    let txTo: string;
    let txValue: string = '0';

    if (transactions.length === 1) {
      txData = transactions[0].data;
      txTo = transactions[0].to;
      txValue = transactions[0].value || '0';
    } else {
      // Use multisend for multiple transactions
      const multiSendTx = encodeMulti(transactions);
      txData = multiSendTx.data;
      txTo = multiSendTx.to;
    }

    // Create execution request
    const executionRequest = {
      taskId,
      subAccountAddress: taskParams.subAccountAddress,
      chainId: taskParams.chainID,
      to: txTo,
      data: txData,
      value: txValue,
      executorNonce
    };

    // Submit for execution
    const executionResult = await consoleKit.vendorCaller.submitExecution(
      registryId,
      executionRequest
    );

    if (executionResult.success) {
      logger.info(`Transaction submitted successfully: ${executionResult.transactionHash}`);
      return true;
    } else {
      logger.error(`Transaction submission failed: ${executionResult.error}`);
      return false;
    }
  } catch (error) {
    logger.error('Error executing transaction:', error);
    return false;
  }
}

/**
 * Main workflow function
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting Sei DeFi Agent workflow...');

    // Initialize wallet
    const executorWallet = new Wallet(ExecutorEoaPK);
    const executorAddress = executorWallet.address;
    const chainId = 1329; // Sei mainnet

    // Initialize agent
    const agent = new SeiDeFiAgent();

    logger.info(`Agent initialized with executor: ${executorAddress}`);
    logger.info(`Configuration: ${JSON.stringify(agent.config)}`);

    // Start polling loop
    const pollForever = async (): Promise<boolean> => {
      return await pollTasksAndSubmit(
        agent,
        agent.consoleKit,
        chainId,
        executorWallet,
        ExecutorRegistryId,
        executorAddress
      );
    };

    // Monitor workflow state
    const getWorkflowState = async (): Promise<WorkflowStateResponse | undefined> => {
      try {
        return await agent.consoleKit.vendorCaller.getWorkflowState(ExecutorRegistryId);
      } catch (error) {
        logger.error('Error getting workflow state:', error);
        return undefined;
      }
    };

    const isWorkflowComplete = (workflowState?: WorkflowStateResponse): boolean => {
      return workflowState?.status === WorkflowExecutionStatus.COMPLETED;
    };

    // Start polling with monitoring
    await poll(
      pollForever,
      getWorkflowState,
      isWorkflowComplete,
      POLLING_WAIT_INTERVAL,
      logger
    );

    logger.info('Sei DeFi Agent workflow completed');
  } catch (error) {
    logger.error('Fatal error in main workflow:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the workflow if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { SeiDeFiAgent, main }; 