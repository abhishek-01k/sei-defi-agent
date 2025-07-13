import { Address } from 'viem';

// Yei Finance Types
export interface YeiMarket {
  id: string;
  symbol: string;
  name: string;
  underlyingAsset: Address;
  yTokenAddress: Address;
  supplyAPY: string;
  borrowAPY: string;
  totalSupply: string;
  totalBorrow: string;
  liquidity: string;
  utilizationRate: string;
  collateralFactor: string;
  reserveFactor: string;
  isActive: boolean;
  isPaused: boolean;
}

export interface YeiPosition {
  id: string;
  market: YeiMarket;
  user: Address;
  suppliedAmount: string;
  borrowedAmount: string;
  collateralAmount: string;
  healthFactor: string;
  liquidationThreshold: string;
  lastUpdateBlock: number;
}

export interface YeiUserAccount {
  address: Address;
  totalSuppliedUSD: string;
  totalBorrowedUSD: string;
  totalCollateralUSD: string;
  healthFactor: string;
  positions: YeiPosition[];
}

// Sei Blockchain Types
export interface SeiToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: string;
  price: string;
  priceChange24h: string;
  volume24h: string;
}

export interface SeiTransaction {
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: Address;
  to: Address;
  value: string;
  gasUsed: string;
  gasPrice: string;
  status: 'success' | 'failed' | 'pending';
  synthetic?: boolean;
}

// Agent Strategy Types
export interface YieldOpportunity {
  protocol: string;
  market: YeiMarket;
  apy: string;
  tvl: string;
  risk: 'low' | 'medium' | 'high';
  liquidity: string;
  timeToMaturity?: number;
  minDeposit?: string;
  maxDeposit?: string;
}

export interface RebalanceAction {
  type: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'swap';
  fromToken?: Address;
  toToken?: Address;
  amount: string;
  market?: YeiMarket;
  reason: string;
  expectedGain?: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface PortfolioMetrics {
  totalValueUSD: string;
  totalSuppliedUSD: string;
  totalBorrowedUSD: string;
  netAPY: string;
  healthFactor: string;
  diversificationScore: number;
  riskScore: number;
  liquidityScore: number;
}

// Automation Types
export interface TaskParams {
  subAccountAddress: Address;
  chainID: number;
  subscription: {
    id: string;
    metadata: {
      baseToken: Address;
      targetAPY?: string;
      maxSlippage?: string;
      riskTolerance?: 'low' | 'medium' | 'high';
      autoRebalance?: boolean;
      preferredProtocols?: string[];
      maxPositionSize?: string;
      rebalanceThreshold?: string;
    };
  };
}

export interface ExecutionResult {
  skip: boolean;
  message: string;
  transactions?: any[];
  gasEstimate?: string;
  expectedProfit?: string;
  riskAssessment?: string;
}

export interface ExecutorMetadata {
  logo: string;
  name: string;
  description: string;
  version: string;
  metadata: {
    supportedChains: number[];
    supportedProtocols: string[];
    riskLevel: 'low' | 'medium' | 'high';
    features: string[];
  };
}

// Configuration Types
export interface AgentConfig {
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

export interface NotificationConfig {
  discord?: {
    webhookUrl: string;
    enabled: boolean;
  };
  telegram?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  email?: {
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    to: string[];
    enabled: boolean;
  };
}

// Event Types
export interface AgentEvent {
  type: 'rebalance' | 'deposit' | 'withdraw' | 'error' | 'warning' | 'info';
  timestamp: number;
  message: string;
  data?: any;
  transactionHash?: string;
  gasUsed?: string;
  profit?: string;
}

export interface MarketEvent {
  type: 'price_change' | 'apy_change' | 'liquidity_change' | 'new_opportunity';
  market: YeiMarket;
  oldValue?: string;
  newValue: string;
  timestamp: number;
  significance: 'low' | 'medium' | 'high';
}

// Risk Management Types
export interface RiskMetrics {
  healthFactor: string;
  liquidationRisk: 'low' | 'medium' | 'high';
  concentrationRisk: number;
  protocolRisk: number;
  marketRisk: number;
  overallRisk: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface RiskLimits {
  maxPositionSizeUSD: string;
  maxProtocolExposure: number;
  minHealthFactor: string;
  maxLeverage: number;
  maxSlippage: number;
  emergencyStopLoss: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface YeiApiResponse<T> extends ApiResponse<T> {
  blockNumber?: number;
  gasUsed?: string;
}

// Utility Types
export type RiskLevel = 'low' | 'medium' | 'high';
export type TransactionStatus = 'pending' | 'success' | 'failed';
export type ProtocolName = 'yei' | 'sei-swap' | 'sei-lend' | 'other';

// Error Types
export interface AgentError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
}

// Performance Tracking
export interface PerformanceMetrics {
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

export interface TradeRecord {
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
  market?: YeiMarket;
} 