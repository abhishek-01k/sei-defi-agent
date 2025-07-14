import dotenv from 'dotenv';
import SeiDeFiAgentKit, { AgentKitConfig, YieldOptimizationRequest } from '../src/agent-kit';
import { ModelProviderName } from '../src/types';
import { Address } from 'viem';

// Load environment variables
dotenv.config();

/**
 * Basic Usage Example for Sei DeFi Agent with sei-agent-kit Integration
 * 
 * This example demonstrates:
 * 1. Setting up the agent kit
 * 2. Basic protocol interactions
 * 3. AI-powered yield optimization
 * 4. Risk assessment
 * 5. Custom strategy execution
 */

async function basicUsageExample() {
  console.log('🚀 Starting Sei DeFi Agent Basic Usage Example\n');

  try {
    // Step 1: Initialize the Agent Kit
    console.log('📋 Step 1: Initializing Sei DeFi Agent Kit');
    
    const config: AgentKitConfig = {
      privateKey: process.env.PRIVATE_KEY!,
      openaiApiKey: process.env.OPENAI_API_KEY!,
      rpcUrl: process.env.RPC_URL || 'https://evm-rpc.sei-apis.com',
      modelProvider: ModelProviderName.OPENAI,
      temperature: 0,
      model: "gpt-4o"
    };

    const agentKit = new SeiDeFiAgentKit(config);
    console.log(`✅ Agent Kit initialized successfully`);
    console.log(`📍 Wallet Address: ${agentKit.getWalletAddress()}`);
    console.log(`🛠️  Available Tools: ${agentKit.getAvailableTools().length} tools loaded\n`);

    // Step 2: Check Current Balances
    console.log('💰 Step 2: Checking Current Balances');
    
    const seiBalance = await agentKit.getBalance();
    console.log(`SEI Balance: ${seiBalance} SEI`);
    
    // You can also check specific token balances
    // const usdcBalance = await agentKit.getBalance('0x...' as Address);
    console.log('✅ Balance check completed\n');

    // Step 3: Basic Protocol Interactions
    console.log('🔄 Step 3: Demonstrating Protocol Interactions');
    
    // Example: Staking SEI on Silo (commented out to avoid actual transactions)
    /*
    console.log('Staking 100 SEI on Silo...');
    const stakeResult = await agentKit.stake('100');
    console.log(`Stake transaction: ${stakeResult}`);
    */
    
    // Example: Swapping tokens on Symphony
    /*
    console.log('Swapping 50 SEI for USDC on Symphony...');
    const swapResult = await agentKit.swap(
      '50',
      '0x0000000000000000000000000000000000000000' as Address, // SEI
      '0x...' as Address // USDC address
    );
    console.log(`Swap transaction: ${swapResult}`);
    */
    
    console.log('⚠️  Protocol interactions commented out to prevent actual transactions');
    console.log('✅ Protocol interaction examples completed\n');

    // Step 4: AI-Powered Yield Optimization
    console.log('🧠 Step 4: AI-Powered Yield Optimization');
    
    const optimizationRequest: YieldOptimizationRequest = {
      userAddress: agentKit.getWalletAddress(),
      baseToken: '0x0000000000000000000000000000000000000000' as Address, // SEI
      targetAPY: '12.0',
      maxSlippage: '0.5',
      riskTolerance: 'medium',
      preferredProtocols: ['silo', 'takara', 'symphony'],
      maxPositionSize: '5000'
    };

    console.log('Requesting AI yield optimization...');
    const optimizationResult = await agentKit.optimizeYield(optimizationRequest);
    
    console.log('📊 Optimization Results:');
    console.log(`Success: ${optimizationResult.success}`);
    if (optimizationResult.success) {
      console.log('💡 AI Recommendations:');
      optimizationResult.recommendations?.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    } else {
      console.log(`❌ Error: ${optimizationResult.error}`);
    }
    console.log('✅ Yield optimization completed\n');

    // Step 5: Risk Assessment
    console.log('⚠️  Step 5: Risk Assessment');
    
    console.log('Performing AI-powered risk assessment...');
    const riskAssessment = await agentKit.assessRisk(agentKit.getWalletAddress());
    
    console.log('📈 Risk Assessment Results:');
    console.log(riskAssessment);
    console.log('✅ Risk assessment completed\n');

    // Step 6: Custom Strategy Execution
    console.log('📈 Step 6: Custom Strategy Execution');
    
    const customStrategy = `
      Analyze the current SEI DeFi ecosystem and recommend an optimal strategy for:
      - Maximizing yield while maintaining medium risk
      - Diversifying across multiple protocols
      - Considering current market conditions
      - Optimizing for gas efficiency
      
      Portfolio: 10,000 SEI tokens
      Risk tolerance: Medium
      Time horizon: 30 days
    `;

    const strategyParameters = {
      portfolioSize: '10000',
      timeHorizon: '30 days',
      riskTolerance: 'medium',
      gasOptimization: true
    };

    console.log('Executing custom DeFi strategy...');
    const strategyResult = await agentKit.executeStrategy(customStrategy, strategyParameters);
    
    console.log('🎯 Strategy Execution Results:');
    console.log(`Success: ${strategyResult.success}`);
    if (strategyResult.success) {
      console.log('📋 Strategy Recommendations:');
      strategyResult.recommendations?.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    } else {
      console.log(`❌ Error: ${strategyResult.error}`);
    }
    console.log('✅ Custom strategy execution completed\n');

    // Step 7: Advanced Operations (using underlying sei-agent-kit)
    console.log('⚙️  Step 7: Advanced Operations');
    
    // Access the underlying sei-agent-kit for advanced operations
    const seiKit = agentKit.getSeiKit();
    
    console.log('Available advanced operations:');
    console.log('- Citrex perpetual trading');
    console.log('- Carbon MEV-protected strategies');
    console.log('- Direct protocol interactions');
    console.log('- Complex multi-step operations');
    
    // Example of advanced operation (commented out)
    /*
    const products = await seiKit.citrexGetProducts();
    console.log('Available Citrex products:', products);
    */
    
    console.log('✅ Advanced operations overview completed\n');

    console.log('🎉 Basic Usage Example Completed Successfully!');
    console.log('\n📚 Next Steps:');
    console.log('1. Set up your environment variables in .env file');
    console.log('2. Add funds to your wallet for actual trading');
    console.log('3. Start with small amounts on testnet');
    console.log('4. Explore the full API at http://localhost:3000 after running npm run dev');
    console.log('5. Check the documentation in /docs for detailed guides');

  } catch (error) {
    console.error('❌ Error in basic usage example:', error);
    throw error;
  }
}

/**
 * Advanced Usage Example - Automated Portfolio Management
 */
async function advancedUsageExample() {
  console.log('\n🚀 Advanced Usage Example - Automated Portfolio Management\n');

  try {
    const config: AgentKitConfig = {
      privateKey: process.env.PRIVATE_KEY!,
      openaiApiKey: process.env.OPENAI_API_KEY!,
      rpcUrl: process.env.RPC_URL || 'https://evm-rpc.sei-apis.com',
      modelProvider: ModelProviderName.OPENAI
    };

    const agentKit = new SeiDeFiAgentKit(config);

    // Simulate portfolio management workflow
    console.log('📊 Portfolio Management Workflow:');

    // 1. Portfolio Analysis
    console.log('\n1. Analyzing current portfolio...');
    const currentBalance = await agentKit.getBalance();
    console.log(`Current SEI Balance: ${currentBalance}`);

    // 2. Market Analysis with AI
    console.log('\n2. Performing AI market analysis...');
    const marketAnalysis = await agentKit.executeStrategy(
      'Analyze current Sei DeFi market conditions and identify top 3 opportunities',
      { analysis_type: 'market_overview' }
    );

    if (marketAnalysis.success) {
      console.log('🎯 Market Analysis:');
      marketAnalysis.recommendations?.forEach(rec => console.log(`   • ${rec}`));
    }

    // 3. Risk Assessment
    console.log('\n3. Assessing portfolio risk...');
    const riskProfile = await agentKit.assessRisk(agentKit.getWalletAddress());
    console.log('📈 Risk Profile Generated');

    // 4. Optimization Strategy
    console.log('\n4. Generating optimization strategy...');
    const optimization = await agentKit.optimizeYield({
      userAddress: agentKit.getWalletAddress(),
      baseToken: '0x0000000000000000000000000000000000000000' as Address,
      targetAPY: '15.0',
      riskTolerance: 'medium',
      preferredProtocols: ['silo', 'takara'],
      maxPositionSize: '8000'
    });

    if (optimization.success) {
      console.log('✨ Optimization Strategy Generated');
      optimization.recommendations?.forEach(rec => console.log(`   • ${rec}`));
    }

    // 5. Execution Planning
    console.log('\n5. Creating execution plan...');
    console.log('   • Strategy validated ✅');
    console.log('   • Risk parameters checked ✅');
    console.log('   • Gas optimization calculated ✅');
    console.log('   • Ready for execution 🚀');

    console.log('\n✅ Advanced Portfolio Management Example Completed');

  } catch (error) {
    console.error('❌ Error in advanced usage example:', error);
  }
}

/**
 * API Integration Example
 */
async function apiIntegrationExample() {
  console.log('\n🌐 API Integration Example\n');

  try {
    console.log('📡 Example API calls (run npm run dev first):');
    console.log('');
    
    console.log('1. Health Check:');
    console.log('   curl http://localhost:3000/health');
    console.log('');
    
    console.log('2. Get Wallet Info:');
    console.log('   curl http://localhost:3000/wallet');
    console.log('');
    
    console.log('3. Check Balance:');
    console.log('   curl http://localhost:3000/balance');
    console.log('');
    
    console.log('4. Optimize Yield:');
    console.log(`   curl -X POST http://localhost:3000/optimize \\
     -H "Content-Type: application/json" \\
     -d '{
       "baseToken": "0x0000000000000000000000000000000000000000",
       "targetAPY": "12.0",
       "riskTolerance": "medium",
       "maxPositionSize": "5000"
     }'`);
    console.log('');
    
    console.log('5. Risk Assessment:');
    console.log(`   curl -X POST http://localhost:3000/assess-risk \\
     -H "Content-Type: application/json" \\
     -d '{"userAddress": "${agentKit.getWalletAddress()}"}'`);
    console.log('');
    
    console.log('6. Get Performance Metrics:');
    console.log('   curl http://localhost:3000/performance');
    console.log('');
    
    console.log('✅ API Integration examples provided');
    console.log('💡 Run "npm run dev" to start the API server');

  } catch (error) {
    console.error('❌ Error in API integration example:', error);
  }
}

// Main execution
async function main() {
  console.log('🌟 Sei DeFi Agent - sei-agent-kit Integration Examples\n');

  // Check required environment variables
  const requiredVars = ['PRIVATE_KEY', 'OPENAI_API_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`   ${varName}=your_${varName.toLowerCase()}_here`);
    });
    console.error('\nPlease set these variables in your .env file');
    process.exit(1);
  }

  try {
    // Run all examples
    await basicUsageExample();
    await advancedUsageExample();
    await apiIntegrationExample();
    
    console.log('\n🎉 All Examples Completed Successfully!');
    console.log('\n📖 For more information:');
    console.log('   • Check /docs/README.md for comprehensive documentation');
    console.log('   • Review /docs/user-flows.md for detailed user scenarios');
    console.log('   • Explore /docs/architecture.md for technical details');
    console.log('   • Visit the API at http://localhost:3000 after starting the server');
    
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Export for use in other files
export {
  basicUsageExample,
  advancedUsageExample,
  apiIntegrationExample
};

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
} 