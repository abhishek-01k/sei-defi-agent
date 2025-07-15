import { ConsoleKit, Task, WorkflowStateResponse, WorkflowExecutionStatus } from 'brahma-console-kit';
import { ethers, Wallet } from 'ethers';
import { logger } from '../utils/logger';
import { poll } from '../utils/polling';
import { Address } from 'viem';
import { 
  DynamicAutomationEngine, 
  AutomationScenario, 
  AutomationTrigger, 
  AutomationContext,
  ScenarioExecutionResult
} from './dynamic-automation-engine';

// Define types that are not exported from brahma-console-kit
interface TaskParams {
  executorAddress: Address;
  subAccountAddress: Address;
  executorID: string;
  chainID: number;
  subscription: {
    chainId: number;
    commitHash: string;
    createdAt: string;
    duration: number;
    feeAmount: string;
    feeToken: Address;
    id: string;
    metadata: any;
    registryId: string;
    status: number;
    subAccountAddress: Address;
    tokenInputs: Record<string, string>;
    tokenLimits: Record<string, string>;
  };
  isHostedWorkflow: boolean;
}

interface ExecutionResult {
  skip: boolean;
  message: string;
  gasEstimate: string;
  transactions?: Array<{
    to: Address;
    data: string;
    value: string;
    operation: number;
  }>;
  expectedProfit?: string;
}

interface TaskQueueItem {
  taskId: string;
  chainId: number;
  taskParams: TaskParams;
}

// Enhanced agent workflow with dynamic automation
export class EnhancedSeiDeFiAgent {
  private dynamicEngine: DynamicAutomationEngine;
  private consoleKit: ConsoleKit;
  private executorWallet: Wallet;
  private registryId: string;
  private executorAddress: string;
  private chainId: number;
  private isRunning: boolean = false;

  constructor() {
    this.dynamicEngine = new DynamicAutomationEngine();
    this.consoleKit = new ConsoleKit(
      process.env.BRAHMA_API_KEY!,
      process.env.NETWORK_TYPE || 'mainnet'
    );

    this.registryId = process.env.REGISTRY_ID!;
    this.executorAddress = process.env.EXECUTOR_ADDRESS!;
    this.chainId = parseInt(process.env.CHAIN_ID || '1329');

    this.executorWallet = new Wallet(
      process.env.EXECUTOR_PRIVATE_KEY!,
      new ethers.JsonRpcProvider(process.env.RPC_URL!)
    );

    logger.info('Enhanced Sei DeFi Agent initialized successfully');
  }

  /**
   * Register automation scenarios for a user
   */
  async registerUserAutomation(userAddress: Address, scenarios: AutomationScenario[], globalConfig: any): Promise<void> {
    await this.dynamicEngine.registerAutomationContext(userAddress, scenarios, globalConfig);
    logger.info(`Registered ${scenarios.length} automation scenarios for user: ${userAddress}`);
  }

  /**
   * Create default automation scenarios for a user
   */
  createDefaultScenarios(userAddress: Address, preferences: any): AutomationScenario[] {
    const scenarios: AutomationScenario[] = [];

    // Yield Optimization Scenario
    scenarios.push({
      id: `yield_opt_${Date.now()}`,
      name: 'Yield Optimization',
      description: 'Automatically optimize yield across protocols',
      type: 'yield_optimization',
      enabled: preferences.enableYieldOptimization || true,
      triggers: [
        {
          type: 'time_based',
          condition: 'every_hours',
          value: preferences.yieldOptimizationInterval || 24,
          comparison: 'greater_than'
        },
        {
          type: 'apy_based',
          condition: 'better_apy_available',
          value: preferences.apyThreshold || 2.0,
          comparison: 'greater_than'
        }
      ],
      parameters: {
        targetAPY: preferences.targetAPY || '10.0',
        maxSlippage: preferences.maxSlippage || '0.5',
        riskTolerance: preferences.riskTolerance || 'medium',
        preferredProtocols: preferences.preferredProtocols || ['symphony', 'takara', 'silo'],
        maxPositionSize: preferences.maxPositionSize || '10000'
      },
      riskLevel: preferences.riskTolerance || 'medium',
      priority: 7
    });

    // Portfolio Rebalancing Scenario
    scenarios.push({
      id: `portfolio_rebalance_${Date.now()}`,
      name: 'Portfolio Rebalancing',
      description: 'Maintain target portfolio allocation',
      type: 'portfolio_rebalancing',
      enabled: preferences.enablePortfolioRebalancing || true,
      triggers: [
        {
          type: 'time_based',
          condition: 'every_hours',
          value: preferences.rebalancingInterval || 12,
          comparison: 'greater_than'
        }
      ],
      parameters: {
        targetAllocation: preferences.targetAllocation || {
          'silo_staking': 40,
          'takara_lending': 35,
          'symphony_lp': 25
        },
        rebalanceThreshold: preferences.rebalanceThreshold || 5.0,
        maxSlippage: preferences.maxSlippage || '0.5'
      },
      riskLevel: preferences.riskTolerance || 'medium',
      priority: 6
    });

    // Risk Management Scenario
    scenarios.push({
      id: `risk_mgmt_${Date.now()}`,
      name: 'Risk Management',
      description: 'Monitor and manage portfolio risk',
      type: 'risk_management',
      enabled: preferences.enableRiskManagement || true,
      triggers: [
        {
          type: 'time_based',
          condition: 'every_hours',
          value: preferences.riskCheckInterval || 6,
          comparison: 'greater_than'
        },
        {
          type: 'health_factor',
          condition: 'below_threshold',
          value: preferences.minHealthFactor || 2.0,
          comparison: 'less_than'
        }
      ],
      parameters: {
        maxProtocolExposure: preferences.maxProtocolExposure || 30,
        minHealthFactor: preferences.minHealthFactor || 2.0,
        emergencyStopLoss: preferences.emergencyStopLoss || 10.0
      },
      riskLevel: 'high',
      priority: 9
    });

    // Position Monitoring Scenario
    scenarios.push({
      id: `position_monitor_${Date.now()}`,
      name: 'Position Monitoring',
      description: 'Monitor all positions and provide alerts',
      type: 'position_monitoring',
      enabled: preferences.enablePositionMonitoring || true,
      triggers: [
        {
          type: 'time_based',
          condition: 'every_minutes',
          value: preferences.monitoringInterval || 15,
          comparison: 'greater_than'
        }
      ],
      parameters: {
        checkInterval: preferences.monitoringInterval || 15 * 60 * 1000, // 15 minutes
        thresholds: {
          healthFactor: preferences.minHealthFactor || 2.0,
          apyChange: preferences.apyChangeThreshold || 1.0,
          profitLoss: preferences.profitLossThreshold || 5.0
        },
        alertLevels: ['warning', 'critical']
      },
      riskLevel: 'low',
      priority: 3
    });

    // Liquidation Protection Scenario
    scenarios.push({
      id: `liquidation_protection_${Date.now()}`,
      name: 'Liquidation Protection',
      description: 'Protect against liquidation risks',
      type: 'liquidation_protection',
      enabled: preferences.enableLiquidationProtection || true,
      triggers: [
        {
          type: 'health_factor',
          condition: 'below_threshold',
          value: preferences.liquidationThreshold || 1.5,
          comparison: 'less_than'
        }
      ],
      parameters: {
        minHealthFactor: preferences.liquidationThreshold || 1.5,
        emergencyThreshold: preferences.emergencyThreshold || 1.2,
        protectionActions: ['add_collateral', 'repay_debt', 'close_position']
      },
      riskLevel: 'high',
      priority: 10
    });

    // Profit Taking Scenario
    if (preferences.enableProfitTaking) {
      scenarios.push({
        id: `profit_taking_${Date.now()}`,
        name: 'Profit Taking',
        description: 'Automatically take profits when targets are reached',
        type: 'profit_taking',
        enabled: true,
        triggers: [
          {
            type: 'profit_threshold',
            condition: 'above_threshold',
            value: preferences.profitTakingThreshold || 20.0,
            comparison: 'greater_than'
          }
        ],
        parameters: {
          profitThreshold: preferences.profitTakingThreshold || 20.0,
          takeProfitPercentage: preferences.takeProfitPercentage || 50.0,
          targetAssets: preferences.profitTakingAssets || ['SEI', 'USDC']
        },
        riskLevel: 'medium',
        priority: 5
      });
    }

    // Stop Loss Scenario
    if (preferences.enableStopLoss) {
      scenarios.push({
        id: `stop_loss_${Date.now()}`,
        name: 'Stop Loss',
        description: 'Automatically cut losses when thresholds are reached',
        type: 'stop_loss',
        enabled: true,
        triggers: [
          {
            type: 'loss_threshold',
            condition: 'above_threshold',
            value: preferences.stopLossThreshold || 15.0,
            comparison: 'greater_than'
          }
        ],
        parameters: {
          stopLossThreshold: preferences.stopLossThreshold || 15.0,
          stopLossPercentage: preferences.stopLossPercentage || 100.0,
          targetAssets: preferences.stopLossAssets || ['SEI', 'USDC']
        },
        riskLevel: 'high',
        priority: 8
      });
    }

    return scenarios;
  }

  /**
   * Execute automation handler with dynamic scenarios
   */
  async executeHandler(taskParams: TaskParams): Promise<ExecutionResult> {
    try {
      logger.info(`Executing dynamic automation for: ${taskParams.subAccountAddress}`);

      // Execute automation tasks using the dynamic engine
      const result = await this.dynamicEngine.executeAutomationTasks(taskParams);

      if (result.skip) {
        logger.info(`Skipping automation: ${result.message}`);
        return result;
      }

      logger.info(`Dynamic automation completed: ${result.message}`);
      return result;

    } catch (error) {
      logger.error('Error in dynamic automation execution:', error);
      return {
        skip: true,
        message: `Dynamic automation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        gasEstimate: '0'
      };
    }
  }

  /**
   * Start the automation workflow
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Enhanced Sei DeFi Agent is already running');
      return;
    }

    this.isRunning = true;
    this.dynamicEngine.start();
    
    logger.info('Starting Enhanced Sei DeFi Agent workflow...');

    const pollForever = async (): Promise<boolean> => {
      while (this.isRunning) {
        try {
          const success = await this.pollTasksAndSubmit();
          
          if (!success) {
            logger.error('Polling failed, retrying in 10 seconds...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          } else {
            await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds default
          }
        } catch (error) {
          logger.error('Error in polling loop:', error);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      return true;
    };

    const getWorkflowState = async (): Promise<WorkflowStateResponse | undefined> => {
      try {
        const response = await this.consoleKit.automationContext.fetchWorkflowState(this.registryId);
        return response;
      } catch (error) {
        logger.error('Error getting workflow state:', error);
        return undefined;
      }
    };

    const isWorkflowComplete = (workflowState?: WorkflowStateResponse): boolean => {
      return workflowState?.status === WorkflowExecutionStatus.COMPLETED || 
             workflowState?.status === WorkflowExecutionStatus.FAILED;
    };

    await poll(
      pollForever,
      getWorkflowState,
      isWorkflowComplete,
      30000, // 30 seconds
      logger
    );

    logger.info('Enhanced Sei DeFi Agent workflow completed');
  }

  /**
   * Stop the automation workflow
   */
  stop(): void {
    this.isRunning = false;
    this.dynamicEngine.stop();
    logger.info('Enhanced Sei DeFi Agent workflow stopped');
  }

  /**
   * Poll for tasks and submit them
   */
  private async pollTasksAndSubmit(): Promise<boolean> {
    try {
      const tasks = await this.consoleKit.automationContext.fetchTasks(this.registryId);

      if (!tasks || tasks.length === 0) {
        logger.info('No pending tasks found');
        return true;
      }

      logger.info(`Found ${tasks.length} pending tasks`);

      for (const task of tasks) {
        try {
          logger.info(`Processing task ${task.id} for chain ${task.payload.params.chainID}`);

          if (task.payload.params.chainID !== this.chainId) {
            logger.info(`Skipping task for different chain: ${task.payload.params.chainID}`);
            continue;
          }

          // Execute the task using our dynamic handler
          const executionResult = await this.executeHandler(task.payload.params);

          if (executionResult.skip) {
            logger.info(`Skipping task ${task.id}: ${executionResult.message}`);
            continue;
          }

          // Generate transactions if execution was successful
          const transactions = executionResult.transactions || [];

          if (transactions.length === 0) {
            logger.info(`No transactions to execute for task ${task.id}`);
            continue;
          }

          const executorNonce = await this.executorWallet.getNonce();

          const success = await this.executeTransaction(
            task.id,
            task.payload.params,
            transactions,
            executorNonce.toString(),
            executionResult.message || 'Dynamic automation executed successfully'
          );

          if (success) {
            logger.info(`Task ${task.id} executed successfully`);
          } else {
            logger.error(`Failed to execute task ${task.id}`);
          }
        } catch (taskError) {
          logger.error(`Error processing task ${task.id}:`, taskError);
        }
      }

      return true;
    } catch (error) {
      logger.error('Error polling tasks:', error);
      return false;
    }
  }

  /**
   * Execute transaction through Console Kit
   */
  private async executeTransaction(
    taskId: string,
    taskParams: TaskParams,
    transactions: any[],
    executorNonce: string,
    successMessage: string
  ): Promise<boolean> {
    try {
      // Build meta transaction using coreActions
      const metaTxPayload = {
        chainId: this.chainId,
        data: {
          metadata: {
            origin: 'sei-defi-agent-enhanced',
            strategy: 'dynamic-automation',
            engine: 'enhanced-sei-defi-agent',
            timestamp: Date.now()
          },
          duration: 86400, // 24 hours
          tokenInputs: taskParams.subscription.tokenInputs,
          tokenLimits: taskParams.subscription.tokenLimits,
          registryID: this.registryId,
          ownerAddress: taskParams.subAccountAddress,
          chainId: this.chainId,
        }
      };

      // Submit the task execution result
      const submitResponse = await this.consoleKit.automationContext.submitTask({
        id: taskId,
        registryId: this.registryId,
        payload: {
          task: {
            skip: false,
            skipReason: '',
            executorSignature: '',
            executorNonce,
            executorAddress: this.executorAddress,
            transactions,
            metadata: {
              message: successMessage,
              timestamp: Date.now()
            }
          }
        }
      });

      if (!submitResponse.success) {
        logger.error('Failed to submit task:', submitResponse.message);
        return false;
      }

      logger.info(`Task submitted successfully: ${taskId}`);
      return true;
    } catch (error) {
      logger.error('Error executing transaction:', error);
      return false;
    }
  }

  /**
   * Get automation context for a user
   */
  getAutomationContext(userAddress: Address): AutomationContext | undefined {
    return this.dynamicEngine.getAutomationContext(userAddress);
  }

  /**
   * Update automation scenarios for a user
   */
  updateUserScenarios(userAddress: Address, scenarios: AutomationScenario[]): void {
    const context = this.dynamicEngine.getAutomationContext(userAddress);
    if (context) {
      this.dynamicEngine.updateAutomationContext(userAddress, { scenarios });
    }
  }

  /**
   * Get engine status
   */
  getEngineStatus(): {
    isRunning: boolean;
    registeredUsers: number;
    totalScenarios: number;
  } {
    const contexts = Array.from((this.dynamicEngine as any).automationContexts.values()) as AutomationContext[];
    return {
      isRunning: this.isRunning,
      registeredUsers: contexts.length,
      totalScenarios: contexts.reduce((sum, ctx) => sum + ctx.scenarios.length, 0)
    };
  }
}

// Main execution function
async function main(): Promise<void> {
  try {
    const agent = new EnhancedSeiDeFiAgent();
    await agent.start();
  } catch (error) {
    logger.error('Critical error in enhanced agent workflow:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
} 