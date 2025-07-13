import { Address } from 'viem';
import BigNumber from 'bignumber.js';
import { logger } from '../utils/logger';
import { YeiClient } from '../clients/yei-client';
import { AstroportClient } from '../clients/astroport-client';
import { SiloClient } from '../clients/silo-client';
import {
  YeiMarket,
  YeiPosition,
  YeiUserAccount,
  YieldOpportunity,
  RebalanceAction,
  PortfolioMetrics,
  RiskMetrics,
  RiskLimits,
  AgentConfig,
  ExecutionResult,
  TaskParams,
  RiskLevel
} from '../types';

export class YieldOptimizationStrategy {
  private yeiClient: YeiClient;
  private astroportClient: AstroportClient;
  private siloClient: SiloClient;
  private config: AgentConfig;
  private riskLimits: RiskLimits;

  constructor(
    yeiClient: YeiClient,
    astroportClient: AstroportClient,
    siloClient: SiloClient,
    config: AgentConfig,
    riskLimits: RiskLimits
  ) {
    this.yeiClient = yeiClient;
    this.astroportClient = astroportClient;
    this.siloClient = siloClient;
    this.config = config;
    this.riskLimits = riskLimits;
  }

  /**
   * Execute the main yield optimization strategy
   */
  async executeStrategy(taskParams: TaskParams): Promise<ExecutionResult> {
    try {
      logger.info(`Executing yield optimization strategy for ${taskParams.subAccountAddress}`);

      const { subAccountAddress, chainID, subscription } = taskParams;
      const { baseToken, targetAPY, riskTolerance = 'medium' } = subscription.metadata;

      // Step 1: Get current user account state
      const userAccountResponse = await this.yeiClient.getUserAccount(subAccountAddress);
      if (!userAccountResponse.success || !userAccountResponse.data) {
        return {
          skip: true,
          message: 'Failed to fetch user account data'
        };
      }

      const userAccount = userAccountResponse.data;
      
      // Step 2: Calculate current portfolio metrics
      const portfolioMetrics = await this.calculatePortfolioMetrics(userAccount);
      
      // Step 3: Assess risk
      const riskMetrics = await this.assessRisk(userAccount, portfolioMetrics);
      
      // Step 4: Check if rebalancing is needed
      const shouldRebalance = await this.shouldRebalance(
        userAccount,
        portfolioMetrics,
        riskMetrics,
        targetAPY
      );

      if (!shouldRebalance) {
        return {
          skip: true,
          message: `Portfolio is optimized. Current APY: ${portfolioMetrics.netAPY}%, Health Factor: ${portfolioMetrics.healthFactor}`
        };
      }

      // Step 5: Find yield opportunities
      const opportunitiesResponse = await this.yeiClient.getYieldOpportunities(
        '1000', // Min liquidity
        riskTolerance
      );

      if (!opportunitiesResponse.success || !opportunitiesResponse.data) {
        return {
          skip: true,
          message: 'Failed to fetch yield opportunities'
        };
      }

      // Step 6: Generate rebalancing actions
      const rebalanceActions = await this.generateRebalanceActions(
        userAccount,
        opportunitiesResponse.data,
        portfolioMetrics,
        riskMetrics,
        baseToken,
        targetAPY
      );

      if (rebalanceActions.length === 0) {
        return {
          skip: true,
          message: 'No profitable rebalancing opportunities found'
        };
      }

      // Step 7: Execute rebalancing actions
      const transactions = await this.executeRebalanceActions(
        rebalanceActions,
        subAccountAddress,
        chainID
      );

      const totalExpectedGain = rebalanceActions.reduce((sum, action) => {
        return sum.plus(action.expectedGain || '0');
      }, new BigNumber(0));

      logger.info(`Generated ${transactions.length} rebalancing transactions with expected gain: ${totalExpectedGain.toFixed(6)}`);

      return {
        skip: false,
        message: `Rebalancing portfolio with ${rebalanceActions.length} actions. Expected APY improvement: ${totalExpectedGain.toFixed(2)}%`,
        transactions,
        expectedProfit: totalExpectedGain.toFixed(6),
        riskAssessment: riskMetrics.overallRisk
      };

    } catch (error) {
      logger.error('Error executing yield optimization strategy:', error);
      return {
        skip: true,
        message: `Strategy execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Calculate comprehensive portfolio metrics
   */
  private async calculatePortfolioMetrics(userAccount: YeiUserAccount): Promise<PortfolioMetrics> {
    const totalValueUSD = new BigNumber(userAccount.totalSuppliedUSD)
      .minus(userAccount.totalBorrowedUSD);

    // Calculate weighted average APY
    let totalSupplyValue = new BigNumber(0);
    let totalBorrowValue = new BigNumber(0);
    let weightedSupplyAPY = new BigNumber(0);
    let weightedBorrowAPY = new BigNumber(0);

    for (const position of userAccount.positions) {
      const supplyValue = new BigNumber(position.suppliedAmount);
      const borrowValue = new BigNumber(position.borrowedAmount);
      const supplyAPY = new BigNumber(position.market.supplyAPY);
      const borrowAPY = new BigNumber(position.market.borrowAPY);

      totalSupplyValue = totalSupplyValue.plus(supplyValue);
      totalBorrowValue = totalBorrowValue.plus(borrowValue);

      weightedSupplyAPY = weightedSupplyAPY.plus(supplyValue.multipliedBy(supplyAPY));
      weightedBorrowAPY = weightedBorrowAPY.plus(borrowValue.multipliedBy(borrowAPY));
    }

    const avgSupplyAPY = totalSupplyValue.isZero() 
      ? new BigNumber(0) 
      : weightedSupplyAPY.dividedBy(totalSupplyValue);
    
    const avgBorrowAPY = totalBorrowValue.isZero() 
      ? new BigNumber(0) 
      : weightedBorrowAPY.dividedBy(totalBorrowValue);

    const netAPY = avgSupplyAPY.minus(avgBorrowAPY);

    // Calculate diversification score (0-100)
    const diversificationScore = this.calculateDiversificationScore(userAccount.positions);

    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore(userAccount.positions);

    // Calculate liquidity score (0-100)
    const liquidityScore = this.calculateLiquidityScore(userAccount.positions);

    return {
      totalValueUSD: totalValueUSD.toFixed(2),
      totalSuppliedUSD: userAccount.totalSuppliedUSD,
      totalBorrowedUSD: userAccount.totalBorrowedUSD,
      netAPY: netAPY.toFixed(2),
      healthFactor: userAccount.healthFactor,
      diversificationScore,
      riskScore,
      liquidityScore
    };
  }

  /**
   * Assess portfolio risk
   */
  private async assessRisk(
    userAccount: YeiUserAccount,
    portfolioMetrics: PortfolioMetrics
  ): Promise<RiskMetrics> {
    const healthFactor = new BigNumber(userAccount.healthFactor);
    
    // Assess liquidation risk
    let liquidationRisk: RiskLevel = 'low';
    if (healthFactor.lt(1.5)) liquidationRisk = 'high';
    else if (healthFactor.lt(2.0)) liquidationRisk = 'medium';

    // Calculate concentration risk (0-100)
    const concentrationRisk = 100 - portfolioMetrics.diversificationScore;

    // Calculate protocol risk (simplified)
    const protocolRisk = portfolioMetrics.riskScore;

    // Calculate market risk based on volatility
    const marketRisk = await this.calculateMarketRisk(userAccount.positions);

    // Overall risk assessment
    const riskFactors = [
      liquidationRisk === 'high' ? 80 : liquidationRisk === 'medium' ? 50 : 20,
      concentrationRisk,
      protocolRisk,
      marketRisk
    ];

    const avgRisk = riskFactors.reduce((sum, risk) => sum + risk, 0) / riskFactors.length;
    
    let overallRisk: RiskLevel = 'low';
    if (avgRisk > 70) overallRisk = 'high';
    else if (avgRisk > 40) overallRisk = 'medium';

    // Generate recommendations
    const recommendations = this.generateRiskRecommendations(
      liquidationRisk,
      concentrationRisk,
      protocolRisk,
      marketRisk
    );

    return {
      healthFactor: userAccount.healthFactor,
      liquidationRisk,
      concentrationRisk,
      protocolRisk,
      marketRisk,
      overallRisk,
      recommendations
    };
  }

  /**
   * Determine if rebalancing is needed
   */
  private async shouldRebalance(
    userAccount: YeiUserAccount,
    portfolioMetrics: PortfolioMetrics,
    riskMetrics: RiskMetrics,
    targetAPY?: string
  ): Promise<boolean> {
    // Check if health factor is too low
    if (new BigNumber(userAccount.healthFactor).lt(this.riskLimits.minHealthFactor)) {
      logger.warn(`Health factor too low: ${userAccount.healthFactor}`);
      return true;
    }

    // Check if risk is too high
    if (riskMetrics.overallRisk === 'high') {
      logger.warn('Overall risk too high, rebalancing needed');
      return true;
    }

    // Check if current APY is below target
    if (targetAPY) {
      const currentAPY = new BigNumber(portfolioMetrics.netAPY);
      const target = new BigNumber(targetAPY);
      const threshold = target.multipliedBy(this.config.rebalanceThreshold / 100);
      
      if (currentAPY.lt(target.minus(threshold))) {
        logger.info(`Current APY ${currentAPY.toFixed(2)}% below target ${targetAPY}%`);
        return true;
      }
    }

    // Check if there are significantly better opportunities
    const opportunitiesResponse = await this.yeiClient.getYieldOpportunities();
    if (opportunitiesResponse.success && opportunitiesResponse.data) {
      const bestOpportunity = opportunitiesResponse.data[0];
      const currentAPY = new BigNumber(portfolioMetrics.netAPY);
      const bestAPY = new BigNumber(bestOpportunity.apy);
      
      if (bestAPY.minus(currentAPY).gt(this.config.minYieldThreshold / 100)) {
        logger.info(`Better opportunity found: ${bestAPY.toFixed(2)}% vs current ${currentAPY.toFixed(2)}%`);
        return true;
      }
    }

    return false;
  }

  /**
   * Generate rebalancing actions
   */
  private async generateRebalanceActions(
    userAccount: YeiUserAccount,
    opportunities: YieldOpportunity[],
    portfolioMetrics: PortfolioMetrics,
    riskMetrics: RiskMetrics,
    baseToken: Address,
    targetAPY?: string
  ): Promise<RebalanceAction[]> {
    const actions: RebalanceAction[] = [];

    // Sort opportunities by risk-adjusted yield
    const sortedOpportunities = opportunities
      .filter(opp => opp.risk !== 'high' || this.config.riskTolerance === 'high')
      .sort((a, b) => {
        const aScore = this.calculateRiskAdjustedYield(a);
        const bScore = this.calculateRiskAdjustedYield(b);
        return bScore - aScore;
      });

    // Find underperforming positions
    const underperformingPositions = userAccount.positions.filter(position => {
      const positionAPY = new BigNumber(position.market.supplyAPY);
      const bestOpportunityAPY = new BigNumber(sortedOpportunities[0]?.apy || '0');
      return bestOpportunityAPY.minus(positionAPY).gt(this.config.minYieldThreshold / 100);
    });

    // Generate withdrawal actions for underperforming positions
    for (const position of underperformingPositions) {
      const withdrawAmount = this.calculateOptimalWithdrawAmount(position, riskMetrics);
      
      if (new BigNumber(withdrawAmount).gt(0)) {
        actions.push({
          type: 'withdraw',
          amount: withdrawAmount,
          market: position.market,
          reason: `Moving from ${position.market.supplyAPY}% APY to better opportunity`,
          expectedGain: this.calculateExpectedGain(withdrawAmount, position.market.supplyAPY, sortedOpportunities[0]?.apy || '0'),
          riskLevel: position.market.symbol === 'USDC' ? 'low' : 'medium'
        });
      }
    }

    // Generate deposit actions for best opportunities
    let remainingCapacity = new BigNumber(this.config.maxPositionSize);
    
    for (const opportunity of sortedOpportunities.slice(0, 3)) { // Top 3 opportunities
      if (remainingCapacity.lte(0)) break;

      const maxDeposit = BigNumber.min(
        remainingCapacity,
        opportunity.maxDeposit || remainingCapacity.toString(),
        new BigNumber(opportunity.liquidity).multipliedBy(0.05) // Max 5% of liquidity
      );

      if (maxDeposit.gt(100)) { // Minimum $100 deposit
        actions.push({
          type: 'deposit',
          toToken: opportunity.market.underlyingAsset,
          amount: maxDeposit.toFixed(6),
          market: opportunity.market,
          reason: `Depositing to ${opportunity.apy}% APY opportunity`,
          expectedGain: this.calculateExpectedGain(maxDeposit.toString(), '0', opportunity.apy),
          riskLevel: opportunity.risk
        });

        remainingCapacity = remainingCapacity.minus(maxDeposit);
      }
    }

    // Add risk management actions if needed
    if (riskMetrics.overallRisk === 'high') {
      const riskActions = this.generateRiskManagementActions(userAccount, riskMetrics);
      actions.push(...riskActions);
    }

    return actions.filter(action => {
      // Filter out actions that don't meet minimum thresholds
      const expectedGain = new BigNumber(action.expectedGain || '0');
      return expectedGain.gt(this.config.minYieldThreshold / 100);
    });
  }

  /**
   * Execute rebalancing actions and generate transactions
   */
  private async executeRebalanceActions(
    actions: RebalanceAction[],
    userAddress: Address,
    chainId: number
  ): Promise<any[]> {
    const transactions: any[] = [];

    for (const action of actions) {
      try {
        let transaction;

        switch (action.type) {
          case 'withdraw':
            transaction = await this.generateWithdrawTransaction(action, userAddress);
            break;
          case 'deposit':
            transaction = await this.generateDepositTransaction(action, userAddress);
            break;
          case 'borrow':
            transaction = await this.generateBorrowTransaction(action, userAddress);
            break;
          case 'repay':
            transaction = await this.generateRepayTransaction(action, userAddress);
            break;
          case 'swap':
            transaction = await this.generateSwapTransaction(action, userAddress);
            break;
        }

        if (transaction) {
          transactions.push(transaction);
        }
      } catch (error) {
        logger.error(`Error generating transaction for action ${action.type}:`, error);
      }
    }

    return transactions;
  }

  /**
   * Helper methods for calculations
   */
  private calculateDiversificationScore(positions: YeiPosition[]): number {
    if (positions.length === 0) return 0;
    if (positions.length === 1) return 20;
    
    const totalValue = positions.reduce((sum, pos) => {
      return sum.plus(pos.suppliedAmount);
    }, new BigNumber(0));

    if (totalValue.isZero()) return 0;

    // Calculate Herfindahl index
    const herfindahlIndex = positions.reduce((sum, pos) => {
      const weight = new BigNumber(pos.suppliedAmount).dividedBy(totalValue);
      return sum.plus(weight.pow(2));
    }, new BigNumber(0));

    // Convert to diversification score (0-100)
    const maxHerfindahl = 1; // When all funds in one position
    const diversificationScore = new BigNumber(1).minus(herfindahlIndex).multipliedBy(100);
    
    return Math.min(100, Math.max(0, diversificationScore.toNumber()));
  }

  private calculateRiskScore(positions: YeiPosition[]): number {
    if (positions.length === 0) return 0;

    const riskScores = positions.map(position => {
      const utilizationRate = parseFloat(position.market.utilizationRate);
      const healthFactor = parseFloat(position.healthFactor);
      
      let riskScore = 0;
      
      // Utilization rate risk
      if (utilizationRate > 90) riskScore += 40;
      else if (utilizationRate > 80) riskScore += 25;
      else if (utilizationRate > 70) riskScore += 10;
      
      // Health factor risk
      if (healthFactor < 1.2) riskScore += 40;
      else if (healthFactor < 1.5) riskScore += 25;
      else if (healthFactor < 2.0) riskScore += 10;
      
      // Market risk (simplified)
      if (position.market.symbol !== 'USDC' && position.market.symbol !== 'USDT') {
        riskScore += 20;
      }
      
      return Math.min(100, riskScore);
    });

    return riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length;
  }

  private calculateLiquidityScore(positions: YeiPosition[]): number {
    if (positions.length === 0) return 100;

    const liquidityScores = positions.map(position => {
      const liquidity = new BigNumber(position.market.liquidity);
      const totalSupply = new BigNumber(position.market.totalSupply);
      
      // Liquidity ratio
      const liquidityRatio = liquidity.dividedBy(totalSupply);
      
      if (liquidityRatio.gt(0.5)) return 100;
      if (liquidityRatio.gt(0.3)) return 80;
      if (liquidityRatio.gt(0.1)) return 60;
      if (liquidityRatio.gt(0.05)) return 40;
      return 20;
    });

    return liquidityScores.reduce((sum, score) => sum + score, 0) / liquidityScores.length;
  }

  private async calculateMarketRisk(positions: YeiPosition[]): Promise<number> {
    // Simplified market risk calculation
    // In a real implementation, this would analyze price volatility, correlation, etc.
    const volatilityScores = positions.map(position => {
      // Stablecoins have low volatility
      if (position.market.symbol === 'USDC' || position.market.symbol === 'USDT') {
        return 10;
      }
      
      // Major tokens have medium volatility
      if (position.market.symbol === 'SEI' || position.market.symbol === 'WETH') {
        return 50;
      }
      
      // Other tokens have high volatility
      return 80;
    });

    return volatilityScores.reduce((sum, score) => sum + score, 0) / volatilityScores.length;
  }

  private generateRiskRecommendations(
    liquidationRisk: RiskLevel,
    concentrationRisk: number,
    protocolRisk: number,
    marketRisk: number
  ): string[] {
    const recommendations: string[] = [];

    if (liquidationRisk === 'high') {
      recommendations.push('Reduce borrowing or add more collateral to improve health factor');
    }

    if (concentrationRisk > 70) {
      recommendations.push('Diversify holdings across multiple assets and protocols');
    }

    if (protocolRisk > 60) {
      recommendations.push('Consider reducing exposure to high-risk protocols');
    }

    if (marketRisk > 70) {
      recommendations.push('Increase allocation to stable assets during high volatility');
    }

    return recommendations;
  }

  private calculateRiskAdjustedYield(opportunity: YieldOpportunity): number {
    const baseYield = parseFloat(opportunity.apy);
    const riskPenalty = opportunity.risk === 'high' ? 0.7 : opportunity.risk === 'medium' ? 0.85 : 1.0;
    const liquidityBonus = new BigNumber(opportunity.liquidity).gt(1000000) ? 1.1 : 1.0;
    
    return baseYield * riskPenalty * liquidityBonus;
  }

  private calculateOptimalWithdrawAmount(position: YeiPosition, riskMetrics: RiskMetrics): string {
    const suppliedAmount = new BigNumber(position.suppliedAmount);
    const healthFactor = new BigNumber(position.healthFactor);
    
    // Don't withdraw if it would put health factor below minimum
    if (healthFactor.lt(this.riskLimits.minHealthFactor)) {
      return '0';
    }
    
    // Withdraw up to 50% of position if health factor is good
    if (healthFactor.gt(3)) {
      return suppliedAmount.multipliedBy(0.5).toFixed(6);
    }
    
    // Withdraw up to 25% if health factor is moderate
    if (healthFactor.gt(2)) {
      return suppliedAmount.multipliedBy(0.25).toFixed(6);
    }
    
    return '0';
  }

  private calculateExpectedGain(amount: string, fromAPY: string, toAPY: string): string {
    const principal = new BigNumber(amount);
    const fromRate = new BigNumber(fromAPY).dividedBy(100);
    const toRate = new BigNumber(toAPY).dividedBy(100);
    
    return principal.multipliedBy(toRate.minus(fromRate)).toFixed(6);
  }

  private generateRiskManagementActions(
    userAccount: YeiUserAccount,
    riskMetrics: RiskMetrics
  ): RebalanceAction[] {
    const actions: RebalanceAction[] = [];

    // If health factor is too low, suggest reducing borrowing
    if (riskMetrics.liquidationRisk === 'high') {
      const highRiskPositions = userAccount.positions.filter(pos => 
        new BigNumber(pos.borrowedAmount).gt(0) && 
        new BigNumber(pos.healthFactor).lt(1.5)
      );

      for (const position of highRiskPositions) {
        const repayAmount = new BigNumber(position.borrowedAmount).multipliedBy(0.3); // Repay 30%
        
        actions.push({
          type: 'repay',
          amount: repayAmount.toFixed(6),
          market: position.market,
          reason: 'Reduce liquidation risk by repaying debt',
          riskLevel: 'low'
        });
      }
    }

    return actions;
  }

  private async generateWithdrawTransaction(action: RebalanceAction, userAddress: Address): Promise<any> {
    // This would generate the actual withdrawal transaction
    // Using Console Kit's transaction builder
    return {
      to: action.market?.yTokenAddress,
      data: '0x', // Encoded withdrawal call
      value: '0',
      operation: 0
    };
  }

  private async generateDepositTransaction(action: RebalanceAction, userAddress: Address): Promise<any> {
    // This would generate the actual deposit transaction
    return {
      to: action.market?.yTokenAddress,
      data: '0x', // Encoded deposit call
      value: action.amount,
      operation: 0
    };
  }

  private async generateBorrowTransaction(action: RebalanceAction, userAddress: Address): Promise<any> {
    // This would generate the actual borrow transaction
    return {
      to: action.market?.yTokenAddress,
      data: '0x', // Encoded borrow call
      value: '0',
      operation: 0
    };
  }

  private async generateRepayTransaction(action: RebalanceAction, userAddress: Address): Promise<any> {
    // This would generate the actual repay transaction
    return {
      to: action.market?.yTokenAddress,
      data: '0x', // Encoded repay call
      value: action.amount,
      operation: 0
    };
  }

  private async generateSwapTransaction(action: RebalanceAction, userAddress: Address): Promise<any> {
    // This would generate the actual swap transaction
    return {
      to: '0x0000000000000000000000000000000000000000', // Swap contract
      data: '0x', // Encoded swap call
      value: '0',
      operation: 0
    };
  }
} 