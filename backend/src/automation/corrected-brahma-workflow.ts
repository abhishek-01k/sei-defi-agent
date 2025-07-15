import { 
  ConsoleKit, 
  WorkflowExecutionStatus, 
  WorkflowStateResponse 
} from 'brahma-console-kit';
import { ethers, Wallet } from 'ethers';
import { encodeMulti } from 'ethers-multisend';
import { logger } from '../utils/logger';
import { poll } from '../utils/polling';
import { Address } from 'viem';
import { 
  DynamicAutomationEngine, 
  AutomationScenario, 
  AutomationContext,
  ScenarioExecutionResult
} from './dynamic-automation-engine';
import { BrahmaExecutorRegistration } from './brahma-executor-registration';

// Proper TaskParams interface following Brahma standards
interface TaskParams {
  subAccountAddress: string;
  chainID: number;
  subscription: {
    id: string;
    metadata: {
      baseToken: string;
      targetAPY?: string;
      maxSlippage?: string;
      riskTolerance?: string;
      preferredProtocols?: string[];
      maxPositionSize?: string;
      [key: string]: any;
    };
    tokenInputs: Record<string, string>;
    tokenLimits: Record<string, string>;
  };
}

interface ExecutionResult {
  skip: boolean;
  message: string;
  transactions?: any[];
  gasEstimate?: string;
  expectedProfit?: string;
  riskAssessment?: string;
}

export class CorrectedSeiDeFiAgent {
  private dynamicEngine: DynamicAutomationEngine;
  private consoleKit: ConsoleKit;
  private executorWallet: Wallet;
  private registryId: string;
  private executorAddress: string;
  private chainId: number;
  private isRunning: boolean = false;
  private pollingInterval: number = 30000; // 30 seconds

  constructor(registryId: string) {
    this.registryId = registryId;
    this.chainId = parseInt(process.env.CHAIN_ID || '1329');
    
    // Initialize dynamic engine
    this.dynamicEngine = new DynamicAutomationEngine();
    
    // Initialize Console Kit with proper parameters
    this.consoleKit = new ConsoleKit(
      process.env.BRAHMA_API_KEY!,
      process.env.BRAHMA_API_URL || 'https://dev.console.fi/'
    );

    // Initialize executor wallet
    this.executorWallet = new Wallet(
      process.env.EXECUTOR_PRIVATE_KEY!,
      new ethers.JsonRpcProvider(process.env.RPC_URL!)
    );
    
    this.executorAddress = this.executorWallet.address;

    logger.info('Corrected Sei DeFi Agent initialized successfully');
    logger.info(`Registry ID: ${this.registryId}`);
    logger.info(`Executor address: ${this.executorAddress}`);
    logger.info(`Chain ID: ${this.chainId}`);
  }

  /**
   * Execute automation handler following Brahma patterns
   */
  async executeHandler(taskParams: TaskParams): Promise<ExecutionResult> {
    try {
      logger.info(`Executing automation for: ${taskParams.subAccountAddress}`);

      // Validate task parameters
      if (!this.validateTaskParams(taskParams)) {
        return {
          skip: true,
          message: 'Invalid task parameters',
          gasEstimate: '0'
        };
      }

      // Execute automation tasks using the dynamic engine
      const result = await this.dynamicEngine.executeAutomationTasks({
        executorAddress: this.executorAddress as Address,
        subAccountAddress: taskParams.subAccountAddress as Address,
        executorID: this.registryId,
        chainID: taskParams.chainID,
        subscription: taskParams.subscription,
        isHostedWorkflow: true
      });

      if (result.skip) {
        logger.info(`Skipping automation: ${result.message}`);
        return {
          skip: true,
          message: result.message,
          gasEstimate: result.gasEstimate || '0'
        };
      }

      logger.info(`Dynamic automation completed: ${result.message}`);
      return {
        skip: false,
        message: result.message,
        transactions: result.transactions,
        gasEstimate: result.gasEstimate || '0',
        expectedProfit: result.expectedProfit,
        riskAssessment: result.metadata ? JSON.stringify(result.metadata) : undefined
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

  /**
   * Poll for tasks and submit them following Brahma patterns
   */
  private async pollTasksAndSubmit(): Promise<boolean> {
    try {
      // Fetch pending tasks using proper Brahma API
      const tasks = await this.consoleKit.automationContext.fetchTasks(
        this.registryId,
        0, // offset
        10 // limit
      );

      if (!tasks || tasks.length === 0) {
        logger.info('No pending tasks found');
        return true;
      }

      logger.info(`Found ${tasks.length} pending tasks`);

      // Process each task
      for (const task of tasks) {
        try {
          const { id, payload: { params: taskParams } } = task;
          
          logger.info(`Processing task ${id} for subaccount ${taskParams.subAccountAddress}`);

          if (taskParams.chainID !== this.chainId) {
            logger.info(`Skipping task for different chain: ${taskParams.chainID}`);
            continue;
          }

          // Execute strategy handler
          const result = await this.executeHandler(taskParams);

          if (result.skip) {
            logger.info(`Skipping task ${id}: ${result.message}`);
            continue;
          }

          const transactions = result.transactions || [];
          if (transactions.length === 0) {
            logger.info(`No transactions to execute for task ${id}`);
            continue;
          }

          // Get executor nonce using proper Brahma API
          const executorNonce = await this.consoleKit.automationContext.fetchExecutorNonce(
            taskParams.subAccountAddress,
            this.executorAddress,
            this.chainId
          );

          logger.info(`Executor nonce: ${executorNonce}`);

          // Execute transaction using proper Brahma workflow
          const success = await this.executeTransaction(
            id,
            taskParams,
            transactions,
            executorNonce,
            result.message || 'Dynamic automation executed successfully'
          );

          if (success) {
            logger.info(`Task ${id} executed successfully`);
          } else {
            logger.error(`Failed to execute task ${id}`);
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
   * Execute transaction following proper Brahma patterns
   */
  private async executeTransaction(
    taskId: string,
    taskParams: TaskParams,
    transactions: any[],
    executorNonce: string,
    successMessage: string
  ): Promise<boolean> {
    try {
      // Handle multiple transactions using encodeMulti (from reference)
      let transaction = transactions.length > 1
        ? encodeMulti(transactions, this.consoleKit.getContractAddress("MULTI_SEND"))
        : transactions[0];
      
      // Ensure proper transaction format
      transaction = {
        ...transaction,
        value: BigInt(transaction.value || 0).toString()
      };

      logger.info('Transaction prepared:', transaction);

      // Generate executable digest following Brahma patterns
      const { domain, message, types } =
        await this.consoleKit.automationContext.generateExecutableDigest712Message({
          account: taskParams.subAccountAddress,
          chainId: taskParams.chainID,
          data: transaction.data,
          executor: this.executorAddress,
          nonce: executorNonce,
          operation: transaction.operation || 0,
          pluginAddress: this.consoleKit.getContractAddress("EXECUTOR_PLUGIN"),
          to: transaction.to,
          value: transaction.value || "0"
        });

      // Sign digest
      const executionDigestSignature = await this.executorWallet.signTypedData(
        domain,
        types,
        message
      );

      logger.info('Submitting task...');

      // Submit task using proper Brahma format
      await this.consoleKit.automationContext.submitTask({
        id: taskId,
        payload: {
          task: {
            executable: {
              callType: transaction.operation || 0,
              data: transaction.data,
              to: transaction.to,
              value: transaction.value || "0"
            },
            executorSignature: executionDigestSignature,
            executor: this.executorAddress,
            skip: false,
            skipReason: "",
            subaccount: taskParams.subAccountAddress
          }
        },
        registryId: this.registryId
      });

      // Monitor workflow state following Brahma patterns
      const getWorkflowState = async (): Promise<WorkflowStateResponse | undefined> => {
        return await this.consoleKit.automationContext.fetchWorkflowState(taskId);
      };

      const isWorkflowComplete = (workflowState?: WorkflowStateResponse): boolean =>
        workflowState?.status === WorkflowExecutionStatus.RUNNING;

      try {
        const workflowState = await poll<WorkflowStateResponse>(
          getWorkflowState,
          isWorkflowComplete,
          5000 // 5 second polling interval
        );
        
        logger.info(
          `Task completed: ${successMessage} - workflow state: ${workflowState?.status}; txHash: ${workflowState?.out?.outputTxHash}`
        );
        
        return true;
      } catch (error) {
        logger.error("Workflow monitoring failed:", error);
        return false;
      }

    } catch (error) {
      logger.error('Error executing transaction:', error);
      return false;
    }
  }

  /**
   * Validate task parameters
   */
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

    return true;
  }

  /**
   * Start the automation workflow
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Corrected Sei DeFi Agent is already running');
      return;
    }

    this.isRunning = true;
    this.dynamicEngine.start();
    
    logger.info('Starting Corrected Sei DeFi Agent workflow...');

    const pollForever = async (): Promise<boolean> => {
      while (this.isRunning) {
        try {
          const success = await this.pollTasksAndSubmit();
          
          if (!success) {
            logger.error('Polling failed, retrying in 10 seconds...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          } else {
            await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
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
      this.pollingInterval,
      logger
    );

    logger.info('Corrected Sei DeFi Agent workflow completed');
  }

  /**
   * Stop the automation workflow
   */
  stop(): void {
    this.isRunning = false;
    this.dynamicEngine.stop();
    logger.info('Corrected Sei DeFi Agent workflow stopped');
  }

  /**
   * Register automation scenarios for a user
   */
  async registerUserAutomation(
    userAddress: Address, 
    scenarios: AutomationScenario[], 
    globalConfig: any
  ): Promise<void> {
    await this.dynamicEngine.registerAutomationContext(userAddress, scenarios, globalConfig);
    logger.info(`Registered ${scenarios.length} automation scenarios for user: ${userAddress}`);
  }

  /**
   * Create default automation scenarios
   */
  createDefaultScenarios(userAddress: Address, preferences: any): AutomationScenario[] {
    // Implementation would be similar to the enhanced-agent-workflow.ts
    // but following proper Brahma patterns
    return []; // Placeholder
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

// Main execution function for proper setup
async function main(): Promise<void> {
  try {
    logger.info('Initializing Corrected Sei DeFi Agent...');

    // First, ensure executor is registered (one-time setup)
    const registration = new BrahmaExecutorRegistration(
      process.env.BRAHMA_API_KEY!,
      process.env.BRAHMA_API_URL || 'https://dev.console.fi/',
      process.env.EXECUTOR_PRIVATE_KEY!,
      process.env.RPC_URL || 'https://evm-rpc.sei-apis.com',
      parseInt(process.env.CHAIN_ID || '1329')
    );

    let registryId = process.env.REGISTRY_ID;
    
    if (!registryId) {
      logger.info('Registry ID not found, registering executor...');
      const result = await registration.completeRegistration(
        process.env.EXECUTOR_CLIENT_ID || 'sei-defi-agent'
      );
      registryId = result.registryId;
      logger.info(`New registry ID: ${registryId}`);
      logger.info('Please update your .env file with REGISTRY_ID=' + registryId);
    }

    // Start the corrected agent
    const agent = new CorrectedSeiDeFiAgent(registryId!);
    await agent.start();
  } catch (error) {
    logger.error('Critical error in corrected agent workflow:', error);
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

export { CorrectedSeiDeFiAgent }; 