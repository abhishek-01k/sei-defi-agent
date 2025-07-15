import {
  Address,
  ConsoleExecutorConfig,
  ConsoleKit,
  KernelExecutorConfig
} from "brahma-console-kit";
import { ethers, Wallet } from "ethers";
import { logger } from '../utils/logger';

// @todo update these addresses
const SEI_PROTOCOL_ADDRESSES = {
  SYMPHONY_ROUTER: "0x...", // Symphony DEX router
  TAKARA_COMPTROLLER: "0x...", // Takara lending comptroller
  SILO_HUB: "0x...", // Silo staking hub
  CITREX_EXCHANGE: "0x...", // Citrex perpetual exchange
  // Add more protocol addresses as needed
};

const CONSOLE_FEE_RECEIVER = "0xEf59f0AD1bE369189e7dD30Fb474263a87400C73";

export interface ExecutorMetadata {
  name: string;
  logo: string;
  metadata: Record<string, any>;
}

export class BrahmaExecutorRegistration {
  private consoleKit: ConsoleKit;
  private executorWallet: Wallet;
  private chainId: number;
  private registryId: string | null = null;

  constructor(
    apiKey: string,
    baseUrl: string,
    executorPrivateKey: string,
    rpcUrl: string,
    chainId: number = 1329
  ) {
    this.consoleKit = new ConsoleKit(apiKey, baseUrl);
    this.executorWallet = new Wallet(
      executorPrivateKey,
      new ethers.JsonRpcProvider(rpcUrl)
    );
    this.chainId = chainId;
  }

  /**
   * Step 1: Register executor on Console with policies
   */
  async registerExecutorOnConsole(clientId: string): Promise<string> {
    const executorAddress = this.executorWallet.address as Address;

    const executorConfig: ConsoleExecutorConfig = {
      clientId,
      executor: executorAddress,
      feeReceiver: ethers.ZeroAddress as Address,
      hopAddresses: [
        ...Object.values(SEI_PROTOCOL_ADDRESSES),
        CONSOLE_FEE_RECEIVER // Must be whitelisted
      ],
      inputTokens: [
        "0x0000000000000000000000000000000000000000", // Native SEI
        "0x785558a96899f7c10a20affaacd92b64fb9c8b0c", // USDC address on Sei
        "0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8" // Wrapped ETH on Sei
      ],
      limitPerExecution: true,
      timestamp: new Date().getTime()
    };

    const executorMetadata: ExecutorMetadata = {
      name: "sei-defi-agent-executor",
      logo: "",
      metadata: {
        description: "AI-powered DeFi automation for Sei blockchain",
        version: "1.0.0",
        protocols: ["Symphony", "Takara", "Silo", "Citrex"],
        strategies: ["yield_optimization", "risk_management", "portfolio_rebalancing"]
      }
    };

    try {
      // Generate registration signature
      const { domain, message, types } =
        await this.consoleKit.automationContext.generateConsoleExecutorRegistration712Message(
          this.chainId,
          executorConfig
        );

      const executorRegistrationSignature = await this.executorWallet.signTypedData(
        domain,
        types,
        message
      );

      logger.info('Executor Console registration signature generated');

      // Register on Console
      const executorData =
        await this.consoleKit.automationContext.registerExecutorOnConsole(
          executorRegistrationSignature,
          this.chainId,
          executorConfig,
          executorMetadata.name,
          executorMetadata.logo,
          executorMetadata.metadata
        );

      if (!executorData) {
        throw new Error("Failed to register executor on Console");
      }

      this.registryId = executorData.id;
      logger.info(`Executor registered on Console with ID: ${this.registryId}`);
      
      return this.registryId;
    } catch (error) {
      logger.error('Failed to register executor on Console:', error);
      throw error;
    }
  }

  /**
   * Step 2: Register executor on Kernel for hosted workflows
   */
  async registerExecutorOnKernel(registryId?: string): Promise<any> {
    const targetRegistryId = registryId || this.registryId;
    
    if (!targetRegistryId) {
      throw new Error("Registry ID not found. Register on Console first.");
    }

    const kernelConfig: KernelExecutorConfig = {
      defaultEvery: "300s", // 5 minutes default
      executionTTL: "180s", // 3 minutes to execute
      type: "INTERVAL"
    };

    try {
      // Generate Kernel registration signature
      const { domain, message, types } =
        await this.consoleKit.automationContext.generateKernelExecutorRegistration712Message(
          this.chainId,
          targetRegistryId,
          kernelConfig
        );

      const kernelRegistrationSignature = await this.executorWallet.signTypedData(
        domain,
        types,
        message
      );

      logger.info('Executor Kernel registration signature generated');

      // Register on Kernel
      await this.consoleKit.automationContext.registerExecutorOnKernel(
        targetRegistryId,
        kernelRegistrationSignature,
        kernelConfig
      );

      // Fetch executor details to confirm registration
      const executorDetails = await this.consoleKit.automationContext.fetchExecutorDetails(
        targetRegistryId
      );

      logger.info('Executor successfully registered on Kernel');
      return executorDetails;
    } catch (error) {
      logger.error('Failed to register executor on Kernel:', error);
      throw error;
    }
  }

  /**
   * Complete registration process
   */
  async completeRegistration(clientId: string): Promise<{
    registryId: string;
    executorDetails: any;
  }> {
    try {
      logger.info('Starting Brahma executor registration process...');
      
      // Step 1: Register on Console
      const registryId = await this.registerExecutorOnConsole(clientId);
      
      // Step 2: Register on Kernel
      const executorDetails = await this.registerExecutorOnKernel(registryId);
      
      logger.info('Brahma executor registration completed successfully');
      
      return {
        registryId,
        executorDetails
      };
    } catch (error) {
      logger.error('Executor registration failed:', error);
      throw error;
    }
  }

  getRegistryId(): string | null {
    return this.registryId;
  }

  getConsoleKit(): ConsoleKit {
    return this.consoleKit;
  }

  getExecutorWallet(): Wallet {
    return this.executorWallet;
  }
}

// Utility function for one-time registration
export async function registerSeiDeFiExecutor(): Promise<void> {
  const registration = new BrahmaExecutorRegistration(
    process.env.BRAHMA_API_KEY!,
    process.env.BRAHMA_API_URL || 'https://dev.console.fi/',
    process.env.EXECUTOR_PRIVATE_KEY!,
    process.env.RPC_URL || 'https://evm-rpc.sei-apis.com',
    parseInt(process.env.CHAIN_ID || '1329')
  );

  const result = await registration.completeRegistration(
    process.env.EXECUTOR_CLIENT_ID || 'sei-defi-agent'
  );

  logger.info('Registration completed:', result);
}

// Run registration if this file is executed directly
if (require.main === module) {
  registerSeiDeFiExecutor().catch((error) => {
    logger.error('Registration failed:', error);
    process.exit(1);
  });
} 