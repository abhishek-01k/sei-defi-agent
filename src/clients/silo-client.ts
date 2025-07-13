import axios, { AxiosInstance } from 'axios';
import { Address, formatUnits, parseUnits } from 'viem';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { logger } from '../utils/logger';
import {
  ApiResponse,
  AgentError
} from '../types';

// Silo Liquid Staking Contract ABIs
const SILO_HUB_ABI = [
  'function bond(uint256 amount) payable',
  'function unbond(uint256 amount)',
  'function withdraw(uint256 amount)',
  'function claim()',
  'function getExchangeRate() view returns (uint256)',
  'function getTotalBonded() view returns (uint256)',
  'function getTotalUnbonding() view returns (uint256)',
  'function getUserBond(address user) view returns (uint256)',
  'function getUserUnbonding(address user) view returns (uint256)',
  'function getUserRewards(address user) view returns (uint256)',
  'function getUnbondingPeriod() view returns (uint256)',
  'function getMinimumBond() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function transferFrom(address from, address to, uint256 value) returns (bool)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

const SILO_REWARDS_ABI = [
  'function getRewardRate() view returns (uint256)',
  'function getStakingRewards(address user) view returns (uint256)',
  'function claimRewards()',
  'function getAPY() view returns (uint256)',
  'function getTotalRewards() view returns (uint256)',
  'function getRewardToken() view returns (address)'
];

export interface SiloStakingInfo {
  totalBonded: string;
  totalUnbonding: string;
  exchangeRate: string;
  unbondingPeriod: number;
  minimumBond: string;
  currentAPY: string;
  rewardRate: string;
  totalSupply: string;
  totalRewards: string;
}

export interface SiloUserPosition {
  address: Address;
  bondedAmount: string;
  unbondingAmount: string;
  iSEIBalance: string;
  pendingRewards: string;
  shareOfPool: string;
  unbondingTime: number;
  estimatedValue: string;
}

export interface SiloUnbondingRequest {
  amount: string;
  completionTime: number;
  isReady: boolean;
}

export interface SiloStakeTransaction {
  type: 'bond' | 'unbond' | 'withdraw' | 'claim';
  amount: string;
  to: Address;
  data: string;
  gasLimit: string;
  value: string;
}

export class SiloClient {
  private readonly provider: ethers.Provider;
  private readonly hubContract: ethers.Contract;
  private readonly rewardsContract: ethers.Contract;
  private readonly chainId: number;
  private readonly httpClient: AxiosInstance;

  // Real Silo contract addresses on Sei mainnet
  // These are placeholder addresses - would need to be updated with actual deployed addresses
  private readonly HUB_ADDRESS = '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d';
  private readonly REWARDS_ADDRESS = '0x8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e';
  private readonly ISEI_TOKEN_ADDRESS = '0x9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f';

  constructor(
    rpcUrl: string,
    chainId: number = 1329
  ) {
    this.chainId = chainId;
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.hubContract = new ethers.Contract(
      this.HUB_ADDRESS,
      SILO_HUB_ABI,
      this.provider
    );
    this.rewardsContract = new ethers.Contract(
      this.REWARDS_ADDRESS,
      SILO_REWARDS_ABI,
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
   * Get general staking information
   */
  async getStakingInfo(): Promise<ApiResponse<SiloStakingInfo>> {
    try {
      logger.info('Fetching Silo staking information');

      const [
        totalBonded,
        totalUnbonding,
        exchangeRate,
        unbondingPeriod,
        minimumBond,
        totalSupply,
        currentAPY,
        rewardRate,
        totalRewards
      ] = await Promise.all([
        this.hubContract.getTotalBonded(),
        this.hubContract.getTotalUnbonding(),
        this.hubContract.getExchangeRate(),
        this.hubContract.getUnbondingPeriod(),
        this.hubContract.getMinimumBond(),
        this.hubContract.totalSupply(),
        this.rewardsContract.getAPY(),
        this.rewardsContract.getRewardRate(),
        this.rewardsContract.getTotalRewards()
      ]);

      const stakingInfo: SiloStakingInfo = {
        totalBonded: totalBonded.toString(),
        totalUnbonding: totalUnbonding.toString(),
        exchangeRate: formatUnits(exchangeRate, 18),
        unbondingPeriod: unbondingPeriod.toNumber(),
        minimumBond: totalBonded.toString(),
        currentAPY: formatUnits(currentAPY, 4), // Assuming 4 decimal places for APY
        rewardRate: rewardRate.toString(),
        totalSupply: totalSupply.toString(),
        totalRewards: totalRewards.toString()
      };

      return {
        success: true,
        data: stakingInfo,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error fetching Silo staking info:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get user's staking position
   */
  async getUserPosition(userAddress: Address): Promise<ApiResponse<SiloUserPosition>> {
    try {
      logger.info(`Fetching Silo position for ${userAddress}`);

      const [
        bondedAmount,
        unbondingAmount,
        iSEIBalance,
        pendingRewards,
        totalSupply,
        exchangeRate
      ] = await Promise.all([
        this.hubContract.getUserBond(userAddress),
        this.hubContract.getUserUnbonding(userAddress),
        this.hubContract.balanceOf(userAddress),
        this.rewardsContract.getStakingRewards(userAddress),
        this.hubContract.totalSupply(),
        this.hubContract.getExchangeRate()
      ]);

      const shareOfPool = totalSupply.gt(0) 
        ? new BigNumber(iSEIBalance.toString())
            .dividedBy(totalSupply.toString())
            .multipliedBy(100)
            .toString()
        : '0';

      const estimatedValue = new BigNumber(iSEIBalance.toString())
        .multipliedBy(exchangeRate.toString())
        .dividedBy(Math.pow(10, 18))
        .toString();

      const position: SiloUserPosition = {
        address: userAddress,
        bondedAmount: bondedAmount.toString(),
        unbondingAmount: unbondingAmount.toString(),
        iSEIBalance: iSEIBalance.toString(),
        pendingRewards: pendingRewards.toString(),
        shareOfPool,
        unbondingTime: 0, // Would need to track unbonding requests
        estimatedValue
      };

      return {
        success: true,
        data: position,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error fetching user position:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Stake SEI to receive iSEI
   */
  async stakeTokens(
    amount: string,
    userAddress: Address
  ): Promise<ApiResponse<SiloStakeTransaction>> {
    try {
      logger.info(`Staking ${amount} SEI for ${userAddress}`);

      const minimumBond = await this.hubContract.getMinimumBond();
      if (new BigNumber(amount).lt(minimumBond.toString())) {
        throw new Error(`Amount below minimum bond: ${minimumBond.toString()}`);
      }

      const txData = this.hubContract.interface.encodeFunctionData('bond', [amount]);

      const transaction: SiloStakeTransaction = {
        type: 'bond',
        amount,
        to: this.HUB_ADDRESS,
        data: txData,
        gasLimit: '200000',
        value: amount
      };

      return {
        success: true,
        data: transaction,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error staking tokens:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Unstake iSEI to initiate unbonding
   */
  async unstakeTokens(
    amount: string,
    userAddress: Address
  ): Promise<ApiResponse<SiloStakeTransaction>> {
    try {
      logger.info(`Unstaking ${amount} iSEI for ${userAddress}`);

      const userBalance = await this.hubContract.balanceOf(userAddress);
      if (new BigNumber(amount).gt(userBalance.toString())) {
        throw new Error(`Insufficient iSEI balance: ${userBalance.toString()}`);
      }

      const txData = this.hubContract.interface.encodeFunctionData('unbond', [amount]);

      const transaction: SiloStakeTransaction = {
        type: 'unbond',
        amount,
        to: this.HUB_ADDRESS,
        data: txData,
        gasLimit: '180000',
        value: '0'
      };

      return {
        success: true,
        data: transaction,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error unstaking tokens:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Withdraw unbonded tokens
   */
  async withdrawTokens(
    amount: string,
    userAddress: Address
  ): Promise<ApiResponse<SiloStakeTransaction>> {
    try {
      logger.info(`Withdrawing ${amount} unbonded SEI for ${userAddress}`);

      const unbondingAmount = await this.hubContract.getUserUnbonding(userAddress);
      if (new BigNumber(amount).gt(unbondingAmount.toString())) {
        throw new Error(`Insufficient unbonding amount: ${unbondingAmount.toString()}`);
      }

      const txData = this.hubContract.interface.encodeFunctionData('withdraw', [amount]);

      const transaction: SiloStakeTransaction = {
        type: 'withdraw',
        amount,
        to: this.HUB_ADDRESS,
        data: txData,
        gasLimit: '150000',
        value: '0'
      };

      return {
        success: true,
        data: transaction,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error withdrawing tokens:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Claim staking rewards
   */
  async claimRewards(userAddress: Address): Promise<ApiResponse<SiloStakeTransaction>> {
    try {
      logger.info(`Claiming rewards for ${userAddress}`);

      const pendingRewards = await this.rewardsContract.getStakingRewards(userAddress);
      if (pendingRewards.eq(0)) {
        throw new Error('No rewards to claim');
      }

      const txData = this.rewardsContract.interface.encodeFunctionData('claimRewards', []);

      const transaction: SiloStakeTransaction = {
        type: 'claim',
        amount: pendingRewards.toString(),
        to: this.REWARDS_ADDRESS,
        data: txData,
        gasLimit: '120000',
        value: '0'
      };

      return {
        success: true,
        data: transaction,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error claiming rewards:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get unbonding requests for a user
   */
  async getUnbondingRequests(userAddress: Address): Promise<ApiResponse<SiloUnbondingRequest[]>> {
    try {
      logger.info(`Getting unbonding requests for ${userAddress}`);

      const unbondingAmount = await this.hubContract.getUserUnbonding(userAddress);
      const unbondingPeriod = await this.hubContract.getUnbondingPeriod();

      // This is a simplified implementation
      // In reality, you'd need to track individual unbonding requests
      const requests: SiloUnbondingRequest[] = [];
      
      if (unbondingAmount.gt(0)) {
        requests.push({
          amount: unbondingAmount.toString(),
          completionTime: Date.now() + (unbondingPeriod.toNumber() * 1000),
          isReady: false // Would need to check actual completion time
        });
      }

      return {
        success: true,
        data: requests,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error getting unbonding requests:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Calculate expected rewards for a given amount and time
   */
  async calculateExpectedRewards(
    amount: string,
    days: number
  ): Promise<ApiResponse<string>> {
    try {
      logger.info(`Calculating expected rewards for ${amount} SEI over ${days} days`);

      const currentAPY = await this.rewardsContract.getAPY();
      const dailyRate = new BigNumber(currentAPY.toString())
        .dividedBy(Math.pow(10, 4)) // Assuming 4 decimal places
        .dividedBy(365);

      const expectedRewards = new BigNumber(amount)
        .multipliedBy(dailyRate)
        .multipliedBy(days)
        .toString();

      return {
        success: true,
        data: expectedRewards,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error calculating expected rewards:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get iSEI to SEI exchange rate
   */
  async getExchangeRate(): Promise<ApiResponse<string>> {
    try {
      logger.info('Getting iSEI to SEI exchange rate');

      const exchangeRate = await this.hubContract.getExchangeRate();
      const rate = formatUnits(exchangeRate, 18);

      return {
        success: true,
        data: rate,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error getting exchange rate:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get optimal staking amount based on user balance and strategy
   */
  async getOptimalStakingAmount(
    userBalance: string,
    riskTolerance: 'low' | 'medium' | 'high'
  ): Promise<ApiResponse<string>> {
    try {
      logger.info(`Calculating optimal staking amount for balance ${userBalance}`);

      const minimumBond = await this.hubContract.getMinimumBond();
      const balance = new BigNumber(userBalance);
      const minBond = new BigNumber(minimumBond.toString());

      if (balance.lt(minBond)) {
        throw new Error('Insufficient balance for minimum bond');
      }

      // Risk-based allocation
      let allocationPercentage: number;
      switch (riskTolerance) {
        case 'low':
          allocationPercentage = 0.3; // 30%
          break;
        case 'medium':
          allocationPercentage = 0.6; // 60%
          break;
        case 'high':
          allocationPercentage = 0.9; // 90%
          break;
        default:
          allocationPercentage = 0.5;
      }

      const optimalAmount = balance.multipliedBy(allocationPercentage);
      
      // Ensure it's at least the minimum bond
      const finalAmount = BigNumber.max(optimalAmount, minBond).toString();

      return {
        success: true,
        data: finalAmount,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error calculating optimal staking amount:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
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

  /**
   * Get iSEI token address
   */
  getISEITokenAddress(): Address {
    return this.ISEI_TOKEN_ADDRESS;
  }

  /**
   * Get hub contract address
   */
  getHubAddress(): Address {
    return this.HUB_ADDRESS;
  }

  /**
   * Get rewards contract address
   */
  getRewardsAddress(): Address {
    return this.REWARDS_ADDRESS;
  }
} 