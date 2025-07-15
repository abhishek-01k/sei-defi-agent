import { useState, useEffect, useRef, useCallback } from 'react';

export interface MonitoringUpdate {
  type: 'automation_status' | 'performance_metrics' | 'trade_execution' | 'risk_alert' | 'position_update';
  timestamp: number;
  userAddress?: string;
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
  userAddress: string;
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

export interface RiskAlert {
  userAddress: string;
  alertType: 'liquidation_risk' | 'concentration_risk' | 'health_factor_warning' | 'protocol_risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  recommendations: string[];
  timestamp: number;
}

export interface PositionUpdate {
  userAddress: string;
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

interface UseWebSocketMonitoringOptions {
  userAddress?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface WebSocketMonitoringHook {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  
  // Data
  automationStatus: AutomationStatusUpdate | null;
  performanceMetrics: PerformanceMetricsUpdate | null;
  recentTrades: TradeUpdate[];
  riskAlerts: RiskAlert[];
  positions: PositionUpdate | null;
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  subscribe: (subscriptions: string[]) => void;
  unsubscribe: (subscriptions: string[]) => void;
  clearAlerts: () => void;
  
  // Events
  onAutomationStatusUpdate: (callback: (data: AutomationStatusUpdate) => void) => void;
  onPerformanceUpdate: (callback: (data: PerformanceMetricsUpdate) => void) => void;
  onTradeExecution: (callback: (data: TradeUpdate) => void) => void;
  onRiskAlert: (callback: (data: RiskAlert) => void) => void;
  onPositionUpdate: (callback: (data: PositionUpdate) => void) => void;
}

export const useWebSocketMonitoring = (options: UseWebSocketMonitoringOptions = {}): WebSocketMonitoringHook => {
  const {
    userAddress,
    autoConnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [automationStatus, setAutomationStatus] = useState<AutomationStatusUpdate | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetricsUpdate | null>(null);
  const [recentTrades, setRecentTrades] = useState<TradeUpdate[]>([]);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [positions, setPositions] = useState<PositionUpdate | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const subscriptionsRef = useRef<string[]>([]);
  const callbacksRef = useRef<{
    onAutomationStatusUpdate: ((data: AutomationStatusUpdate) => void)[];
    onPerformanceUpdate: ((data: PerformanceMetricsUpdate) => void)[];
    onTradeExecution: ((data: TradeUpdate) => void)[];
    onRiskAlert: ((data: RiskAlert) => void)[];
    onPositionUpdate: ((data: PositionUpdate) => void)[];
  }>({
    onAutomationStatusUpdate: [],
    onPerformanceUpdate: [],
    onTradeExecution: [],
    onRiskAlert: [],
    onPositionUpdate: []
  });

  const connect = useCallback(() => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    setError(null);

    const BACKEND_WS_URL = process.env.NEXT_PUBLIC_BACKEND_WS_URL || 'http://localhost:3000';
    try {
      const wsUrl = `${BACKEND_WS_URL}/ws/monitoring`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Subscribe to default subscriptions
        if (subscriptionsRef.current.length === 0) {
          const defaultSubscriptions = ['automation_status'];
          if (userAddress) {
            defaultSubscriptions.push('performance_metrics', 'trade_execution', 'risk_alert', 'position_update');
          }
          subscriptionsRef.current = defaultSubscriptions;
        }
        
        // Send subscription request
        wsRef.current?.send(JSON.stringify({
          type: 'subscribe',
          subscriptions: subscriptionsRef.current,
          userAddress
        }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connection_established':
              console.log('WebSocket monitoring connected');
              break;
              
            case 'subscription_confirmed':
              console.log('Subscribed to:', message.subscriptions);
              break;
              
            case 'automation_status':
              setAutomationStatus(message.data);
              callbacksRef.current.onAutomationStatusUpdate.forEach(cb => cb(message.data));
              break;
              
            case 'performance_metrics':
              setPerformanceMetrics(message.data);
              callbacksRef.current.onPerformanceUpdate.forEach(cb => cb(message.data));
              break;
              
            case 'trade_execution':
              const trade = message.data;
              setRecentTrades(prev => [trade, ...prev.slice(0, 19)]); // Keep last 20
              callbacksRef.current.onTradeExecution.forEach(cb => cb(trade));
              break;
              
            case 'risk_alert':
              const alert = message.data;
              setRiskAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10
              callbacksRef.current.onRiskAlert.forEach(cb => cb(alert));
              break;
              
            case 'position_update':
              setPositions(message.data);
              callbacksRef.current.onPositionUpdate.forEach(cb => cb(message.data));
              break;
              
            case 'heartbeat':
              // Respond to heartbeat
              wsRef.current?.send(JSON.stringify({ type: 'ping' }));
              break;
              
            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        
        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          setError(`Connection lost. Reconnecting... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else {
          setError('Max reconnection attempts reached. Please refresh the page.');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('WebSocket connection error');
        setIsConnecting(false);
      };

    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setError('Failed to create WebSocket connection');
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected, userAddress, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
  }, []);

  const subscribe = useCallback((subscriptions: string[]) => {
    subscriptionsRef.current = [...new Set([...subscriptionsRef.current, ...subscriptions])];
    
    if (isConnected && wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        subscriptions,
        userAddress
      }));
    }
  }, [isConnected, userAddress]);

  const unsubscribe = useCallback((subscriptions: string[]) => {
    subscriptionsRef.current = subscriptionsRef.current.filter(sub => !subscriptions.includes(sub));
    
    if (isConnected && wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        subscriptions
      }));
    }
  }, [isConnected]);

  const clearAlerts = useCallback(() => {
    setRiskAlerts([]);
  }, []);

  // Event handlers
  const onAutomationStatusUpdate = useCallback((callback: (data: AutomationStatusUpdate) => void) => {
    callbacksRef.current.onAutomationStatusUpdate.push(callback);
    return () => {
      callbacksRef.current.onAutomationStatusUpdate = 
        callbacksRef.current.onAutomationStatusUpdate.filter(cb => cb !== callback);
    };
  }, []);

  const onPerformanceUpdate = useCallback((callback: (data: PerformanceMetricsUpdate) => void) => {
    callbacksRef.current.onPerformanceUpdate.push(callback);
    return () => {
      callbacksRef.current.onPerformanceUpdate = 
        callbacksRef.current.onPerformanceUpdate.filter(cb => cb !== callback);
    };
  }, []);

  const onTradeExecution = useCallback((callback: (data: TradeUpdate) => void) => {
    callbacksRef.current.onTradeExecution.push(callback);
    return () => {
      callbacksRef.current.onTradeExecution = 
        callbacksRef.current.onTradeExecution.filter(cb => cb !== callback);
    };
  }, []);

  const onRiskAlert = useCallback((callback: (data: RiskAlert) => void) => {
    callbacksRef.current.onRiskAlert.push(callback);
    return () => {
      callbacksRef.current.onRiskAlert = 
        callbacksRef.current.onRiskAlert.filter(cb => cb !== callback);
    };
  }, []);

  const onPositionUpdate = useCallback((callback: (data: PositionUpdate) => void) => {
    callbacksRef.current.onPositionUpdate.push(callback);
    return () => {
      callbacksRef.current.onPositionUpdate = 
        callbacksRef.current.onPositionUpdate.filter(cb => cb !== callback);
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    automationStatus,
    performanceMetrics,
    recentTrades,
    riskAlerts,
    positions,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    clearAlerts,
    onAutomationStatusUpdate,
    onPerformanceUpdate,
    onTradeExecution,
    onRiskAlert,
    onPositionUpdate
  };
};

export default useWebSocketMonitoring; 