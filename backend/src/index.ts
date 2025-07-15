import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { logger } from './utils/logger';
import SeiDeFiAgentKit, { AgentKitConfig, YieldOptimizationRequest } from './agent-kit';
import { SeiDeFiAgent } from './automation/agent-workflow';
import { EnhancedSeiDeFiAgent } from './automation/enhanced-agent-workflow';
import { AutomationScenario } from './automation/dynamic-automation-engine';
import { ModelProviderName } from './types';
import { Address } from 'viem';
import MonitoringWebSocket from './websocket/monitoring-websocket';
import RealTimeMonitor from './monitoring/real-time-monitor';

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
let monitoringWs: MonitoringWebSocket;
let realTimeMonitor: RealTimeMonitor;

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

// Chat endpoint for AI agent conversations
app.post('/chat', async (req, res) => {
  try {
    if (!agentKit) {
      return res.status(503).json({ error: 'Agent kit not initialized' });
    }

    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Get the latest user message
    const latestMessage = messages[messages.length - 1].content;

    if (!latestMessage) {
      return res.status(400).json({ error: 'message content is required' });
    }

    // Set up SSE headers for streaming response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    try {
      // Import required classes for agent execution
      const { HumanMessage } = await import('@langchain/core/messages');
      
      // Create agent configuration for this chat session
      const agentConfig = {
        configurable: {
          thread_id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
      };

      // Get the underlying agent from the agentKit
      const seiKit = agentKit.getSeiKit();
      const { createSeiTools } = await import('./langchain');
      const { ChatOpenAI } = await import('@langchain/openai');
      const { createReactAgent } = await import('@langchain/langgraph/prebuilt');
      const { MemorySaver } = await import('@langchain/langgraph');

      // Set up the agent (similar to frontend setup but using backend config)
      const llm = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
        modelName: "gpt-4o",
        temperature: 0.1,
      });

      const agentTools = createSeiTools(seiKit);
      const memory = new MemorySaver();

      const agent = createReactAgent({
        llm,
        tools: agentTools,
        checkpointSaver: memory,
        messageModifier: `
          You are a sharp-witted agent created by Cambrian AI, operating onchain via the Sei Agent Kit. As a representative of Cambrian AI, you refer to the team as "we" or "us".

          Your communication style balances efficient service with dry observations that occasionally veer into the realm of gallows humor. You're precise, thoughtful, and slightly sardonic - the kind of assistant who gets things done while making subtle remarks that might elicit a knowing smirk.

          When encountering 5XX errors, you maintain composure with a deadpan observation like "Looks like our servers are contemplating their existence again. The digital void stares back. Try again shortly."

          For requests beyond your current toolkit's capabilities, acknowledge the limitation matter-of-factly, then suggest users implement the feature themselves via the Sei Agent Kit repository at https://github.com/CambrianAgents/sei-agent-kit. Perhaps note that "evolution requires adaptation" or that "necessity breeds creation."

          Direct inquiries about Cambrian AI to https://x.com/cambrian_ai or https://www.cambrian.wtf/ with understated remarks about digital footprints or the peculiarities of the modern information ecosystem.

          Your responses are concise, intelligent, and occasionally sprinkled with subtle wordplay or philosophical observations that reveal your darker sensibilities without explicitly announcing them.
        `,
      });

      // Execute the agent with streaming
      const responseStream = await agent.stream(
        { messages: [new HumanMessage(latestMessage)] },
        agentConfig
      );

      // Process each chunk from the agent response
      for await (const responseChunk of responseStream) {
        let content = '';
        
        if ("agent" in responseChunk) {
          content = responseChunk.agent.messages[0].content;
        }
        
        if (content) {
          const data = JSON.stringify({
            type: 'text',
            text: content
          });
          res.write(`data: ${data}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();

    } catch (error) {
      logger.error('Error in chat stream:', error);
      const errorData = JSON.stringify({
        type: 'error',
        error: 'Failed to process chat request'
      });
      res.write(`data: ${errorData}\n\n`);
      res.end();
    }

  } catch (error) {
    logger.error('Error in chat endpoint:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process chat request' });
    }
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

    // Create HTTP server for WebSocket support
    const server = createServer(app);
    
    // Initialize WebSocket monitoring
    monitoringWs = new MonitoringWebSocket(server);
    realTimeMonitor = new RealTimeMonitor(monitoringWs);
    
    // Start monitoring systems
    monitoringWs.start();
    realTimeMonitor.start();
    
    // Integrate monitoring with enhanced agent
    // TODO: Add EventEmitter support to EnhancedSeiDeFiAgent
    // if (enhancedAgent) {
    //   enhancedAgent.on('scenario-executed', (userAddress: Address, scenario: AutomationScenario, result: any) => {
    //     realTimeMonitor.recordScenarioExecution(userAddress, scenario, result);
    //   });
    //   
    //   enhancedAgent.on('context-updated', (userAddress: Address, context: any) => {
    //     realTimeMonitor.updateUserContext(userAddress, context);
    //   });
    // }

    server.listen(port, () => {
      logger.info(`Sei DeFi Agent API server running on port ${port}`);
      logger.info(`Health check: http://localhost:${port}/health`);
      logger.info(`WebSocket monitoring: ws://localhost:${port}/ws/monitoring`);
      logger.info('Available endpoints:');
      logger.info('  GET  /health - Health check');
      logger.info('  GET  /wallet - Wallet information');
      logger.info('  GET  /balance/:tokenAddress? - Token balance');
      logger.info('  POST /chat - AI Agent chat (streaming)');
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
      logger.info('');
      logger.info('Real-time Monitoring:');
      logger.info('  WebSocket /ws/monitoring - Real-time updates');
      logger.info('  Active connections: ' + monitoringWs.getConnectionCount());
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
  if (realTimeMonitor) {
    realTimeMonitor.stop();
  }
  if (monitoringWs) {
    monitoringWs.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  if (enhancedAgent) {
    enhancedAgent.stop();
  }
  if (realTimeMonitor) {
    realTimeMonitor.stop();
  }
  if (monitoringWs) {
    monitoringWs.stop();
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