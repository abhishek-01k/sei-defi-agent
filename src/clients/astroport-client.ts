import axios, { AxiosInstance } from 'axios';
import { Address, formatUnits, parseUnits } from 'viem';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { logger } from '../utils/logger';
import {
  SeiToken,
  ApiResponse,
  AgentError
} from '../types';

// Astroport Contract ABIs for Sei
const ASTROPORT_FACTORY_ABI = [
  'function pair(address token1, address token2) view returns (address)',
  'function pairs(address pair) view returns (address, address, address)',
  'function allPairs(uint256 index) view returns (address)',
  'function allPairsLength() view returns (uint256)',
  'function createPair(address tokenA, address tokenB, uint24 pairType, bytes calldata initParams) returns (address pair)',
  'function fee() view returns (uint256)',
  'function feeToSetter() view returns (address)',
  'function feeTo() view returns (address)'
];

const ASTROPORT_PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function price0CumulativeLast() view returns (uint256)',
  'function price1CumulativeLast() view returns (uint256)',
  'function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data)',
  'function mint(address to) returns (uint256 liquidity)',
  'function burn(address to) returns (uint256 amount0, uint256 amount1)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function transferFrom(address from, address to, uint256 value) returns (bool)',
  'function MINIMUM_LIQUIDITY() view returns (uint256)',
  'function factory() view returns (address)',
  'function kLast() view returns (uint256)'
];

const ASTROPORT_ROUTER_ABI = [
  'function factory() view returns (address)',
  'function WETH() view returns (address)',
  'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
  'function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)',
  'function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) returns (uint256 amountToken, uint256 amountETH)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) payable returns (uint256[] memory amounts)',
  'function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint256 deadline) payable returns (uint256[] memory amounts)',
  'function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) pure returns (uint256 amountB)',
  'function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) pure returns (uint256 amountOut)',
  'function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) pure returns (uint256 amountIn)',
  'function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)',
  'function getAmountsIn(uint256 amountOut, address[] calldata path) view returns (uint256[] memory amounts)'
];

export interface AstroportPair {
  address: Address;
  token0: Address;
  token1: Address;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  liquidity: string;
  volume24h: string;
  apy: string;
  fee: string;
}

export interface AstroportRoute {
  path: Address[];
  amounts: string[];
  priceImpact: string;
  fee: string;
  estimatedGas: string;
}

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  priceImpact: string;
  fee: string;
  route: AstroportRoute;
  slippage: string;
  minimumAmountOut: string;
}

export interface LiquidityPosition {
  pairAddress: Address;
  token0: Address;
  token1: Address;
  liquidity: string;
  token0Amount: string;
  token1Amount: string;
  shareOfPool: string;
  token0Symbol: string;
  token1Symbol: string;
  usdValue: string;
  apy: string;
}

export class AstroportClient {
  private readonly provider: ethers.Provider;
  private readonly factoryContract: ethers.Contract;
  private readonly routerContract: ethers.Contract;
  private readonly chainId: number;
  private readonly httpClient: AxiosInstance;

  // Real Astroport contract addresses on Sei mainnet
  // These are placeholder addresses - would need to be updated with actual deployed addresses
  private readonly FACTORY_ADDRESS = '0x3c1d6b4A0f1F1c7F8E8C9A8B7D6E5F4A3B2C1D0E9F8';
  private readonly ROUTER_ADDRESS = '0x4d2e7c5B1f2F2d8F9E9D0A9C8E7F6A5B4C3D2E1F0A9';
  private readonly WSEI_ADDRESS = '0x5e3f8d6C2f3F3e9F0F0E1B0D9F8A7B6C5D4E3F2A1B0';

  constructor(
    rpcUrl: string,
    chainId: number = 1329
  ) {
    this.chainId = chainId;
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.factoryContract = new ethers.Contract(
      this.FACTORY_ADDRESS,
      ASTROPORT_FACTORY_ABI,
      this.provider
    );
    this.routerContract = new ethers.Contract(
      this.ROUTER_ADDRESS,
      ASTROPORT_ROUTER_ABI,
      this.provider
    );

    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Get all available trading pairs
   */
  async getAllPairs(): Promise<ApiResponse<AstroportPair[]>> {
    try {
      logger.info('Fetching all Astroport pairs');

      const pairsLength = await this.factoryContract.allPairsLength();
      const pairs: AstroportPair[] = [];

      for (let i = 0; i < pairsLength; i++) {
        const pairAddress = await this.factoryContract.allPairs(i);
        const pairInfo = await this.getPairInfo(pairAddress);
        if (pairInfo) {
          pairs.push(pairInfo);
        }
      }

      return {
        success: true,
        data: pairs,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error fetching Astroport pairs:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get detailed information about a specific pair
   */
  async getPairInfo(pairAddress: Address): Promise<AstroportPair | null> {
    try {
      const pairContract = new ethers.Contract(pairAddress, ASTROPORT_PAIR_ABI, this.provider);
      
      const [token0, token1, reserves, totalSupply] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
        pairContract.totalSupply()
      ]);

      // Get token information
      const [token0Info, token1Info] = await Promise.all([
        this.getTokenInfo(token0),
        this.getTokenInfo(token1)
      ]);

      return {
        address: pairAddress,
        token0,
        token1,
        reserve0: reserves[0].toString(),
        reserve1: reserves[1].toString(),
        totalSupply: totalSupply.toString(),
        token0Symbol: token0Info.symbol,
        token1Symbol: token1Info.symbol,
        token0Decimals: token0Info.decimals,
        token1Decimals: token1Info.decimals,
        liquidity: await this.calculateLiquidity(reserves[0], reserves[1], token0Info.decimals, token1Info.decimals),
        volume24h: '0', // Would need to implement volume tracking
        apy: '0', // Would need to implement APY calculation
        fee: '0.3' // Standard Astroport fee
      };
    } catch (error) {
      logger.error(`Error getting pair info for ${pairAddress}:`, error);
      return null;
    }
  }

  /**
   * Get swap quote for token exchange
   */
  async getSwapQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: string,
    slippage: number = 0.5
  ): Promise<ApiResponse<SwapQuote>> {
    try {
      logger.info(`Getting swap quote: ${amountIn} ${tokenIn} -> ${tokenOut}`);

      // Find the best route
      const route = await this.findBestRoute(tokenIn, tokenOut, amountIn);
      if (!route) {
        throw new Error('No route found for this swap');
      }

      const amountOut = route.amounts[route.amounts.length - 1];
      const priceImpact = await this.calculatePriceImpact(tokenIn, tokenOut, amountIn, amountOut);
      const fee = await this.calculateFee(amountIn);
      const slippageAmount = new BigNumber(amountOut).multipliedBy(slippage / 100);
      const minimumAmountOut = new BigNumber(amountOut).minus(slippageAmount).toString();

      const quote: SwapQuote = {
        amountIn,
        amountOut,
        priceImpact,
        fee,
        route,
        slippage: slippage.toString(),
        minimumAmountOut
      };

      return {
        success: true,
        data: quote,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error getting swap quote:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Execute a token swap
   */
  async executeSwap(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: string,
    amountOutMin: string,
    to: Address,
    deadline: number = Math.floor(Date.now() / 1000) + 1200 // 20 minutes
  ): Promise<any> {
    try {
      logger.info(`Executing swap: ${amountIn} ${tokenIn} -> ${tokenOut}`);

      const route = await this.findBestRoute(tokenIn, tokenOut, amountIn);
      if (!route) {
        throw new Error('No route found for this swap');
      }

      // Build transaction data
      const txData = this.routerContract.interface.encodeFunctionData(
        'swapExactTokensForTokens',
        [amountIn, amountOutMin, route.path, to, deadline]
      );

      return {
        to: this.ROUTER_ADDRESS,
        data: txData,
        value: '0',
        gasLimit: route.estimatedGas
      };
    } catch (error) {
      logger.error('Error executing swap:', error);
      throw error;
    }
  }

  /**
   * Add liquidity to a pair
   */
  async addLiquidity(
    tokenA: Address,
    tokenB: Address,
    amountADesired: string,
    amountBDesired: string,
    amountAMin: string,
    amountBMin: string,
    to: Address,
    deadline: number = Math.floor(Date.now() / 1000) + 1200
  ): Promise<any> {
    try {
      logger.info(`Adding liquidity: ${amountADesired} ${tokenA} + ${amountBDesired} ${tokenB}`);

      const txData = this.routerContract.interface.encodeFunctionData(
        'addLiquidity',
        [tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline]
      );

      return {
        to: this.ROUTER_ADDRESS,
        data: txData,
        value: '0',
        gasLimit: '300000'
      };
    } catch (error) {
      logger.error('Error adding liquidity:', error);
      throw error;
    }
  }

  /**
   * Remove liquidity from a pair
   */
  async removeLiquidity(
    tokenA: Address,
    tokenB: Address,
    liquidity: string,
    amountAMin: string,
    amountBMin: string,
    to: Address,
    deadline: number = Math.floor(Date.now() / 1000) + 1200
  ): Promise<any> {
    try {
      logger.info(`Removing liquidity: ${liquidity} from ${tokenA}/${tokenB}`);

      const txData = this.routerContract.interface.encodeFunctionData(
        'removeLiquidity',
        [tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline]
      );

      return {
        to: this.ROUTER_ADDRESS,
        data: txData,
        value: '0',
        gasLimit: '250000'
      };
    } catch (error) {
      logger.error('Error removing liquidity:', error);
      throw error;
    }
  }

  /**
   * Get user's liquidity positions
   */
  async getUserLiquidityPositions(userAddress: Address): Promise<ApiResponse<LiquidityPosition[]>> {
    try {
      logger.info(`Getting liquidity positions for ${userAddress}`);

      const pairs = await this.getAllPairs();
      if (!pairs.success || !pairs.data) {
        throw new Error('Failed to fetch pairs');
      }

      const positions: LiquidityPosition[] = [];

      for (const pair of pairs.data) {
        const pairContract = new ethers.Contract(pair.address, ASTROPORT_PAIR_ABI, this.provider);
        const balance = await pairContract.balanceOf(userAddress);
        
        if (balance > 0) {
          const totalSupply = await pairContract.totalSupply();
          const shareOfPool = new BigNumber(balance.toString())
            .dividedBy(totalSupply.toString())
            .multipliedBy(100)
            .toString();

          const token0Amount = new BigNumber(pair.reserve0)
            .multipliedBy(balance.toString())
            .dividedBy(totalSupply.toString())
            .toString();

          const token1Amount = new BigNumber(pair.reserve1)
            .multipliedBy(balance.toString())
            .dividedBy(totalSupply.toString())
            .toString();

          positions.push({
            pairAddress: pair.address,
            token0: pair.token0,
            token1: pair.token1,
            liquidity: balance.toString(),
            token0Amount,
            token1Amount,
            shareOfPool,
            token0Symbol: pair.token0Symbol,
            token1Symbol: pair.token1Symbol,
            usdValue: '0', // Would need price oracle
            apy: pair.apy
          });
        }
      }

      return {
        success: true,
        data: positions,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error getting liquidity positions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Find the best route for a swap
   */
  private async findBestRoute(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: string
  ): Promise<AstroportRoute | null> {
    try {
      // Direct route
      const directPair = await this.factoryContract.pair(tokenIn, tokenOut);
      if (directPair !== ethers.ZeroAddress) {
        const amounts = await this.routerContract.getAmountsOut(amountIn, [tokenIn, tokenOut]);
        return {
          path: [tokenIn, tokenOut],
          amounts: amounts.map((amount: any) => amount.toString()),
          priceImpact: '0',
          fee: '0.3',
          estimatedGas: '150000'
        };
      }

      // Route through WSEI
      const wsei = this.WSEI_ADDRESS;
      if (tokenIn !== wsei && tokenOut !== wsei) {
        const pair1 = await this.factoryContract.pair(tokenIn, wsei);
        const pair2 = await this.factoryContract.pair(wsei, tokenOut);
        
        if (pair1 !== ethers.ZeroAddress && pair2 !== ethers.ZeroAddress) {
          const amounts = await this.routerContract.getAmountsOut(amountIn, [tokenIn, wsei, tokenOut]);
          return {
            path: [tokenIn, wsei, tokenOut],
            amounts: amounts.map((amount: any) => amount.toString()),
            priceImpact: '0',
            fee: '0.6', // Double fee for two hops
            estimatedGas: '200000'
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('Error finding route:', error);
      return null;
    }
  }

  /**
   * Calculate price impact for a swap
   */
  private async calculatePriceImpact(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: string,
    amountOut: string
  ): Promise<string> {
    try {
      // Simplified price impact calculation
      // In a real implementation, you'd calculate based on reserves and swap size
      const impact = new BigNumber(amountIn).dividedBy(amountOut).minus(1).multipliedBy(100);
      return impact.absoluteValue().toString();
    } catch (error) {
      logger.error('Error calculating price impact:', error);
      return '0';
    }
  }

  /**
   * Calculate swap fee
   */
  private async calculateFee(amountIn: string): Promise<string> {
    // Standard Astroport fee is 0.3%
    return new BigNumber(amountIn).multipliedBy(0.003).toString();
  }

  /**
   * Calculate liquidity value in USD
   */
  private async calculateLiquidity(
    reserve0: any,
    reserve1: any,
    decimals0: number,
    decimals1: number
  ): Promise<string> {
    try {
      // Simplified liquidity calculation
      // In a real implementation, you'd use price oracles
      const amount0 = new BigNumber(reserve0.toString()).dividedBy(Math.pow(10, decimals0));
      const amount1 = new BigNumber(reserve1.toString()).dividedBy(Math.pow(10, decimals1));
      
      // Assume 1:1 USD ratio for simplicity
      return amount0.plus(amount1).toString();
    } catch (error) {
      logger.error('Error calculating liquidity:', error);
      return '0';
    }
  }

  /**
   * Get token information
   */
  private async getTokenInfo(tokenAddress: Address): Promise<{
    symbol: string;
    decimals: number;
    name: string;
  }> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)',
          'function name() view returns (string)'
        ],
        this.provider
      );

      const [symbol, decimals, name] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.name()
      ]);

      return { symbol, decimals, name };
    } catch (error) {
      logger.error(`Error getting token info for ${tokenAddress}:`, error);
      return { symbol: 'UNKNOWN', decimals: 18, name: 'Unknown Token' };
    }
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<string> {
    try {
      const gasPrice = await this.provider.getFeeData();
      return gasPrice.gasPrice?.toString() || '1000000000';
    } catch (error) {
      logger.error('Error getting gas price:', error);
      return '1000000000'; // 1 gwei fallback
    }
  }
} 