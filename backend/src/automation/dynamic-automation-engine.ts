import { ConsoleKit, TaskParams, ExecutionResult } from 'brahma-console-kit';
import { ethers, Wallet } from 'ethers';
import { logger } from '../utils/logger';
import { Address } from 'viem';
import SeiDeFiAgentKit, { AgentKitConfig, YieldOptimizationRequest } from '../agent-kit';
import { ModelProviderName } from '../types';

// Enhanced configuration interfaces
export interface AutomationScenario {
  id: string;
  name: string;
  description: string;
  type: 'yield_optimization' | 'portfolio_rebalancing' | 'risk_management' | 'position_monitoring' | 'liquidation_protection' | 'profit_taking' | 'stop_loss';
  enabled: boolean;
  triggers: AutomationTrigger[];
  parameters: Record<string, any>;
  riskLevel: 'low' | 'medium' | 'high';
  priority: number;
}

export interface AutomationTrigger {
  type: 'time_based' | 'price_based' | 'apy_based' | 'health_factor' | 'profit_threshold' | 'loss_threshold';
  condition: string;
  value: number;
  comparison: 'greater_than' | 'less_than' | 'equals' | 'percentage_change';
}

export interface AutomationContext {
  userAddress: Address;
  chainId: number;
  scenarios: AutomationScenario[];
  globalConfig: {
    maxSlippage: number;
    riskTolerance: 'low' | 'medium' | 'high';
    emergencyStopLoss: number;
    maxGasPrice: string;
    preferredProtocols: string[];
  };
  performanceMetrics: {
    totalExecutions: number;
    successRate: number;
    totalProfit: string;
    totalGasCost: string;
    lastExecution: number;
  };
}

export interface ScenarioExecutionResult {
  scenarioId: string;
  scenarioName: string;
  success: boolean;
  executed: boolean;
  message: string;
  transactions?: any[];
  profit?: string;
  gasUsed?: string;
  recommendations?: string[];
  nextCheck?: number;
}

export class DynamicAutomationEngine {
  private agentKit: SeiDeFiAgentKit;
  private consoleKit: ConsoleKit;
  private automationContexts: Map<string, AutomationContext> = new Map();
  private isRunning: boolean = false;

  constructor() {
    // Initialize agent kit
    const agentKitConfig: AgentKitConfig = {
      privateKey: process.env.PRIVATE_KEY!,
      openaiApiKey: process.env.OPENAI_API_KEY!,
      rpcUrl: process.env.RPC_URL || 'https://evm-rpc.sei-apis.com',
      modelProvider: ModelProviderName.OPENAI,
      temperature: 0,
      model: "gpt-4o"
    };

    this.agentKit = new SeiDeFiAgentKit(agentKitConfig);
    
    // Initialize Console Kit
    this.consoleKit = new ConsoleKit(
      process.env.BRAHMA_API_KEY!,
      process.env.NETWORK_TYPE || 'mainnet'
    );

    logger.info('Dynamic Automation Engine initialized successfully');
  }

  /**
   * Register a new automation context for a user
   */
  async registerAutomationContext(userAddress: Address, scenarios: AutomationScenario[], globalConfig: any): Promise<void> {
    const context: AutomationContext = {
      userAddress,
      chainId: parseInt(process.env.CHAIN_ID || '1329'),
      scenarios: scenarios.sort((a, b) => b.priority - a.priority), // Sort by priority
      globalConfig,
      performanceMetrics: {
        totalExecutions: 0,
        successRate: 0,
        totalProfit: '0',
        totalGasCost: '0',
        lastExecution: 0
      }
    };

    this.automationContexts.set(userAddress, context);
    logger.info(`Registered automation context for user: ${userAddress}`);
  }

  /**
   * Execute automation tasks for a specific user
   */
  async executeAutomationTasks(taskParams: TaskParams): Promise<ExecutionResult> {
    const userAddress = taskParams.subAccountAddress as Address;
    const context = this.automationContexts.get(userAddress);

    if (!context) {
      logger.error(`No automation context found for user: ${userAddress}`);
      return {
        skip: true,
        message: 'No automation context found for user',
        gasEstimate: '0'
      };
    }

    logger.info(`Executing automation tasks for user: ${userAddress}`);
    
    const results: ScenarioExecutionResult[] = [];
    let totalTransactions: any[] = [];
    let totalProfit = '0';
    let totalGasUsed = '0';

    // Execute scenarios based on priority
    for (const scenario of context.scenarios) {
      if (!scenario.enabled) continue;

      try {
        // Check if triggers are met
        const triggersActive = await this.checkScenarioTriggers(scenario, context);
        
        if (!triggersActive) {
          results.push({
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            success: true,
            executed: false,
            message: 'Triggers not met, skipping scenario'
          });
          continue;
        }

        // Execute scenario
        const result = await this.executeScenario(scenario, context, taskParams);
        results.push(result);

        if (result.success && result.executed && result.transactions) {
          totalTransactions.push(...result.transactions);
          totalProfit = (parseFloat(totalProfit) + parseFloat(result.profit || '0')).toString();
          totalGasUsed = (parseFloat(totalGasUsed) + parseFloat(result.gasUsed || '0')).toString();
        }

        // Update performance metrics
        await this.updatePerformanceMetrics(context, result);

        // If it's a high-priority scenario and executed successfully, may skip lower priority ones
        if (scenario.priority > 8 && result.executed) {
          logger.info(`High priority scenario ${scenario.name} executed, skipping lower priority scenarios`);
          break;
        }

      } catch (error) {
        logger.error(`Error executing scenario ${scenario.name}:`, error);
        results.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          success: false,
          executed: false,
          message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    // Generate summary
    const executedScenarios = results.filter(r => r.executed);
    const successfulScenarios = results.filter(r => r.success && r.executed);
    
    const summary = {
      totalScenarios: results.length,
      executedScenarios: executedScenarios.length,
      successfulScenarios: successfulScenarios.length,
      totalProfit,
      totalGasUsed,
      scenarios: results
    };

    if (totalTransactions.length > 0) {
      return {
        skip: false,
        message: `Executed ${executedScenarios.length} scenarios successfully`,
        transactions: totalTransactions,
        gasEstimate: totalGasUsed,
        expectedProfit: totalProfit,
        metadata: summary
      };
    } else {
      return {
        skip: true,
        message: 'No scenarios required execution',
        gasEstimate: '0',
        metadata: summary
      };
    }
  }

  /**
   * Check if scenario triggers are met
   */
  private async checkScenarioTriggers(scenario: AutomationScenario, context: AutomationContext): Promise<boolean> {
    for (const trigger of scenario.triggers) {
      const triggerMet = await this.evaluateTrigger(trigger, scenario, context);
      if (!triggerMet) {
        return false; // All triggers must be met
      }
    }
    return true;
  }

  /**
   * Evaluate individual trigger
   */
  private async evaluateTrigger(trigger: AutomationTrigger, scenario: AutomationScenario, context: AutomationContext): Promise<boolean> {
    try {
      switch (trigger.type) {
        case 'time_based':
          return this.evaluateTimeTrigger(trigger, scenario);
        
        case 'price_based':
          return await this.evaluatePriceTrigger(trigger, scenario, context);
        
        case 'apy_based':
          return await this.evaluateAPYTrigger(trigger, scenario, context);
        
        case 'health_factor':
          return await this.evaluateHealthFactorTrigger(trigger, scenario, context);
        
        case 'profit_threshold':
          return await this.evaluateProfitTrigger(trigger, scenario, context);
        
        case 'loss_threshold':
          return await this.evaluateLossTrigger(trigger, scenario, context);
        
        default:
          logger.warn(`Unknown trigger type: ${trigger.type}`);
          return false;
      }
    } catch (error) {
      logger.error(`Error evaluating trigger ${trigger.type}:`, error);
      return false;
    }
  }

  /**
   * Execute specific scenario
   */
  private async executeScenario(scenario: AutomationScenario, context: AutomationContext, taskParams: TaskParams): Promise<ScenarioExecutionResult> {
    logger.info(`Executing scenario: ${scenario.name}`);

    switch (scenario.type) {
      case 'yield_optimization':
        return await this.executeYieldOptimization(scenario, context, taskParams);
      
      case 'portfolio_rebalancing':
        return await this.executePortfolioRebalancing(scenario, context, taskParams);
      
      case 'risk_management':
        return await this.executeRiskManagement(scenario, context, taskParams);
      
      case 'position_monitoring':
        return await this.executePositionMonitoring(scenario, context, taskParams);
      
      case 'liquidation_protection':
        return await this.executeLiquidationProtection(scenario, context, taskParams);
      
      case 'profit_taking':
        return await this.executeProfitTaking(scenario, context, taskParams);
      
      case 'stop_loss':
        return await this.executeStopLoss(scenario, context, taskParams);
      
      default:
        return {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          success: false,
          executed: false,
          message: `Unknown scenario type: ${scenario.type}`
        };
    }
  }

  /**
   * Execute yield optimization scenario
   */
  private async executeYieldOptimization(scenario: AutomationScenario, context: AutomationContext, taskParams: TaskParams): Promise<ScenarioExecutionResult> {
    try {
      const optimizationRequest: YieldOptimizationRequest = {
        userAddress: context.userAddress,
        baseToken: scenario.parameters.baseToken || taskParams.subscription.metadata.baseToken,
        targetAPY: scenario.parameters.targetAPY,
        maxSlippage: scenario.parameters.maxSlippage || context.globalConfig.maxSlippage.toString(),
        riskTolerance: scenario.parameters.riskTolerance || context.globalConfig.riskTolerance,
        preferredProtocols: scenario.parameters.preferredProtocols || context.globalConfig.preferredProtocols,
        maxPositionSize: scenario.parameters.maxPositionSize
      };

      const result = await this.agentKit.optimizeYield(optimizationRequest);

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: result.success,
        executed: result.success,
        message: result.success ? 'Yield optimization completed successfully' : `Yield optimization failed: ${result.error}`,
        transactions: result.transactionHash ? [{ hash: result.transactionHash }] : [],
        profit: result.profit,
        gasUsed: result.gasUsed,
        recommendations: result.recommendations
      };
    } catch (error) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: false,
        executed: false,
        message: `Yield optimization error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute portfolio rebalancing scenario
   */
  private async executePortfolioRebalancing(scenario: AutomationScenario, context: AutomationContext, taskParams: TaskParams): Promise<ScenarioExecutionResult> {
    try {
      const rebalancingStrategy = `
        Rebalance portfolio for user ${context.userAddress}:
        - Target allocation: ${JSON.stringify(scenario.parameters.targetAllocation)}
        - Rebalance threshold: ${scenario.parameters.rebalanceThreshold}%
        - Max slippage: ${context.globalConfig.maxSlippage}%
        - Risk tolerance: ${context.globalConfig.riskTolerance}
        
        Analyze current positions and rebalance if deviation exceeds threshold.
      `;

      const result = await this.agentKit.executeStrategy(rebalancingStrategy, {
        userAddress: context.userAddress,
        targetAllocation: scenario.parameters.targetAllocation,
        rebalanceThreshold: scenario.parameters.rebalanceThreshold,
        maxSlippage: context.globalConfig.maxSlippage,
        riskTolerance: context.globalConfig.riskTolerance
      });

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: result.success,
        executed: result.success,
        message: result.success ? 'Portfolio rebalancing completed' : `Portfolio rebalancing failed: ${result.error}`,
        recommendations: result.recommendations,
        profit: result.profit,
        gasUsed: result.gasUsed
      };
    } catch (error) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: false,
        executed: false,
        message: `Portfolio rebalancing error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute risk management scenario
   */
  private async executeRiskManagement(scenario: AutomationScenario, context: AutomationContext, taskParams: TaskParams): Promise<ScenarioExecutionResult> {
    try {
      const riskAssessment = await this.agentKit.assessRisk(context.userAddress);
      
      const riskManagementStrategy = `
        Risk management for user ${context.userAddress}:
        - Current risk assessment: ${riskAssessment}
        - Emergency stop loss: ${context.globalConfig.emergencyStopLoss}%
        - Max protocol exposure: ${scenario.parameters.maxProtocolExposure}%
        - Min health factor: ${scenario.parameters.minHealthFactor}
        
        Take appropriate risk mitigation actions based on assessment.
      `;

      const result = await this.agentKit.executeStrategy(riskManagementStrategy, {
        userAddress: context.userAddress,
        currentRiskAssessment: riskAssessment,
        emergencyStopLoss: context.globalConfig.emergencyStopLoss,
        maxProtocolExposure: scenario.parameters.maxProtocolExposure,
        minHealthFactor: scenario.parameters.minHealthFactor
      });

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: result.success,
        executed: result.success,
        message: result.success ? 'Risk management actions completed' : `Risk management failed: ${result.error}`,
        recommendations: result.recommendations,
        profit: result.profit,
        gasUsed: result.gasUsed
      };
    } catch (error) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: false,
        executed: false,
        message: `Risk management error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute position monitoring scenario
   */
  private async executePositionMonitoring(scenario: AutomationScenario, context: AutomationContext, taskParams: TaskParams): Promise<ScenarioExecutionResult> {
    try {
      const monitoringStrategy = `
        Monitor positions for user ${context.userAddress}:
        - Check health factors across all positions
        - Monitor APY changes for lending positions
        - Check for liquidation risks
        - Report on position performance
        
        Provide detailed status report and recommendations.
      `;

      const result = await this.agentKit.executeStrategy(monitoringStrategy, {
        userAddress: context.userAddress,
        monitoringThresholds: scenario.parameters.thresholds,
        alertLevels: scenario.parameters.alertLevels
      });

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: result.success,
        executed: false, // Monitoring doesn't execute transactions
        message: result.success ? 'Position monitoring completed' : `Position monitoring failed: ${result.error}`,
        recommendations: result.recommendations,
        nextCheck: Date.now() + (scenario.parameters.checkInterval || 300000) // 5 minutes default
      };
    } catch (error) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: false,
        executed: false,
        message: `Position monitoring error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute liquidation protection scenario
   */
  private async executeLiquidationProtection(scenario: AutomationScenario, context: AutomationContext, taskParams: TaskParams): Promise<ScenarioExecutionResult> {
    try {
      const protectionStrategy = `
        Liquidation protection for user ${context.userAddress}:
        - Min health factor: ${scenario.parameters.minHealthFactor}
        - Emergency threshold: ${scenario.parameters.emergencyThreshold}
        - Protection actions: ${JSON.stringify(scenario.parameters.protectionActions)}
        
        Check all positions for liquidation risk and take protective actions if needed.
      `;

      const result = await this.agentKit.executeStrategy(protectionStrategy, {
        userAddress: context.userAddress,
        minHealthFactor: scenario.parameters.minHealthFactor,
        emergencyThreshold: scenario.parameters.emergencyThreshold,
        protectionActions: scenario.parameters.protectionActions
      });

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: result.success,
        executed: result.success,
        message: result.success ? 'Liquidation protection completed' : `Liquidation protection failed: ${result.error}`,
        recommendations: result.recommendations,
        profit: result.profit,
        gasUsed: result.gasUsed
      };
    } catch (error) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: false,
        executed: false,
        message: `Liquidation protection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute profit taking scenario
   */
  private async executeProfitTaking(scenario: AutomationScenario, context: AutomationContext, taskParams: TaskParams): Promise<ScenarioExecutionResult> {
    try {
      const profitTakingStrategy = `
        Profit taking for user ${context.userAddress}:
        - Profit threshold: ${scenario.parameters.profitThreshold}%
        - Take profit percentage: ${scenario.parameters.takeProfitPercentage}%
        - Target assets: ${JSON.stringify(scenario.parameters.targetAssets)}
        
        Check for profitable positions and take profits according to strategy.
      `;

      const result = await this.agentKit.executeStrategy(profitTakingStrategy, {
        userAddress: context.userAddress,
        profitThreshold: scenario.parameters.profitThreshold,
        takeProfitPercentage: scenario.parameters.takeProfitPercentage,
        targetAssets: scenario.parameters.targetAssets
      });

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: result.success,
        executed: result.success,
        message: result.success ? 'Profit taking completed' : `Profit taking failed: ${result.error}`,
        recommendations: result.recommendations,
        profit: result.profit,
        gasUsed: result.gasUsed
      };
    } catch (error) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: false,
        executed: false,
        message: `Profit taking error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute stop loss scenario
   */
  private async executeStopLoss(scenario: AutomationScenario, context: AutomationContext, taskParams: TaskParams): Promise<ScenarioExecutionResult> {
    try {
      const stopLossStrategy = `
        Stop loss for user ${context.userAddress}:
        - Stop loss threshold: ${scenario.parameters.stopLossThreshold}%
        - Stop loss percentage: ${scenario.parameters.stopLossPercentage}%
        - Target assets: ${JSON.stringify(scenario.parameters.targetAssets)}
        
        Check for losing positions and execute stop losses according to strategy.
      `;

      const result = await this.agentKit.executeStrategy(stopLossStrategy, {
        userAddress: context.userAddress,
        stopLossThreshold: scenario.parameters.stopLossThreshold,
        stopLossPercentage: scenario.parameters.stopLossPercentage,
        targetAssets: scenario.parameters.targetAssets
      });

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: result.success,
        executed: result.success,
        message: result.success ? 'Stop loss completed' : `Stop loss failed: ${result.error}`,
        recommendations: result.recommendations,
        profit: result.profit,
        gasUsed: result.gasUsed
      };
    } catch (error) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: false,
        executed: false,
        message: `Stop loss error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Trigger evaluation methods
  private evaluateTimeTrigger(trigger: AutomationTrigger, scenario: AutomationScenario): boolean {
    const now = Date.now();
    const interval = trigger.value * 1000; // Convert to milliseconds
    const lastExecution = scenario.parameters.lastExecution || 0;
    
    return (now - lastExecution) >= interval;
  }

  private async evaluatePriceTrigger(trigger: AutomationTrigger, scenario: AutomationScenario, context: AutomationContext): Promise<boolean> {
    // Implementation would fetch current price and compare with trigger value
    // For now, return true as placeholder
    return true;
  }

  private async evaluateAPYTrigger(trigger: AutomationTrigger, scenario: AutomationScenario, context: AutomationContext): Promise<boolean> {
    // Implementation would fetch current APY and compare with trigger value
    // For now, return true as placeholder
    return true;
  }

  private async evaluateHealthFactorTrigger(trigger: AutomationTrigger, scenario: AutomationScenario, context: AutomationContext): Promise<boolean> {
    // Implementation would fetch current health factor and compare with trigger value
    // For now, return true as placeholder
    return true;
  }

  private async evaluateProfitTrigger(trigger: AutomationTrigger, scenario: AutomationScenario, context: AutomationContext): Promise<boolean> {
    // Implementation would calculate current profit and compare with trigger value
    // For now, return true as placeholder
    return true;
  }

  private async evaluateLossTrigger(trigger: AutomationTrigger, scenario: AutomationScenario, context: AutomationContext): Promise<boolean> {
    // Implementation would calculate current loss and compare with trigger value
    // For now, return true as placeholder
    return true;
  }

  private async updatePerformanceMetrics(context: AutomationContext, result: ScenarioExecutionResult): Promise<void> {
    context.performanceMetrics.totalExecutions++;
    context.performanceMetrics.lastExecution = Date.now();
    
    if (result.success) {
      const successRate = (context.performanceMetrics.successRate * (context.performanceMetrics.totalExecutions - 1) + 1) / context.performanceMetrics.totalExecutions;
      context.performanceMetrics.successRate = successRate;
    }
    
    if (result.profit) {
      context.performanceMetrics.totalProfit = (parseFloat(context.performanceMetrics.totalProfit) + parseFloat(result.profit)).toString();
    }
    
    if (result.gasUsed) {
      context.performanceMetrics.totalGasCost = (parseFloat(context.performanceMetrics.totalGasCost) + parseFloat(result.gasUsed)).toString();
    }
  }

  /**
   * Get automation context for a user
   */
  getAutomationContext(userAddress: Address): AutomationContext | undefined {
    return this.automationContexts.get(userAddress);
  }

  /**
   * Update automation context for a user
   */
  updateAutomationContext(userAddress: Address, context: Partial<AutomationContext>): void {
    const existingContext = this.automationContexts.get(userAddress);
    if (existingContext) {
      this.automationContexts.set(userAddress, { ...existingContext, ...context });
    }
  }

  /**
   * Start automation engine
   */
  start(): void {
    this.isRunning = true;
    logger.info('Dynamic Automation Engine started');
  }

  /**
   * Stop automation engine
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Dynamic Automation Engine stopped');
  }

  /**
   * Check if engine is running
   */
  isEngineRunning(): boolean {
    return this.isRunning;
  }
} 