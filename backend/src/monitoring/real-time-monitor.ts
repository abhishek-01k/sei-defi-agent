import { EventEmitter } from 'eventemitter3';
import { Address } from 'viem';
import { MonitoringWebSocket, AutomationStatusUpdate, PerformanceMetricsUpdate, TradeUpdate, RiskAlertUpdate, PositionUpdate } from '../websocket/monitoring-websocket';
import { AutomationContext, AutomationScenario, ScenarioExecutionResult } from '../automation/dynamic-automation-engine';

interface SystemMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
  activeConnections: number;
  totalRequests: number;
  errorRate: number;
  lastHealthCheck: number;
}

interface ProtocolMetrics {
  protocol: string;
  totalValueLocked: string;
  activeUsers: number;
  totalTransactions: number;
  averageGasUsed: string;
  successRate: number;
  lastUpdate: number;
}

interface UserMetrics {
  userAddress: Address;
  totalProfit: string;
  totalGasCost: string;
  netProfit: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecution: number;
  activeScenarios: number;
  riskScore: number;
  portfolioValue: string;
  recentTrades: TradeUpdate[];
}

export class RealTimeMonitor extends EventEmitter {
  private wsServer: MonitoringWebSocket;
  private userMetrics: Map<Address, UserMetrics> = new Map();
  private protocolMetrics: Map<string, ProtocolMetrics> = new Map();
  private systemMetrics: SystemMetrics;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private alertThresholds = {
    healthFactor: 1.5,
    profitLoss: -0.05, // 5% loss threshold
    gasUsage: 500000, // High gas usage threshold
    riskScore: 70, // High risk score threshold
    errorRate: 0.1 // 10% error rate threshold
  };

  constructor(wsServer: MonitoringWebSocket) {
    super();
    this.wsServer = wsServer;
    this.systemMetrics = this.initializeSystemMetrics();
    this.initializeProtocolMetrics();
  }

  private initializeSystemMetrics(): SystemMetrics {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: 0,
      activeConnections: 0,
      totalRequests: 0,
      errorRate: 0,
      lastHealthCheck: Date.now()
    };
  }

  private initializeProtocolMetrics(): void {
    const protocols = ['symphony', 'takara', 'silo', 'citrex'];
    protocols.forEach(protocol => {
      this.protocolMetrics.set(protocol, {
        protocol,
        totalValueLocked: '0',
        activeUsers: 0,
        totalTransactions: 0,
        averageGasUsed: '0',
        successRate: 100,
        lastUpdate: Date.now()
      });
    });
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // Start monitoring automation status every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this.updateAutomationStatus();
    }, 5000);

    // Start collecting detailed metrics every 30 seconds
    this.metricsInterval = setInterval(() => {
      this.updateSystemMetrics();
      this.updateProtocolMetrics();
      this.checkRiskAlerts();
    }, 30000);

    console.log('Real-time monitoring started');
  }

  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    console.log('Real-time monitoring stopped');
  }

  private updateAutomationStatus(): void {
    if (!this.isRunning) return;

    const activeScenarios = Array.from(this.userMetrics.values())
      .reduce((sum, user) => sum + user.activeScenarios, 0);

    const status: AutomationStatusUpdate = {
      isRunning: this.isRunning,
      registeredUsers: this.userMetrics.size,
      totalScenarios: activeScenarios,
      activeScenarios,
      lastExecution: this.getLastExecutionTime(),
      systemHealth: this.calculateSystemHealth()
    };

    this.wsServer.broadcastAutomationStatus(status);
  }

  private updateSystemMetrics(): void {
    this.systemMetrics = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to milliseconds
      activeConnections: this.wsServer.getConnectionCount(),
      totalRequests: this.systemMetrics.totalRequests,
      errorRate: this.systemMetrics.errorRate,
      lastHealthCheck: Date.now()
    };
  }

  private updateProtocolMetrics(): void {
    this.protocolMetrics.forEach(async (metrics, protocol) => {
      // Update protocol-specific metrics
      const updatedMetrics = await this.fetchProtocolMetrics(protocol);
      this.protocolMetrics.set(protocol, { ...metrics, ...updatedMetrics });
    });
  }

  private async fetchProtocolMetrics(protocol: string): Promise<Partial<ProtocolMetrics>> {
    // This would fetch real protocol metrics from the blockchain
    // For now, we'll simulate with mock data
    return {
      totalValueLocked: (Math.random() * 1000000).toFixed(2),
      activeUsers: Math.floor(Math.random() * 100),
      totalTransactions: Math.floor(Math.random() * 10000),
      averageGasUsed: (Math.random() * 200000).toFixed(0),
      successRate: 95 + Math.random() * 5,
      lastUpdate: Date.now()
    };
  }

  private checkRiskAlerts(): void {
    this.userMetrics.forEach((metrics, userAddress) => {
      // Check for risk alerts
      if (metrics.riskScore > this.alertThresholds.riskScore) {
        this.sendRiskAlert(userAddress, 'high_risk_score', 'high', 
          `Risk score (${metrics.riskScore}) exceeds threshold`, 
          ['Consider reducing position sizes', 'Diversify across more protocols']);
      }

      const netProfitRatio = parseFloat(metrics.netProfit) / parseFloat(metrics.portfolioValue);
      if (netProfitRatio < this.alertThresholds.profitLoss) {
        this.sendRiskAlert(userAddress, 'profit_loss', 'medium',
          `Portfolio loss of ${(netProfitRatio * 100).toFixed(2)}%`,
          ['Review strategy parameters', 'Consider emergency stop']);
      }
    });
  }

  private sendRiskAlert(userAddress: Address, alertType: string, severity: 'low' | 'medium' | 'high' | 'critical', message: string, recommendations: string[]): void {
    const alert: RiskAlertUpdate = {
      userAddress,
      alertType: alertType as any,
      severity,
      message,
      recommendations,
      timestamp: Date.now()
    };

    this.wsServer.broadcastRiskAlert(alert);
  }

  private getLastExecutionTime(): number {
    let lastExecution = 0;
    this.userMetrics.forEach(metrics => {
      if (metrics.lastExecution > lastExecution) {
        lastExecution = metrics.lastExecution;
      }
    });
    return lastExecution;
  }

  private calculateSystemHealth(): 'healthy' | 'warning' | 'error' {
    const memoryUsage = this.systemMetrics.memoryUsage.heapUsed / this.systemMetrics.memoryUsage.heapTotal;
    const errorRate = this.systemMetrics.errorRate;

    if (memoryUsage > 0.9 || errorRate > 0.2) {
      return 'error';
    } else if (memoryUsage > 0.7 || errorRate > 0.1) {
      return 'warning';
    }
    return 'healthy';
  }

  public recordTradeExecution(userAddress: Address, trade: TradeUpdate): void {
    const userMetrics = this.getOrCreateUserMetrics(userAddress);
    
    // Add to recent trades (keep last 20)
    userMetrics.recentTrades.unshift(trade);
    if (userMetrics.recentTrades.length > 20) {
      userMetrics.recentTrades.pop();
    }

    // Update execution metrics
    userMetrics.totalExecutions++;
    userMetrics.lastExecution = Date.now();
    
    if (trade.status === 'success') {
      userMetrics.successfulExecutions++;
      if (trade.profit) {
        const profit = parseFloat(trade.profit);
        userMetrics.totalProfit = (parseFloat(userMetrics.totalProfit) + profit).toFixed(6);
      }
    } else if (trade.status === 'failed') {
      userMetrics.failedExecutions++;
    }

    // Update gas costs
    const gasCost = parseFloat(trade.gasUsed) * 0.000000001; // Convert to SEI (simplified)
    userMetrics.totalGasCost = (parseFloat(userMetrics.totalGasCost) + gasCost).toFixed(6);

    // Calculate net profit
    userMetrics.netProfit = (parseFloat(userMetrics.totalProfit) - parseFloat(userMetrics.totalGasCost)).toFixed(6);

    // Update metrics
    this.userMetrics.set(userAddress, userMetrics);

    // Broadcast updates
    this.wsServer.broadcastTradeExecution(trade, userAddress);
    this.broadcastPerformanceMetrics(userAddress);
  }

  public recordScenarioExecution(userAddress: Address, scenario: AutomationScenario, result: ScenarioExecutionResult): void {
    const trade: TradeUpdate = {
      id: `${scenario.id}-${Date.now()}`,
      timestamp: Date.now(),
      type: this.mapScenarioToTradeType(scenario.type),
      protocol: scenario.parameters.protocol || 'multiple',
      amount: scenario.parameters.amount || '0',
      token: scenario.parameters.token || 'SEI',
      profit: result.profit,
      gasUsed: result.gasUsed || '0',
      transactionHash: result.transactions?.[0]?.hash || '0x0',
      status: result.success ? 'success' : 'failed'
    };

    this.recordTradeExecution(userAddress, trade);
  }

  private mapScenarioToTradeType(scenarioType: string): TradeUpdate['type'] {
    switch (scenarioType) {
      case 'yield_optimization':
        return 'deposit';
      case 'portfolio_rebalancing':
        return 'swap';
      case 'liquidation_protection':
        return 'repay';
      default:
        return 'deposit';
    }
  }

  public updateUserContext(userAddress: Address, context: AutomationContext): void {
    const userMetrics = this.getOrCreateUserMetrics(userAddress);
    
    userMetrics.activeScenarios = context.scenarios.filter(s => s.enabled).length;
    userMetrics.portfolioValue = context.performanceMetrics.totalProfit;
    userMetrics.totalProfit = context.performanceMetrics.totalProfit;
    userMetrics.totalGasCost = context.performanceMetrics.totalGasCost;
    userMetrics.netProfit = (parseFloat(context.performanceMetrics.totalProfit) - parseFloat(context.performanceMetrics.totalGasCost)).toFixed(6);
    
    this.userMetrics.set(userAddress, userMetrics);
    this.broadcastPerformanceMetrics(userAddress);
  }

  private getOrCreateUserMetrics(userAddress: Address): UserMetrics {
    if (!this.userMetrics.has(userAddress)) {
      this.userMetrics.set(userAddress, {
        userAddress,
        totalProfit: '0',
        totalGasCost: '0',
        netProfit: '0',
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        lastExecution: 0,
        activeScenarios: 0,
        riskScore: 0,
        portfolioValue: '0',
        recentTrades: []
      });
    }
    return this.userMetrics.get(userAddress)!;
  }

  private broadcastPerformanceMetrics(userAddress: Address): void {
    const metrics = this.getOrCreateUserMetrics(userAddress);
    const successRate = metrics.totalExecutions > 0 ? 
      (metrics.successfulExecutions / metrics.totalExecutions) * 100 : 100;

    const update: PerformanceMetricsUpdate = {
      userAddress,
      totalExecutions: metrics.totalExecutions,
      successRate: successRate / 100,
      totalProfit: metrics.totalProfit,
      totalGasCost: metrics.totalGasCost,
      netProfit: metrics.netProfit,
      recentTrades: metrics.recentTrades.slice(0, 10) // Send last 10 trades
    };

    this.wsServer.broadcastPerformanceMetrics(update);
  }

  public updatePositions(userAddress: Address, positions: any[]): void {
    let totalValueUSD = '0';
    const formattedPositions = positions.map(pos => {
      const valueUSD = (parseFloat(pos.amount) * parseFloat(pos.price || '1')).toFixed(2);
      totalValueUSD = (parseFloat(totalValueUSD) + parseFloat(valueUSD)).toFixed(2);
      
      return {
        token: pos.token,
        amount: pos.amount,
        valueUSD,
        apy: pos.apy || '0',
        healthFactor: pos.healthFactor
      };
    });

    const update: PositionUpdate = {
      userAddress,
      protocol: 'multiple',
      positions: formattedPositions,
      totalValueUSD,
      lastUpdate: Date.now()
    };

    this.wsServer.broadcastPositionUpdate(update);
  }

  public getSystemMetrics(): SystemMetrics {
    return this.systemMetrics;
  }

  public getProtocolMetrics(): Map<string, ProtocolMetrics> {
    return this.protocolMetrics;
  }

  public getUserMetrics(userAddress: Address): UserMetrics | undefined {
    return this.userMetrics.get(userAddress);
  }

  public getAllUserMetrics(): Map<Address, UserMetrics> {
    return this.userMetrics;
  }

  public incrementRequestCount(): void {
    this.systemMetrics.totalRequests++;
  }

  public recordError(): void {
    const totalRequests = this.systemMetrics.totalRequests;
    if (totalRequests > 0) {
      this.systemMetrics.errorRate = (this.systemMetrics.errorRate * (totalRequests - 1) + 1) / totalRequests;
    }
  }
}

export default RealTimeMonitor; 