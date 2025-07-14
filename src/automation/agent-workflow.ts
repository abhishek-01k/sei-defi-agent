import { ConsoleKit, TaskParams, ExecutionResult, WorkflowStateResponse } from 'brahma-console-kit';
import { ethers, Wallet } from 'ethers';
import { logger } from '../utils/logger';
import { poll } from '../utils/polling';
import SeiDeFiAgentKit, {
  AgentKitConfig,
  YieldOptimizationRequest,
  ExecutionResult as AgentExecutionResult
} from '../agent-kit';
import { Address } from 'viem';
import { ModelProviderName } from '../types';

// Configuration interfaces
interface AgentConfig {
  pollingInterval: number;
  maxSlippage: number;
  minYieldThreshold: number;
  riskTolerance: 'low' | 'medium' | 'high';
  autoRebalanceEnabled: boolean;
  maxPositionSize: string;
  rebalanceThreshold: number;
  emergencyStopLoss: number;
  maxGasPrice: string;
  preferredProtocols: string[];
}

interface RiskLimits {
  maxPositionSizeUSD: string;
  maxProtocolExposure: number;
  minHealthFactor: string;
  maxLeverage: number;
  maxSlippage: number;
  emergencyStopLoss: number;
}

interface PerformanceMetrics {
  totalProfit: string;
  totalFees: string;
  netProfit: string;
  roi: string;
  sharpeRatio: number;
  maxDrawdown: string;
  winRate: number;
  avgTradeSize: string;
  totalTrades: number;
  period: {
    start: number;
    end: number;
  };
}

interface TradeRecord {
  id: string;
  timestamp: number;
  type: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'swap';
  fromToken?: Address;
  toToken?: Address;
  amount: string;
  price: string;
  fees: string;
  profit: string;
  transactionHash: string;
  gasUsed: string;
  market?: any;
}

interface SeiAgentWorkflow {
  agentKit: SeiDeFiAgentKit;
  consoleKit: ConsoleKit;
  config: AgentConfig;
  riskLimits: RiskLimits;
  performanceMetrics: PerformanceMetrics;
  tradeHistory: TradeRecord[];
}

class SeiDeFiAgent implements SeiAgentWorkflow {
  public agentKit: SeiDeFiAgentKit;
  public consoleKit: ConsoleKit;
  public config: AgentConfig;
  public riskLimits: RiskLimits;
  public performanceMetrics: PerformanceMetrics;
  public tradeHistory: TradeRecord[];

  private isEmergencyStopped: boolean = false;

  constructor() {
    // Initialize configuration
    this.config = {
      pollingInterval: parseInt(process.env.POLLING_INTERVAL || '30000'),
      maxSlippage: parseFloat(process.env.MAX_SLIPPAGE || '0.5'),
      minYieldThreshold: parseFloat(process.env.MIN_YIELD_THRESHOLD || '5.0'),
      riskTolerance: (process.env.RISK_TOLERANCE as 'low' | 'medium' | 'high') || 'medium',
      autoRebalanceEnabled: process.env.AUTO_REBALANCE_ENABLED !== 'false',
      maxPositionSize: process.env.MAX_POSITION_SIZE || '10000',
      rebalanceThreshold: parseFloat(process.env.REBALANCE_THRESHOLD || '2.0'),
      emergencyStopLoss: parseFloat(process.env.EMERGENCY_STOP_LOSS || '10.0'),
      maxGasPrice: process.env.MAX_GAS_PRICE || '1000000000',
      preferredProtocols: process.env.PREFERRED_PROTOCOLS?.split(',') || ['symphony', 'takara', 'silo']
    };

    this.riskLimits = {
      maxPositionSizeUSD: process.env.MAX_POSITION_SIZE_USD || '50000',
      maxProtocolExposure: parseFloat(process.env.MAX_PROTOCOL_EXPOSURE || '30'),
      minHealthFactor: process.env.MIN_HEALTH_FACTOR || '1.5',
      maxLeverage: parseFloat(process.env.MAX_LEVERAGE || '3.0'),
      maxSlippage: parseFloat(process.env.MAX_SLIPPAGE || '0.5'),
      emergencyStopLoss: parseFloat(process.env.EMERGENCY_STOP_LOSS || '10.0')
    };

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

    // Initialize agent kit with configuration
    const agentKitConfig: AgentKitConfig = {
      privateKey: process.env.PRIVATE_KEY!,
      openaiApiKey: process.env.OPENAI_API_KEY!,
      rpcUrl: process.env.RPC_URL,
      modelProvider: ModelProviderName.OPENAI,
      temperature: 0,
      model: "gpt-4o"
    };

    this.agentKit = new SeiDeFiAgentKit(agentKitConfig);
    // Initialize Console Kit
    this.consoleKit = new ConsoleKit(
      process.env.BRAHMA_API_KEY!,
      process.env.NETWORK_TYPE || 'testnet'
    );

    logger.info('Sei DeFi Agent initialized successfully');
    logger.info(`Agent wallet address: ${this.agentKit.getWalletAddress()}`);
    logger.info(`Available tools: ${this.agentKit.getAvailableTools().join(', ')}`);
  }

  async executeHandler(taskParams: TaskParams): Promise<ExecutionResult> {
    try {
      if (this.isEmergencyStopped) {
        return {
          skip: true,
          message: 'Agent is in emergency stop mode',
          gasEstimate: '0'
        };
      }

      if (!this.validateTaskParams(taskParams)) {
        return {
          skip: true,
          message: 'Invalid task parameters',
          gasEstimate: '0'
        };
      }

      logger.info(`Executing automation for address: ${taskParams.subAccountAddress}`);

      // Build yield optimization request from task parameters
      const optimizationRequest: YieldOptimizationRequest = {
        userAddress: taskParams.subAccountAddress as Address,
        baseToken: taskParams.subscription.metadata.baseToken as Address,
        targetAPY: taskParams.subscription.metadata.targetAPY,
        maxSlippage: taskParams.subscription.metadata.maxSlippage,
        riskTolerance: taskParams.subscription.metadata.riskTolerance || this.config.riskTolerance,
        preferredProtocols: taskParams.subscription.metadata.preferredProtocols || this.config.preferredProtocols,
        maxPositionSize: taskParams.subscription.metadata.maxPositionSize || this.config.maxPositionSize
      };

      // Execute AI-powered yield optimization
      const result = await this.agentKit.optimizeYield(optimizationRequest);

      if (!result.success) {
        logger.error('Yield optimization failed:', result.error);
        return {
          skip: true,
          message: `Optimization failed: ${result.error}`,
          gasEstimate: '0'
        };
      }

      // Update performance metrics
      await this.updatePerformanceMetrics(result, taskParams.subAccountAddress);

      logger.info('Automation execution completed successfully');
      logger.info(`Recommendations: ${result.recommendations?.join('; ')}`);

      return {
        skip: false,
        message: 'Yield optimization executed successfully',
        transactions: result.transactionHash ? [{ hash: result.transactionHash }] : [],
        gasEstimate: result.gasUsed || '0',
        expectedProfit: result.profit || '0',
        riskAssessment: result.recommendations?.join('; ')
      };

    } catch (error) {
      logger.error('Error in automation execution:', error);
      return {
        skip: true,
        message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        gasEstimate: '0'
      };
    }
  }

  private validateTaskParams(taskParams: TaskParams): boolean {
    if (!taskParams.subAccountAddress) {
      logger.error('Missing subAccountAddress in task parameters');
      return false;
    }

    if (!taskParams.subscription?.metadata?.baseToken) {
      logger.error('Missing baseToken in task parameters');
      return false;
    }

    if (!ethers.isAddress(taskParams.subAccountAddress)) {
      logger.error('Invalid subAccountAddress format');
      return false;
    }

    if (!ethers.isAddress(taskParams.subscription.metadata.baseToken)) {
      logger.error('Invalid baseToken address format');
      return false;
    }

    return true;
  }

  private async updatePerformanceMetrics(
    result: AgentExecutionResult,
    subAccountAddress: string
  ): Promise<void> {
    try {
      const profit = parseFloat(result.profit || '0');
      const gasUsed = parseFloat(result.gasUsed || '0');

      // Convert gas used to fees (assuming gas price)
      const gasPrice = parseFloat(this.config.maxGasPrice);
      const fees = (gasUsed * gasPrice) / 1e18; // Convert to SEI

      // Update metrics
      this.performanceMetrics.totalTrades += 1;
      this.performanceMetrics.totalProfit = (parseFloat(this.performanceMetrics.totalProfit) + profit).toString();
      this.performanceMetrics.totalFees = (parseFloat(this.performanceMetrics.totalFees) + fees).toString();
      this.performanceMetrics.netProfit = (
        parseFloat(this.performanceMetrics.totalProfit) - parseFloat(this.performanceMetrics.totalFees)
      ).toString();

      // Calculate ROI (simplified)
      const totalInvested = parseFloat(this.config.maxPositionSize);
      if (totalInvested > 0) {
        this.performanceMetrics.roi = ((parseFloat(this.performanceMetrics.netProfit) / totalInvested) * 100).toString();
      }

      // Update win rate
      if (profit > 0) {
        const currentWins = this.tradeHistory.filter(trade => parseFloat(trade.profit) > 0).length;
        this.performanceMetrics.winRate = ((currentWins + 1) / this.performanceMetrics.totalTrades) * 100;
      } else {
        const currentWins = this.tradeHistory.filter(trade => parseFloat(trade.profit) > 0).length;
        this.performanceMetrics.winRate = (currentWins / this.performanceMetrics.totalTrades) * 100;
      }

      // Update average trade size
      const totalTradeValue = this.tradeHistory.reduce((sum, trade) => sum + parseFloat(trade.amount), 0);
      this.performanceMetrics.avgTradeSize = ((totalTradeValue + parseFloat(result.profit || '0')) / this.performanceMetrics.totalTrades).toString();

      // Add trade record
      const tradeRecord: TradeRecord = {
        id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        type: 'deposit', // Will be determined by actual strategy
        amount: result.profit || '0',
        price: '1', // Will be calculated based on actual trades
        fees: fees.toString(),
        profit: result.profit || '0',
        transactionHash: result.transactionHash || '',
        gasUsed: result.gasUsed || '0'
      };

      this.tradeHistory.push(tradeRecord);

      // Keep only last 1000 trades
      if (this.tradeHistory.length > 1000) {
        this.tradeHistory = this.tradeHistory.slice(-1000);
      }

      logger.info('Performance metrics updated');
      logger.info(`Total trades: ${this.performanceMetrics.totalTrades}, Net profit: ${this.performanceMetrics.netProfit} SEI, Win rate: ${this.performanceMetrics.winRate.toFixed(2)}%`);
    } catch (error) {
      logger.error('Error updating performance metrics:', error);
    }
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  getTradeHistory(): TradeRecord[] {
    return [...this.tradeHistory];
  }

  emergencyStop(): void {
    this.isEmergencyStopped = true;
    logger.warn('Emergency stop activated - all automation paused');
  }

  resumeAutomation(): void {
    this.isEmergencyStopped = false;
    logger.info('Automation resumed');
  }

  updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Agent configuration updated');
  }

  updateRiskLimits(newLimits: Partial<RiskLimits>): void {
    this.riskLimits = { ...this.riskLimits, ...newLimits };
    logger.info('Risk limits updated');
  }
}

async function pollTasksAndSubmit(
  agent: SeiDeFiAgent,
  consoleKit: ConsoleKit,
  chainId: number,
  executorWallet: Wallet,
  registryId: string,
  executorAddress: string
): Promise<boolean> {
  try {
    const response = await consoleKit.executorModule.getTasksQueue();

    if (!response.success || !response.data || response.data.length === 0) {
      logger.info('No pending tasks found');
      return true;
    }

    logger.info(`Found ${response.data.length} pending tasks`);

    for (const task of response.data) {
      try {
        logger.info(`Processing task ${task.taskId} for chain ${task.chainId}`);

        if (task.chainId !== chainId) {
          logger.info(`Skipping task for different chain: ${task.chainId}`);
          continue;
        }

        const executionResult = await agent.executeHandler(task.taskParams);

        if (executionResult.skip) {
          logger.info(`Skipping task ${task.taskId}: ${executionResult.message}`);
          continue;
        }

        // Generate transactions if execution was successful
        const transactions = executionResult.transactions || [];

        if (transactions.length === 0) {
          logger.info(`No transactions to execute for task ${task.taskId}`);
          continue;
        }

        const executorNonce = await executorWallet.getNonce();

        const success = await executeTransaction(
          consoleKit,
          executorWallet,
          registryId,
          task.taskId,
          task.taskParams,
          transactions,
          executorNonce.toString(),
          executorAddress,
          `Yield optimization executed - Expected profit: ${executionResult.expectedProfit} SEI`
        );

        if (success) {
          logger.info(`Task ${task.taskId} executed successfully`);
        } else {
          logger.error(`Failed to execute task ${task.taskId}`);
        }
      } catch (taskError) {
        logger.error(`Error processing task ${task.taskId}:`, taskError);
      }
    }

    return true;
  } catch (error) {
    logger.error('Error polling tasks:', error);
    return false;
  }
}

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
    const metaTxPayload = {
      safe: taskParams.subAccountAddress,
      txs: transactions,
      options: {
        origin: 'sei-defi-agent',
        expedite: false,
        enableOwnedCalldata: true
      }
    };

    const metatxResponse = await consoleKit.transactionModule.buildMetaTx(metaTxPayload);

    if (!metatxResponse.success || !metatxResponse.data) {
      logger.error('Failed to build meta transaction:', metatxResponse.error);
      return false;
    }

    const signedTx = await executorWallet.signTransaction(metatxResponse.data);

    const submitPayload = {
      safe: taskParams.subAccountAddress,
      signature: signedTx,
      tx: metatxResponse.data,
      registryId,
      taskId,
      executorNonce,
      executorAddress,
      trigger: 'sei-agent-automation',
      successMessage,
      metadata: {
        strategy: 'yield-optimization',
        protocols: taskParams.subscription.metadata.preferredProtocols || ['symphony', 'takara', 'silo'],
        riskLevel: taskParams.subscription.metadata.riskTolerance || 'medium'
      }
    };

    const submitResponse = await consoleKit.executorModule.submitTransaction(submitPayload);

    if (!submitResponse.success) {
      logger.error('Failed to submit transaction:', submitResponse.error);
      return false;
    }

    logger.info(`Transaction submitted successfully. TX ID: ${submitResponse.data?.txId}`);
    return true;
  } catch (error) {
    logger.error('Error executing transaction:', error);
    return false;
  }
}

async function main(): Promise<void> {
  try {
    logger.info('Starting Sei DeFi Agent workflow...');

    const agent = new SeiDeFiAgent();
    const chainId = parseInt(process.env.CHAIN_ID || '1329');
    const registryId = process.env.REGISTRY_ID!;
    const executorAddress = process.env.EXECUTOR_ADDRESS!;

    const executorWallet = new Wallet(
      process.env.EXECUTOR_PRIVATE_KEY!,
      new ethers.JsonRpcProvider(process.env.RPC_URL!)
    );

    const pollForever = async (): Promise<boolean> => {
      while (true) {
        const success = await pollTasksAndSubmit(
          agent,
          agent.consoleKit,
          chainId,
          executorWallet,
          registryId,
          executorAddress
        );

        if (!success) {
          logger.error('Polling failed, retrying in 10 seconds...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        } else {
          await new Promise(resolve => setTimeout(resolve, agent.config.pollingInterval));
        }
      }
    };

    const getWorkflowState = async (): Promise<WorkflowStateResponse | undefined> => {
      try {
        const response = await agent.consoleKit.workflowModule.getWorkflowState(registryId);
        return response.success ? response.data : undefined;
      } catch (error) {
        logger.error('Error getting workflow state:', error);
        return undefined;
      }
    };

    const isWorkflowComplete = (workflowState?: WorkflowStateResponse): boolean => {
      return workflowState?.status === 'completed' || workflowState?.status === 'failed';
    };

    await poll(
      pollForever,
      getWorkflowState,
      isWorkflowComplete,
      agent.config.pollingInterval,
      logger
    );

    logger.info('Sei DeFi Agent workflow completed');
  } catch (error) {
    logger.error('Critical error in main workflow:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { SeiDeFiAgent, main }; 