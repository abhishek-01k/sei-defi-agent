import WebSocket from 'ws';
import { Server } from 'http';
import { EventEmitter } from 'eventemitter3';
import { Address } from 'viem';

export interface MonitoringData {
  type: 'automation_status' | 'performance_metrics' | 'trade_execution' | 'risk_alert' | 'position_update';
  timestamp: number;
  userAddress?: Address;
  data: any;
}

export interface AutomationStatusUpdate {
  isRunning: boolean;
  registeredUsers: number;
  totalScenarios: number;
  activeScenarios: number;
  lastExecution?: number;
  systemHealth: 'healthy' | 'warning' | 'error';
}

export interface PerformanceMetricsUpdate {
  userAddress: Address;
  totalExecutions: number;
  successRate: number;
  totalProfit: string;
  totalGasCost: string;
  netProfit: string;
  recentTrades: TradeUpdate[];
}

export interface TradeUpdate {
  id: string;
  timestamp: number;
  type: 'deposit' | 'withdraw' | 'swap' | 'stake' | 'unstake' | 'borrow' | 'repay';
  protocol: string;
  amount: string;
  token: string;
  profit?: string;
  gasUsed: string;
  transactionHash: string;
  status: 'pending' | 'success' | 'failed';
}

export interface RiskAlertUpdate {
  userAddress: Address;
  alertType: 'liquidation_risk' | 'concentration_risk' | 'health_factor_warning' | 'protocol_risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  recommendations: string[];
  timestamp: number;
}

export interface PositionUpdate {
  userAddress: Address;
  protocol: string;
  positions: {
    token: string;
    amount: string;
    valueUSD: string;
    apy: string;
    healthFactor?: string;
  }[];
  totalValueUSD: string;
  lastUpdate: number;
}

export class MonitoringWebSocket extends EventEmitter {
  private wss: WebSocket.Server;
  private clients: Map<WebSocket, { userAddress?: Address; subscriptions: string[] }> = new Map();
  private isRunning: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    super();
    this.wss = new WebSocket.Server({ server, path: '/ws/monitoring' });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('New WebSocket connection established');
      
      // Initialize client
      this.clients.set(ws, { subscriptions: [] });

      // Handle incoming messages
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send initial connection success
      ws.send(JSON.stringify({
        type: 'connection_established',
        timestamp: Date.now(),
        message: 'Connected to monitoring WebSocket'
      }));
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  private handleClientMessage(ws: WebSocket, message: any): void {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        this.handleSubscription(ws, message.subscriptions, message.userAddress);
        break;
      case 'unsubscribe':
        this.handleUnsubscription(ws, message.subscriptions);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      default:
        ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
  }

  private handleSubscription(ws: WebSocket, subscriptions: string[], userAddress?: Address): void {
    const client = this.clients.get(ws);
    if (!client) return;

    client.subscriptions = [...new Set([...client.subscriptions, ...subscriptions])];
    if (userAddress) {
      client.userAddress = userAddress;
    }

    ws.send(JSON.stringify({
      type: 'subscription_confirmed',
      subscriptions: client.subscriptions,
      userAddress: client.userAddress,
      timestamp: Date.now()
    }));

    console.log(`Client subscribed to: ${subscriptions.join(', ')}`);
  }

  private handleUnsubscription(ws: WebSocket, subscriptions: string[]): void {
    const client = this.clients.get(ws);
    if (!client) return;

    client.subscriptions = client.subscriptions.filter(sub => !subscriptions.includes(sub));

    ws.send(JSON.stringify({
      type: 'unsubscription_confirmed',
      subscriptions: client.subscriptions,
      timestamp: Date.now()
    }));

    console.log(`Client unsubscribed from: ${subscriptions.join(', ')}`);
  }

  public broadcast(data: MonitoringData): void {
    if (!this.isRunning) return;

    const message = JSON.stringify(data);
    
    this.clients.forEach((client, ws) => {
      // Check if client is subscribed to this type of data
      if (client.subscriptions.includes(data.type)) {
        // For user-specific data, only send to relevant user
        if (data.userAddress && client.userAddress !== data.userAddress) {
          return;
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    });
  }

  public broadcastAutomationStatus(update: AutomationStatusUpdate): void {
    this.broadcast({
      type: 'automation_status',
      timestamp: Date.now(),
      data: update
    });
  }

  public broadcastPerformanceMetrics(update: PerformanceMetricsUpdate): void {
    this.broadcast({
      type: 'performance_metrics',
      timestamp: Date.now(),
      userAddress: update.userAddress,
      data: update
    });
  }

  public broadcastTradeExecution(trade: TradeUpdate, userAddress: Address): void {
    this.broadcast({
      type: 'trade_execution',
      timestamp: Date.now(),
      userAddress,
      data: trade
    });
  }

  public broadcastRiskAlert(alert: RiskAlertUpdate): void {
    this.broadcast({
      type: 'risk_alert',
      timestamp: Date.now(),
      userAddress: alert.userAddress,
      data: alert
    });
  }

  public broadcastPositionUpdate(update: PositionUpdate): void {
    this.broadcast({
      type: 'position_update',
      timestamp: Date.now(),
      userAddress: update.userAddress,
      data: update
    });
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // Start heartbeat to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
        }
      });
    }, 30000); // Send heartbeat every 30 seconds

    console.log('Monitoring WebSocket server started');
  }

  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all connections
    this.clients.forEach((client, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Server shutting down');
      }
    });

    this.clients.clear();
    console.log('Monitoring WebSocket server stopped');
  }

  public getConnectionCount(): number {
    return this.clients.size;
  }

  public getActiveSubscriptions(): { [key: string]: number } {
    const subscriptions: { [key: string]: number } = {};
    
    this.clients.forEach((client) => {
      client.subscriptions.forEach((sub) => {
        subscriptions[sub] = (subscriptions[sub] || 0) + 1;
      });
    });

    return subscriptions;
  }
}

export default MonitoringWebSocket; 