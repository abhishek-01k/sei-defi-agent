import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import SeiDeFiAgentKit, { AgentKitConfig, YieldOptimizationRequest } from './agent-kit';
import { SeiDeFiAgent } from './automation/agent-workflow';
import { ModelProviderName } from './types';
import { Address } from 'viem';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Global variables
let agentKit: SeiDeFiAgentKit;
let automationAgent: SeiDeFiAgent;

// Initialize the agent kit
async function initializeAgentKit(): Promise<void> {
  try {
    // Validate required environment variables
    const requiredVars = ['PRIVATE_KEY', 'OPENAI_API_KEY', 'BRAHMA_API_KEY', 'GROQ_API_KEY'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Initialize agent kit configuration
    const agentKitConfig: AgentKitConfig = {
      privateKey: process.env.PRIVATE_KEY!,
      openaiApiKey: process.env.OPENAI_API_KEY!,
      rpcUrl: process.env.RPC_URL || 'https://evm-rpc.sei-apis.com',
      // modelProvider: ModelProviderName.GROQ,
      temperature: 0,
    };

    // Initialize the agent kit
    agentKit = new SeiDeFiAgentKit(agentKitConfig);

    // Initialize automation agent
    automationAgent = new SeiDeFiAgent();

    logger.info('Sei DeFi Agent Kit initialized successfully');
    logger.info(`Agent wallet address: ${agentKit.getWalletAddress()}`);
    logger.info(`Available tools: ${agentKit.getAvailableTools().join(', ')}`);
  } catch (error) {
    logger.error('Failed to initialize agent kit:', error);
    throw error;
  }
}

// API Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    walletAddress: agentKit?.getWalletAddress(),
    availableTools: agentKit?.getAvailableTools() || []
  });
});

// Get wallet information
app.get('/wallet', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const walletAddress = agentKit.getWalletAddress();
    const balance = await agentKit.getBalance();

    res.json({
      address: walletAddress,
      balance,
      network: 'Sei',
      chainId: process.env.CHAIN_ID || '1329'
    });
  } catch (error) {
    logger.error('Error getting wallet info:', error);
    res.status(500).json({ error: 'Failed to get wallet information' });
  }
});

// Get token balance
app.get('/balance/:tokenAddress?', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const tokenAddress = req.params.tokenAddress as Address;
    const balance = await agentKit.getBalance(tokenAddress);

    res.json({
      balance,
      tokenAddress: tokenAddress || 'SEI',
      walletAddress: agentKit.getWalletAddress()
    });
  } catch (error) {
    logger.error('Error getting balance:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Execute yield optimization
app.post('/optimize', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const request: YieldOptimizationRequest = {
      userAddress: req.body.userAddress || agentKit.getWalletAddress(),
      baseToken: req.body.baseToken,
      targetAPY: req.body.targetAPY,
      maxSlippage: req.body.maxSlippage,
      riskTolerance: req.body.riskTolerance || 'medium',
      preferredProtocols: req.body.preferredProtocols,
      maxPositionSize: req.body.maxPositionSize
    };

    // Validate required fields
    if (!request.baseToken) {
      return res.status(400).json({ error: 'baseToken is required' });
    }

    const result = await agentKit.optimizeYield(request);

    res.json({
      success: result.success,
      transactionHash: result.transactionHash,
      profit: result.profit,
      gasUsed: result.gasUsed,
      recommendations: result.recommendations,
      error: result.error
    });
  } catch (error) {
    logger.error('Error optimizing yield:', error);
    res.status(500).json({ error: 'Failed to optimize yield' });
  }
});

// Execute risk assessment
app.post('/assess-risk', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const userAddress = req.body.userAddress || agentKit.getWalletAddress();
    const riskAssessment = await agentKit.assessRisk(userAddress as Address);

    res.json({
      userAddress,
      riskAssessment,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error assessing risk:', error);
    res.status(500).json({ error: 'Failed to assess risk' });
  }
});

// Execute DeFi strategy
app.post('/execute-strategy', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const { strategy, parameters } = req.body;

    if (!strategy) {
      return res.status(400).json({ error: 'strategy is required' });
    }

    const result = await agentKit.executeStrategy(strategy, parameters || {});

    res.json({
      success: result.success,
      recommendations: result.recommendations,
      transactionHash: result.transactionHash,
      profit: result.profit,
      gasUsed: result.gasUsed,
      error: result.error
    });
  } catch (error) {
    logger.error('Error executing strategy:', error);
    res.status(500).json({ error: 'Failed to execute strategy' });
  }
});

// Token operations
app.post('/transfer', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const { amount, recipient, ticker } = req.body;

    if (!amount || !recipient) {
      return res.status(400).json({ error: 'amount and recipient are required' });
    }

    const txHash = await agentKit.transfer(amount, recipient as Address, ticker);

    res.json({
      success: true,
      transactionHash: txHash,
      amount,
      recipient,
      ticker: ticker || 'SEI'
    });
  } catch (error) {
    logger.error('Error transferring tokens:', error);
    res.status(500).json({ error: 'Failed to transfer tokens' });
  }
});

// DeFi protocol operations
app.post('/stake', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }

    const txHash = await agentKit.stake(amount);

    res.json({
      success: true,
      transactionHash: txHash,
      amount,
      protocol: 'Silo'
    });
  } catch (error) {
    logger.error('Error staking tokens:', error);
    res.status(500).json({ error: 'Failed to stake tokens' });
  }
});

app.post('/unstake', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }

    const txHash = await agentKit.unstake(amount);

    res.json({
      success: true,
      transactionHash: txHash,
      amount,
      protocol: 'Silo'
    });
  } catch (error) {
    logger.error('Error unstaking tokens:', error);
    res.status(500).json({ error: 'Failed to unstake tokens' });
  }
});

app.post('/swap', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const { amount, tokenIn, tokenOut } = req.body;

    if (!amount || !tokenIn || !tokenOut) {
      return res.status(400).json({ error: 'amount, tokenIn, and tokenOut are required' });
    }

    const txHash = await agentKit.swap(amount, tokenIn as Address, tokenOut as Address);

    res.json({
      success: true,
      transactionHash: txHash,
      amount,
      tokenIn,
      tokenOut,
      protocol: 'Symphony'
    });
  } catch (error) {
    logger.error('Error swapping tokens:', error);
    res.status(500).json({ error: 'Failed to swap tokens' });
  }
});

app.post('/lend', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const { ticker, amount } = req.body;

    if (!ticker || !amount) {
      return res.status(400).json({ error: 'ticker and amount are required' });
    }

    const txHash = await agentKit.lend(ticker, amount);

    res.json({
      success: true,
      transactionHash: txHash,
      ticker,
      amount,
      protocol: 'Takara'
    });
  } catch (error) {
    logger.error('Error lending tokens:', error);
    res.status(500).json({ error: 'Failed to lend tokens' });
  }
});

app.post('/borrow', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const { ticker, amount } = req.body;

    if (!ticker || !amount) {
      return res.status(400).json({ error: 'ticker and amount are required' });
    }

    const txHash = await agentKit.borrow(ticker, amount);

    res.json({
      success: true,
      transactionHash: txHash,
      ticker,
      amount,
      protocol: 'Takara'
    });
  } catch (error) {
    logger.error('Error borrowing tokens:', error);
    res.status(500).json({ error: 'Failed to borrow tokens' });
  }
});

// Performance and monitoring
app.get('/performance', (req, res) => {
  try {
    if (!automationAgent) {
      return res.status(503).json({ error: 'Automation agent not initialized' });
    }

    const metrics = automationAgent.getPerformanceMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error('Error getting performance metrics:', error);
    res.status(500).json({ error: 'Failed to get performance metrics' });
  }
});

app.get('/trades', (req, res) => {
  try {
    if (!automationAgent) {
      return res.status(503).json({ error: 'Automation agent not initialized' });
    }

    const trades = automationAgent.getTradeHistory();
    res.json(trades);
  } catch (error) {
    logger.error('Error getting trade history:', error);
    res.status(500).json({ error: 'Failed to get trade history' });
  }
});

// Agent controls
app.post('/emergency-stop', (req, res) => {
  try {
    if (!automationAgent) {
      return res.status(503).json({ error: 'Automation agent not initialized' });
    }

    automationAgent.emergencyStop();
    res.json({ success: true, message: 'Emergency stop activated' });
  } catch (error) {
    logger.error('Error activating emergency stop:', error);
    res.status(500).json({ error: 'Failed to activate emergency stop' });
  }
});

app.post('/resume', (req, res) => {
  try {
    if (!automationAgent) {
      return res.status(503).json({ error: 'Automation agent not initialized' });
    }

    automationAgent.resumeAutomation();
    res.json({ success: true, message: 'Automation resumed' });
  } catch (error) {
    logger.error('Error resuming automation:', error);
    res.status(500).json({ error: 'Failed to resume automation' });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Express error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize and start server
async function startServer(): Promise<void> {
  try {
    await initializeAgentKit();

    app.listen(port, () => {
      logger.info(`Sei DeFi Agent API server running on port ${port}`);
      logger.info(`Health check: http://localhost:${port}/health`);
      logger.info('Available endpoints:');
      logger.info('  GET  /health - Health check');
      logger.info('  GET  /wallet - Wallet information');
      logger.info('  GET  /balance/:tokenAddress? - Token balance');
      logger.info('  POST /optimize - Execute yield optimization');
      logger.info('  POST /assess-risk - Risk assessment');
      logger.info('  POST /execute-strategy - Execute DeFi strategy');
      logger.info('  POST /transfer - Transfer tokens');
      logger.info('  POST /stake - Stake SEI tokens');
      logger.info('  POST /unstake - Unstake SEI tokens');
      logger.info('  POST /swap - Swap tokens');
      logger.info('  POST /lend - Lend tokens');
      logger.info('  POST /borrow - Borrow tokens');
      logger.info('  GET  /performance - Performance metrics');
      logger.info('  GET  /trades - Trade history');
      logger.info('  POST /emergency-stop - Emergency stop');
      logger.info('  POST /resume - Resume automation');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start application:', error);
    process.exit(1);
  });
}

export { agentKit, automationAgent, startServer };