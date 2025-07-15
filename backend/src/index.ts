import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import SeiDeFiAgentKit, { AgentKitConfig, YieldOptimizationRequest } from './agent-kit';
import { SeiDeFiAgent } from './automation/agent-workflow';
import { EnhancedSeiDeFiAgent } from './automation/enhanced-agent-workflow';
import { AutomationScenario } from './automation/dynamic-automation-engine';
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
let enhancedAgent: EnhancedSeiDeFiAgent;

// Initialize the agent kit
async function initializeAgentKit(): Promise<void> {
  try {
    // Validate required environment variables
    const requiredVars = ['PRIVATE_KEY', 'OPENAI_API_KEY', 'BRAHMA_API_KEY'];
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

    // Initialize enhanced agent
    enhancedAgent = new EnhancedSeiDeFiAgent();

    logger.info('Sei DeFi Agent Kit initialized successfully');
    logger.info(`Agent wallet address: ${agentKit.getWalletAddress()}`);
    logger.info(`Available tools: ${agentKit.getAvailableTools().join(', ')}`);
  } catch (error) {
    logger.error('Failed to initialize agent kit:', error);
    throw error;
  }
}

// Basic API Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    walletAddress: agentKit?.getWalletAddress(),
    availableTools: agentKit?.getAvailableTools() || [],
    enhancedAgentStatus: enhancedAgent?.getEngineStatus() || {}
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

// Enhanced Automation API Routes

// Register automation for a user
app.post('/automation/register', async (req, res) => {
  try {
    if (!enhancedAgent) {
      return res.status(503).json({ error: 'Enhanced agent not initialized' });
    }

    const { userAddress, preferences } = req.body;

    if (!userAddress) {
      return res.status(400).json({ error: 'userAddress is required' });
    }

    // Create default scenarios based on preferences
    const scenarios = enhancedAgent.createDefaultScenarios(userAddress, preferences || {});

    // Global configuration
    const globalConfig = {
      maxSlippage: preferences?.maxSlippage || 0.5,
      riskTolerance: preferences?.riskTolerance || 'medium',
      emergencyStopLoss: preferences?.emergencyStopLoss || 10.0,
      maxGasPrice: preferences?.maxGasPrice || '1000000000',
      preferredProtocols: preferences?.preferredProtocols || ['symphony', 'takara', 'silo']
    };

    // Register automation
    await enhancedAgent.registerUserAutomation(userAddress, scenarios, globalConfig);

    res.json({
      success: true,
      message: 'Automation registered successfully',
      userAddress,
      scenariosCount: scenarios.length,
      scenarios: scenarios.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        enabled: s.enabled,
        priority: s.priority
      }))
    });
  } catch (error) {
    logger.error('Error registering automation:', error);
    res.status(500).json({ error: 'Failed to register automation' });
  }
});

// Get automation context for a user
app.get('/automation/context/:userAddress', async (req, res) => {
  try {
    if (!enhancedAgent) {
      return res.status(503).json({ error: 'Enhanced agent not initialized' });
    }

    const userAddress = req.params.userAddress as Address;
    const context = enhancedAgent.getAutomationContext(userAddress);

    if (!context) {
      return res.status(404).json({ error: 'Automation context not found for user' });
    }

    res.json({
      success: true,
      context: {
        userAddress: context.userAddress,
        chainId: context.chainId,
        scenarios: context.scenarios,
        globalConfig: context.globalConfig,
        performanceMetrics: context.performanceMetrics
      }
    });
  } catch (error) {
    logger.error('Error getting automation context:', error);
    res.status(500).json({ error: 'Failed to get automation context' });
  }
});

// Update automation scenarios for a user
app.put('/automation/scenarios/:userAddress', async (req, res) => {
  try {
    if (!enhancedAgent) {
      return res.status(503).json({ error: 'Enhanced agent not initialized' });
    }

    const userAddress = req.params.userAddress as Address;
    const { scenarios } = req.body;

    if (!scenarios || !Array.isArray(scenarios)) {
      return res.status(400).json({ error: 'scenarios array is required' });
    }

    // Update user scenarios
    enhancedAgent.updateUserScenarios(userAddress, scenarios);

    res.json({
      success: true,
      message: 'Automation scenarios updated successfully',
      userAddress,
      scenariosCount: scenarios.length
    });
  } catch (error) {
    logger.error('Error updating automation scenarios:', error);
    res.status(500).json({ error: 'Failed to update automation scenarios' });
  }
});

// Get automation engine status
app.get('/automation/status', async (req, res) => {
  try {
    if (!enhancedAgent) {
      return res.status(503).json({ error: 'Enhanced agent not initialized' });
    }

    const status = enhancedAgent.getEngineStatus();

    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting automation status:', error);
    res.status(500).json({ error: 'Failed to get automation status' });
  }
});

// Create custom automation scenario
app.post('/automation/scenarios/custom', async (req, res) => {
  try {
    if (!enhancedAgent) {
      return res.status(503).json({ error: 'Enhanced agent not initialized' });
    }

    const { userAddress, scenario } = req.body;

    if (!userAddress || !scenario) {
      return res.status(400).json({ error: 'userAddress and scenario are required' });
    }

    // Validate scenario structure
    const requiredFields = ['name', 'description', 'type', 'triggers', 'parameters'];
    for (const field of requiredFields) {
      if (!scenario[field]) {
        return res.status(400).json({ error: `scenario.${field} is required` });
      }
    }

    // Set default values
    const customScenario: AutomationScenario = {
      id: `custom_${Date.now()}`,
      enabled: true,
      riskLevel: scenario.riskLevel || 'medium',
      priority: scenario.priority || 5,
      ...scenario
    };

    // Get existing context and add the new scenario
    const context = enhancedAgent.getAutomationContext(userAddress);
    if (!context) {
      return res.status(404).json({ error: 'User not registered for automation' });
    }

    const updatedScenarios = [...context.scenarios, customScenario];
    enhancedAgent.updateUserScenarios(userAddress, updatedScenarios);

    res.json({
      success: true,
      message: 'Custom scenario created successfully',
      scenario: {
        id: customScenario.id,
        name: customScenario.name,
        type: customScenario.type,
        enabled: customScenario.enabled
      }
    });
  } catch (error) {
    logger.error('Error creating custom scenario:', error);
    res.status(500).json({ error: 'Failed to create custom scenario' });
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

// Enhanced performance metrics
app.get('/automation/performance/:userAddress', async (req, res) => {
  try {
    if (!enhancedAgent) {
      return res.status(503).json({ error: 'Enhanced agent not initialized' });
    }

    const userAddress = req.params.userAddress as Address;
    const context = enhancedAgent.getAutomationContext(userAddress);

    if (!context) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      userAddress,
      performanceMetrics: context.performanceMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting automation performance:', error);
    res.status(500).json({ error: 'Failed to get automation performance' });
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

// Enhanced agent controls
app.post('/automation/start', async (req, res) => {
  try {
    if (!enhancedAgent) {
      return res.status(503).json({ error: 'Enhanced agent not initialized' });
    }

    // Start the enhanced agent in the background
    setImmediate(() => {
      enhancedAgent.start().catch(error => {
        logger.error('Error starting enhanced agent:', error);
      });
    });

    res.json({ success: true, message: 'Enhanced automation started' });
  } catch (error) {
    logger.error('Error starting enhanced automation:', error);
    res.status(500).json({ error: 'Failed to start enhanced automation' });
  }
});

app.post('/automation/stop', (req, res) => {
  try {
    if (!enhancedAgent) {
      return res.status(503).json({ error: 'Enhanced agent not initialized' });
    }

    enhancedAgent.stop();
    res.json({ success: true, message: 'Enhanced automation stopped' });
  } catch (error) {
    logger.error('Error stopping enhanced automation:', error);
    res.status(500).json({ error: 'Failed to stop enhanced automation' });
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
      logger.info('');
      logger.info('Enhanced Automation Endpoints:');
      logger.info('  POST /automation/register - Register user automation');
      logger.info('  GET  /automation/context/:userAddress - Get automation context');
      logger.info('  PUT  /automation/scenarios/:userAddress - Update scenarios');
      logger.info('  GET  /automation/status - Get engine status');
      logger.info('  POST /automation/scenarios/custom - Create custom scenario');
      logger.info('  GET  /automation/performance/:userAddress - Get user performance');
      logger.info('  POST /automation/start - Start enhanced agent');
      logger.info('  POST /automation/stop - Stop enhanced agent');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  if (enhancedAgent) {
    enhancedAgent.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  if (enhancedAgent) {
    enhancedAgent.stop();
  }
  process.exit(0);
});

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start application:', error);
    process.exit(1);
  });
}

export { agentKit, automationAgent, enhancedAgent, startServer };