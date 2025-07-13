import axios, { AxiosInstance } from 'axios';
import { Address, formatUnits, parseUnits } from 'viem';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { logger } from '../utils/logger';
import {
  YeiMarket,
  YeiPosition,
  YeiUserAccount,
  YieldOpportunity,
  ApiResponse,
  YeiApiResponse,
  SeiToken,
  AgentError
} from '../types';

// Yei Finance Contract ABIs (simplified for key functions)
const YEI_COMPTROLLER_ABI = [
  'function getAccountLiquidity(address account) view returns (uint256, uint256, uint256)',
  'function markets(address yToken) view returns (bool, uint256, bool)',
  'function getAllMarkets() view returns (address[])',
  'function getAssetsIn(address account) view returns (address[])',
  'function enterMarkets(address[] calldata yTokens) returns (uint256[])',
  'function exitMarket(address yToken) returns (uint256)',
  'function claimReward(address holder)',
  'function rewardSpeeds(address yToken) view returns (uint256)'
];

const YEI_YTOKEN_ABI = [
  'function mint(uint256 mintAmount) returns (uint256)',
  'function redeem(uint256 redeemTokens) returns (uint256)',
  'function redeemUnderlying(uint256 redeemAmount) returns (uint256)',
  'function borrow(uint256 borrowAmount) returns (uint256)',
  'function repayBorrow(uint256 repayAmount) returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function balanceOfUnderlying(address owner) returns (uint256)',
  'function borrowBalanceCurrent(address account) returns (uint256)',
  'function getAccountSnapshot(address account) view returns (uint256, uint256, uint256, uint256)',
  'function supplyRatePerBlock() view returns (uint256)',
  'function borrowRatePerBlock() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function totalBorrows() view returns (uint256)',
  'function getCash() view returns (uint256)',
  'function underlying() view returns (address)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)'
];

const YEI_PRICE_ORACLE_ABI = [
  'function getUnderlyingPrice(address yToken) view returns (uint256)',
  'function price(string memory symbol) view returns (uint256)'
];

export class YeiClient {
  private readonly httpClient: AxiosInstance;
  private readonly provider: ethers.Provider;
  private readonly comptrollerContract: ethers.Contract;
  private readonly oracleContract: ethers.Contract;
  private readonly baseUrl: string;
  private readonly chainId: number;

  // Contract addresses on Sei (these would be actual deployed addresses)
  private readonly COMPTROLLER_ADDRESS = '0x1234567890123456789012345678901234567890';
  private readonly ORACLE_ADDRESS = '0x2345678901234567890123456789012345678901';

  constructor(
    baseUrl: string,
    rpcUrl: string,
    chainId: number = 1329
  ) {
    this.baseUrl = baseUrl;
    this.chainId = chainId;
    
    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.comptrollerContract = new ethers.Contract(
      this.COMPTROLLER_ADDRESS,
      YEI_COMPTROLLER_ABI,
      this.provider
    );
    this.oracleContract = new ethers.Contract(
      this.ORACLE_ADDRESS,
      YEI_PRICE_ORACLE_ABI,
      this.provider
    );

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.httpClient.interceptors.request.use(
      (config) => {
        logger.debug(`Making request to ${config.url}`, { params: config.params });
        return config;
      },
      (error) => {
        logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug(`Response from ${response.config.url}:`, { status: response.status });
        return response;
      },
      (error) => {
        logger.error('Response interceptor error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get all available markets on Yei Finance
   */
  async getMarkets(): Promise<YeiApiResponse<YeiMarket[]>> {
    try {
      logger.info('Fetching Yei Finance markets');
      
      // Get market addresses from comptroller
      const marketAddresses = await this.comptrollerContract.getAllMarkets();
      const markets: YeiMarket[] = [];

      for (const marketAddress of marketAddresses) {
        const market = await this.getMarketInfo(marketAddress);
        if (market) {
          markets.push(market);
        }
      }

      // Sort by TVL descending
      markets.sort((a, b) => new BigNumber(b.totalSupply).minus(a.totalSupply).toNumber());

      logger.info(`Successfully fetched ${markets.length} markets`);
      return {
        success: true,
        data: markets,
        timestamp: Date.now(),
        blockNumber: await this.provider.getBlockNumber()
      };
    } catch (error) {
      logger.error('Error fetching markets:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get detailed information about a specific market
   */
  async getMarketInfo(marketAddress: Address): Promise<YeiMarket | null> {
    try {
      const yTokenContract = new ethers.Contract(marketAddress, YEI_YTOKEN_ABI, this.provider);
      
      // Get basic market info
      const [
        symbol,
        name,
        decimals,
        underlying,
        totalSupply,
        totalBorrows,
        cash,
        supplyRate,
        borrowRate,
        marketInfo
      ] = await Promise.all([
        yTokenContract.symbol(),
        yTokenContract.name(),
        yTokenContract.decimals(),
        yTokenContract.underlying(),
        yTokenContract.totalSupply(),
        yTokenContract.totalBorrows(),
        yTokenContract.getCash(),
        yTokenContract.supplyRatePerBlock(),
        yTokenContract.borrowRatePerBlock(),
        this.comptrollerContract.markets(marketAddress)
      ]);

      // Calculate APYs (assuming 2.5 second block time on Sei)
      const blocksPerYear = (365 * 24 * 60 * 60) / 2.5;
      const supplyAPY = new BigNumber(supplyRate.toString())
        .multipliedBy(blocksPerYear)
        .dividedBy(1e18)
        .multipliedBy(100)
        .toFixed(2);
      
      const borrowAPY = new BigNumber(borrowRate.toString())
        .multipliedBy(blocksPerYear)
        .dividedBy(1e18)
        .multipliedBy(100)
        .toFixed(2);

      // Calculate utilization rate
      const totalSupplyUnderlying = new BigNumber(cash.toString()).plus(totalBorrows.toString());
      const utilizationRate = totalSupplyUnderlying.isZero() 
        ? '0'
        : new BigNumber(totalBorrows.toString())
            .dividedBy(totalSupplyUnderlying)
            .multipliedBy(100)
            .toFixed(2);

      const market: YeiMarket = {
        id: marketAddress.toLowerCase(),
        symbol: symbol.replace('y', ''), // Remove 'y' prefix
        name,
        underlyingAsset: underlying,
        yTokenAddress: marketAddress,
        supplyAPY,
        borrowAPY,
        totalSupply: formatUnits(totalSupply, decimals),
        totalBorrow: formatUnits(totalBorrows, decimals),
        liquidity: formatUnits(cash, decimals),
        utilizationRate,
        collateralFactor: formatUnits(marketInfo[1], 18),
        reserveFactor: '10', // Default reserve factor
        isActive: marketInfo[0],
        isPaused: !marketInfo[2]
      };

      return market;
    } catch (error) {
      logger.error(`Error getting market info for ${marketAddress}:`, error);
      return null;
    }
  }

  /**
   * Get user account information including all positions
   */
  async getUserAccount(userAddress: Address): Promise<YeiApiResponse<YeiUserAccount>> {
    try {
      logger.info(`Fetching user account for ${userAddress}`);
      
      // Get user's entered markets
      const enteredMarkets = await this.comptrollerContract.getAssetsIn(userAddress);
      const positions: YeiPosition[] = [];
      
      let totalSuppliedUSD = new BigNumber(0);
      let totalBorrowedUSD = new BigNumber(0);
      let totalCollateralUSD = new BigNumber(0);

      // Get positions for each market
      for (const marketAddress of enteredMarkets) {
        const position = await this.getUserPosition(userAddress, marketAddress);
        if (position) {
          positions.push(position);
          
          // Get USD values (simplified - would need actual price oracle)
          const market = await this.getMarketInfo(marketAddress);
          if (market) {
            const price = await this.getTokenPrice(market.underlyingAsset);
            totalSuppliedUSD = totalSuppliedUSD.plus(
              new BigNumber(position.suppliedAmount).multipliedBy(price)
            );
            totalBorrowedUSD = totalBorrowedUSD.plus(
              new BigNumber(position.borrowedAmount).multipliedBy(price)
            );
            totalCollateralUSD = totalCollateralUSD.plus(
              new BigNumber(position.collateralAmount).multipliedBy(price)
            );
          }
        }
      }

      // Calculate health factor
      const accountLiquidity = await this.comptrollerContract.getAccountLiquidity(userAddress);
      const healthFactor = this.calculateHealthFactor(
        totalCollateralUSD.toString(),
        totalBorrowedUSD.toString(),
        accountLiquidity[1].toString()
      );

      const userAccount: YeiUserAccount = {
        address: userAddress,
        totalSuppliedUSD: totalSuppliedUSD.toFixed(2),
        totalBorrowedUSD: totalBorrowedUSD.toFixed(2),
        totalCollateralUSD: totalCollateralUSD.toFixed(2),
        healthFactor,
        positions
      };

      logger.info(`Successfully fetched user account with ${positions.length} positions`);
      return {
        success: true,
        data: userAccount,
        timestamp: Date.now(),
        blockNumber: await this.provider.getBlockNumber()
      };
    } catch (error) {
      logger.error('Error fetching user account:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get user position in a specific market
   */
  async getUserPosition(userAddress: Address, marketAddress: Address): Promise<YeiPosition | null> {
    try {
      const yTokenContract = new ethers.Contract(marketAddress, YEI_YTOKEN_ABI, this.provider);
      const market = await this.getMarketInfo(marketAddress);
      
      if (!market) return null;

      // Get account snapshot
      const snapshot = await yTokenContract.getAccountSnapshot(userAddress);
      const yTokenBalance = snapshot[1];
      const borrowBalance = snapshot[2];
      const exchangeRate = snapshot[3];

      // Calculate underlying amounts
      const suppliedAmount = new BigNumber(yTokenBalance.toString())
        .multipliedBy(exchangeRate.toString())
        .dividedBy(1e18)
        .dividedBy(10 ** 18)
        .toFixed(6);

      const borrowedAmount = formatUnits(borrowBalance, 18);

      // Calculate collateral amount (supplied * collateral factor)
      const collateralAmount = new BigNumber(suppliedAmount)
        .multipliedBy(market.collateralFactor)
        .toFixed(6);

      // Calculate liquidation threshold (simplified)
      const liquidationThreshold = new BigNumber(market.collateralFactor)
        .multipliedBy(0.8) // 80% of collateral factor
        .toFixed(6);

      // Calculate health factor for this position
      const healthFactor = borrowedAmount === '0' 
        ? '999999' 
        : new BigNumber(collateralAmount)
            .dividedBy(borrowedAmount)
            .toFixed(6);

      const position: YeiPosition = {
        id: `${userAddress}-${marketAddress}`,
        market,
        user: userAddress,
        suppliedAmount,
        borrowedAmount,
        collateralAmount,
        healthFactor,
        liquidationThreshold,
        lastUpdateBlock: await this.provider.getBlockNumber()
      };

      return position;
    } catch (error) {
      logger.error(`Error getting user position for ${marketAddress}:`, error);
      return null;
    }
  }

  /**
   * Get yield opportunities sorted by APY
   */
  async getYieldOpportunities(
    minLiquidity: string = '10000',
    riskLevel: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<YeiApiResponse<YieldOpportunity[]>> {
    try {
      logger.info('Fetching yield opportunities');
      
      const marketsResponse = await this.getMarkets();
      if (!marketsResponse.success || !marketsResponse.data) {
        throw new Error('Failed to fetch markets');
      }

      const opportunities: YieldOpportunity[] = marketsResponse.data
        .filter(market => {
          // Filter by liquidity
          if (new BigNumber(market.liquidity).lt(minLiquidity)) return false;
          
          // Filter by risk level
          const utilizationRate = parseFloat(market.utilizationRate);
          switch (riskLevel) {
            case 'low':
              return utilizationRate < 70;
            case 'medium':
              return utilizationRate < 85;
            case 'high':
              return true;
            default:
              return true;
          }
        })
        .map(market => {
          // Calculate risk level based on various factors
          const utilizationRate = parseFloat(market.utilizationRate);
          const tvl = new BigNumber(market.totalSupply).multipliedBy(100); // Simplified TVL calculation
          
          let risk: 'low' | 'medium' | 'high' = 'medium';
          if (utilizationRate < 70 && tvl.gt(1000000)) risk = 'low';
          else if (utilizationRate > 85 || tvl.lt(100000)) risk = 'high';

          const opportunity: YieldOpportunity = {
            protocol: 'yei',
            market,
            apy: market.supplyAPY,
            tvl: tvl.toFixed(2),
            risk,
            liquidity: market.liquidity,
            minDeposit: '1',
            maxDeposit: new BigNumber(market.liquidity).multipliedBy(0.1).toFixed(2) // 10% of liquidity
          };

          return opportunity;
        })
        .sort((a, b) => parseFloat(b.apy) - parseFloat(a.apy)); // Sort by APY descending

      logger.info(`Found ${opportunities.length} yield opportunities`);
      return {
        success: true,
        data: opportunities,
        timestamp: Date.now(),
        blockNumber: await this.provider.getBlockNumber()
      };
    } catch (error) {
      logger.error('Error fetching yield opportunities:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get token price from oracle
   */
  async getTokenPrice(tokenAddress: Address): Promise<string> {
    try {
      // This would use the actual price oracle
      // For now, return a mock price
      const mockPrices: { [key: string]: string } = {
        '0x0000000000000000000000000000000000000000': '1', // SEI
        '0x1111111111111111111111111111111111111111': '1', // USDC
        '0x2222222222222222222222222222222222222222': '2000', // WETH
        '0x3333333333333333333333333333333333333333': '30000' // WBTC
      };

      return mockPrices[tokenAddress.toLowerCase()] || '1';
    } catch (error) {
      logger.error(`Error getting token price for ${tokenAddress}:`, error);
      return '1';
    }
  }

  /**
   * Calculate health factor
   */
  private calculateHealthFactor(
    collateralUSD: string,
    borrowedUSD: string,
    liquidityShortfall: string
  ): string {
    if (borrowedUSD === '0') return '999999';
    
    const collateral = new BigNumber(collateralUSD);
    const borrowed = new BigNumber(borrowedUSD);
    
    if (borrowed.isZero()) return '999999';
    
    return collateral.dividedBy(borrowed).toFixed(6);
  }

  /**
   * Get real-time market data via WebSocket (placeholder)
   */
  async subscribeToMarketUpdates(
    callback: (market: YeiMarket) => void
  ): Promise<void> {
    // This would implement WebSocket connection to get real-time updates
    logger.info('Market updates subscription would be implemented here');
  }

  /**
   * Get historical APY data for a market
   */
  async getHistoricalAPY(
    marketAddress: Address,
    days: number = 30
  ): Promise<YeiApiResponse<Array<{ timestamp: number; supplyAPY: string; borrowAPY: string }>>> {
    try {
      // This would fetch historical data from an indexer or API
      // For now, return mock data
      const mockData = Array.from({ length: days }, (_, i) => ({
        timestamp: Date.now() - (days - i) * 24 * 60 * 60 * 1000,
        supplyAPY: (Math.random() * 10 + 5).toFixed(2),
        borrowAPY: (Math.random() * 15 + 8).toFixed(2)
      }));

      return {
        success: true,
        data: mockData,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error fetching historical APY:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Estimate transaction gas cost
   */
  async estimateGas(
    method: string,
    params: any[]
  ): Promise<string> {
    try {
      // This would estimate gas for the specific transaction
      // For now, return a default estimate
      const gasEstimates: { [key: string]: string } = {
        'mint': '150000',
        'redeem': '120000',
        'borrow': '180000',
        'repayBorrow': '140000',
        'enterMarkets': '100000',
        'exitMarket': '80000'
      };

      return gasEstimates[method] || '200000';
    } catch (error) {
      logger.error('Error estimating gas:', error);
      return '200000';
    }
  }

  /**
   * Get supported tokens
   */
  async getSupportedTokens(): Promise<YeiApiResponse<SeiToken[]>> {
    try {
      const marketsResponse = await this.getMarkets();
      if (!marketsResponse.success || !marketsResponse.data) {
        throw new Error('Failed to fetch markets');
      }

      const tokens: SeiToken[] = marketsResponse.data.map(market => ({
        address: market.underlyingAsset,
        symbol: market.symbol,
        name: market.name,
        decimals: 18, // Default decimals
        totalSupply: market.totalSupply,
        price: '1', // Would get from price oracle
        priceChange24h: '0',
        volume24h: '0'
      }));

      return {
        success: true,
        data: tokens,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error fetching supported tokens:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }
} 