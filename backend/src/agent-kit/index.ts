import { SeiAgentKit } from '../agent';
import { createSeiTools } from '../langchain';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGroq } from '@langchain/groq';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { ModelProviderName } from '../types';
import { logger } from '../utils/logger';
import { Address } from 'viem';

export interface AgentKitConfig {
  privateKey: string;
  openaiApiKey: string;
  rpcUrl?: string;
  modelProvider?: ModelProviderName;
  temperature?: number;
  model?: string;
}

export interface YieldOptimizationRequest {
  userAddress: Address;
  baseToken: Address;
  targetAPY?: string;
  maxSlippage?: string;
  riskTolerance?: 'low' | 'medium' | 'high';
  preferredProtocols?: string[];
  maxPositionSize?: string;
}

export interface ExecutionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  profit?: string;
  gasUsed?: string;
  recommendations?: string[];
}

export class SeiDeFiAgentKit {
  private seiKit: SeiAgentKit;
  private agent: any;
  private tools: any[];
  private config: AgentKitConfig;
  private memory: MemorySaver;

  constructor(config: AgentKitConfig) {
    this.config = config;
    this.seiKit = new SeiAgentKit(
      config.privateKey,
      config.modelProvider || ModelProviderName.OPENAI
    );

    this.tools = createSeiTools(this.seiKit);
    this.memory = new MemorySaver();

    this.initializeAgent();
  }

  private initializeAgent(): void {
    try {
      const llm = new ChatOpenAI({
        apiKey: this.config.openaiApiKey,
        model: this.config.model || "gpt-4o",
        temperature: this.config.temperature || 0,
      });

    //   const groqLLM = new ChatGroq({
    //     apiKey: process.env.GROQ_API_KEY,
    //     model: "llama-3.3-70b-versatile",
    //   });

      this.agent = createReactAgent({
        llm,
        tools: this.tools,
        checkpointSaver: this.memory,
      });

      logger.info('Sei DeFi Agent Kit initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize agent:', error);
      throw error;
    }
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): Address {
    return this.seiKit.wallet_address;
  }

  /**
   * Get token balance (ERC-20 or native SEI)
   */
  async getBalance(tokenAddress?: Address): Promise<string> {
    try {
      return await this.seiKit.getERC20Balance(tokenAddress);
    } catch (error) {
      logger.error('Error getting balance:', error);
      throw error;
    }
  }

  /**
   * Transfer tokens
   */
  async transfer(amount: string, recipient: Address, ticker?: string): Promise<string> {
    try {
      return await this.seiKit.ERC20Transfer(amount, recipient, ticker);
    } catch (error) {
      logger.error('Error transferring tokens:', error);
      throw error;
    }
  }

  /**
   * Stake SEI tokens
   */
  async stake(amount: string): Promise<string> {
    try {
      return await this.seiKit.stake(amount);
    } catch (error) {
      logger.error('Error staking tokens:', error);
      throw error;
    }
  }

  /**
   * Unstake SEI tokens
   */
  async unstake(amount: string): Promise<string> {
    try {
      return await this.seiKit.unstake(amount);
    } catch (error) {
      logger.error('Error unstaking tokens:', error);
      throw error;
    }
  }

  /**
   * Swap tokens using Symphony
   */
  async swap(amount: string, tokenIn: Address, tokenOut: Address): Promise<string> {
    try {
      return await this.seiKit.swap(amount, tokenIn, tokenOut);
    } catch (error) {
      logger.error('Error swapping tokens:', error);
      throw error;
    }
  }

  /**
   * Lend tokens using Takara
   */
  async lend(ticker: string, amount: string): Promise<string> {
    try {
      return await this.seiKit.mintTakara(ticker, amount);
    } catch (error) {
      logger.error('Error lending tokens:', error);
      throw error;
    }
  }

  /**
   * Borrow tokens using Takara
   */
  async borrow(ticker: string, amount: string): Promise<string> {
    try {
      return await this.seiKit.borrowTakara(ticker, amount);
    } catch (error) {
      logger.error('Error borrowing tokens:', error);
      throw error;
    }
  }

  /**
   * Repay borrowed tokens using Takara
   */
  async repay(ticker: string, amount: string): Promise<any> {
    try {
      return await this.seiKit.repayTakara(ticker, amount);
    } catch (error) {
      logger.error('Error repaying tokens:', error);
      throw error;
    }
  }

  /**
   * Redeem tokens from Takara
   */
  async redeem(ticker: string, amount: string): Promise<any> {
    try {
      return await this.seiKit.redeemTakara(ticker, amount);
    } catch (error) {
      logger.error('Error redeeming tokens:', error);
      throw error;
    }
  }

  /**
   * Get borrow balance from Takara
   */
  async getBorrowBalance(ticker: string, userAddress?: Address): Promise<any> {
    try {
      return await this.seiKit.getBorrowBalance(ticker, userAddress);
    } catch (error) {
      logger.error('Error getting borrow balance:', error);
      throw error;
    }
  }

  /**
   * Get redeemable amount from Takara
   */
  async getRedeemableAmount(ticker: string, userAddress?: Address): Promise<any> {
    try {
      return await this.seiKit.getRedeemableAmount(ticker, userAddress);
    } catch (error) {
      logger.error('Error getting redeemable amount:', error);
      throw error;
    }
  }

  /**
   * Execute AI-powered yield optimization
   */
  async optimizeYield(request: YieldOptimizationRequest): Promise<ExecutionResult> {
    try {
      const prompt = this.buildOptimizationPrompt(request);

      const agentConfig = {
        configurable: {
          thread_id: `yield-optimization-${request.userAddress}-${Date.now()}`
        }
      };

      const result = await this.agent.invoke(
        { messages: [new HumanMessage(prompt)] },
        agentConfig
      );

      const lastMessage = result.messages[result.messages.length - 1];

      return {
        success: true,
        recommendations: [lastMessage.content],
        profit: "0", // Will be calculated based on actual executions
        gasUsed: "0"
      };
    } catch (error) {
      logger.error('Error optimizing yield:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute AI-powered risk assessment
   */
  async assessRisk(userAddress: Address): Promise<any> {
    try {
      const prompt = `Analyze the DeFi risk profile for address ${userAddress}. 
      Check positions across Takara lending, Silo staking, and other protocols.
      Provide risk assessment including:
      - Current positions and exposure
      - Liquidation risks
      - Concentration risks
      - Recommendations for risk mitigation`;

      const agentConfig = {
        configurable: {
          thread_id: `risk-assessment-${userAddress}-${Date.now()}`
        }
      };

      const result = await this.agent.invoke(
        { messages: [new HumanMessage(prompt)] },
        agentConfig
      );

      return result.messages[result.messages.length - 1].content;
    } catch (error) {
      logger.error('Error assessing risk:', error);
      throw error;
    }
  }

  /**
   * Execute complex DeFi strategy using AI
   */
  async executeStrategy(strategy: string, parameters: any): Promise<ExecutionResult> {
    try {
      const prompt = `Execute the following DeFi strategy: ${strategy}
      Parameters: ${JSON.stringify(parameters)}
      
      Available protocols:
      - Symphony: For token swapping
      - Takara: For lending and borrowing
      - Silo: For staking SEI
      - Citrex: For perpetual trading
      
      Execute the strategy step by step, providing transaction details and expected outcomes.`;

      const agentConfig = {
        configurable: {
          thread_id: `strategy-execution-${Date.now()}`
        }
      };

      const result = await this.agent.invoke(
        { messages: [new HumanMessage(prompt)] },
        agentConfig
      );

      return {
        success: true,
        recommendations: [result.messages[result.messages.length - 1].content]
      };
    } catch (error) {
      logger.error('Error executing strategy:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private buildOptimizationPrompt(request: YieldOptimizationRequest): string {
    return `Optimize yield for the following portfolio:
    
    User Address: ${request.userAddress}
    Base Token: ${request.baseToken}
    Target APY: ${request.targetAPY || 'maximize'}
    Max Slippage: ${request.maxSlippage || '0.5%'}
    Risk Tolerance: ${request.riskTolerance || 'medium'}
    Preferred Protocols: ${request.preferredProtocols?.join(', ') || 'all available'}
    Max Position Size: ${request.maxPositionSize || 'no limit'}
    
    Available protocols on Sei:
    1. Symphony - Token swapping and liquidity
    2. Takara - Lending and borrowing platform
    3. Silo - SEI staking with rewards
    4. Citrex - Perpetual trading
    
    Please:
    1. Check current balances and positions
    2. Analyze yield opportunities across protocols
    3. Consider risk factors and user preferences
    4. Execute optimal rebalancing strategy
    5. Provide detailed execution plan with expected returns
    
    Focus on maximizing risk-adjusted returns while staying within the specified parameters.`;
  }

  /**
   * Get available tools for manual execution
   */
  getAvailableTools(): string[] {
    return this.tools.map(tool => tool.name);
  }

  /**
   * Access the underlying SeiAgentKit for advanced operations
   */
  getSeiKit(): SeiAgentKit {
    return this.seiKit;
  }
}

export default SeiDeFiAgentKit; 