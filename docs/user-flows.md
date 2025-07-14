# User Flows Documentation

This document provides detailed user flows for the Sei DeFi Agent system, showing how different types of users can interact with the platform.

## User Types

1. **Individual DeFi User**: Personal portfolio management and yield optimization
2. **DeFi Protocol**: Integration with automation services
3. **Institution**: Enterprise-grade DeFi automation
4. **Developer**: Building on top of the agent platform

## Flow 1: Individual User - Yield Optimization

### Scenario
Sarah is a DeFi user with 10,000 SEI tokens. She wants to optimize her yield while maintaining medium risk tolerance.

### User Journey

#### Step 1: Initial Setup
```bash
# Sarah sets up her environment
export PRIVATE_KEY="her_wallet_private_key"
export OPENAI_API_KEY="her_openai_key"

# Starts the agent
npm run dev
```

#### Step 2: Check Current Position
```bash
# GET /wallet
curl http://localhost:3000/wallet
```

Response:
```json
{
  "address": "0x742d35cc6bf426dab46c02f8b1f12bb5",
  "balance": "10000.0",
  "network": "Sei",
  "chainId": "1329"
}
```

#### Step 3: Request Yield Optimization
```bash
# POST /optimize
curl -X POST http://localhost:3000/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "baseToken": "0x0000000000000000000000000000000000000000",
    "targetAPY": "15.0",
    "riskTolerance": "medium",
    "maxPositionSize": "8000",
    "preferredProtocols": ["silo", "takara"]
  }'
```

#### Step 4: AI Analysis & Execution
The AI agent analyzes:
- Current SEI staking yields on Silo (~8% APY)
- Takara lending opportunities for SEI (~12% APY)
- Symphony LP opportunities (~18% APY, higher risk)
- Gas costs and execution complexity

AI decides on strategy:
- 40% stake on Silo (low risk, stable yield)
- 35% lend on Takara (medium risk, good yield)  
- 25% keep liquid for opportunities

#### Step 5: Execution Result
```json
{
  "success": true,
  "transactionHash": "0x1234...",
  "profit": "0",
  "gasUsed": "450000",
  "recommendations": [
    "Executed multi-protocol strategy:",
    "- Staked 4000 SEI on Silo (8.2% APY)",
    "- Lent 3500 SEI on Takara (12.1% APY)", 
    "- Kept 2500 SEI liquid for opportunities",
    "Expected blended APY: 11.8%",
    "Estimated monthly earnings: ~98 SEI"
  ]
}
```

#### Step 6: Monitoring
Sarah can monitor her positions:
```bash
# Check performance
curl http://localhost:3000/performance

# View trade history  
curl http://localhost:3000/trades
```

## Flow 2: Institution - Automated Portfolio Management

### Scenario
DeFi Capital manages a 500,000 SEI portfolio and wants automated rebalancing with strict risk controls.

### Setup Process

#### Step 1: Enterprise Configuration
```bash
# Environment setup
PRIVATE_KEY="fund_wallet_private_key"
BRAHMA_API_KEY="enterprise_api_key"
REGISTRY_ID="fund_automation_registry"
MAX_POSITION_SIZE_USD="100000"
RISK_TOLERANCE="low"
EMERGENCY_STOP_LOSS="5.0"
PREFERRED_PROTOCOLS="silo,takara"
MAX_PROTOCOL_EXPOSURE="25"
```

#### Step 2: Executor Registration
```bash
# Register automation executor
npm run register-executor
```

#### Step 3: Deploy Automation Account
```bash
# Deploy Brahma Console Kit account
npm run deploy-account
```

#### Step 4: Configure Risk Parameters
```bash
curl -X POST http://localhost:3000/update-risk-limits \
  -H "Content-Type: application/json" \
  -d '{
    "maxPositionSizeUSD": "100000",
    "maxProtocolExposure": 0.25,
    "minHealthFactor": "2.0",
    "emergencyStopLoss": 0.05
  }'
```

### Automation Workflow

#### Daily Rebalancing
The system automatically:

1. **Monitor Positions** (every 30 seconds)
   - Check portfolio health
   - Monitor yield opportunities
   - Assess market conditions

2. **Risk Assessment** (every 5 minutes)
   - Calculate concentration risks
   - Monitor health factors
   - Check protocol risks

3. **Rebalancing Decision** (when threshold exceeded)
   - Compare current vs optimal allocation
   - Calculate expected gains vs gas costs
   - Generate execution plan

4. **Execution** (if profitable)
   - Execute transactions through Brahma
   - Update performance metrics
   - Log all activities

#### Emergency Scenarios
If portfolio health factor drops below 1.5:
1. Immediate emergency assessment
2. Reduce high-risk positions
3. Increase collateral if needed
4. Notify administrators
5. Pause further automation until resolved

## Flow 3: Developer - Building Custom Strategies

### Scenario
Alex is building a delta-neutral yield farming bot using the Sei DeFi Agent as infrastructure.

### Integration Process

#### Step 1: Access the Agent Kit
```typescript
import SeiDeFiAgentKit, { AgentKitConfig } from 'sei-defi-agent/agent-kit';

const config: AgentKitConfig = {
  privateKey: process.env.PRIVATE_KEY!,
  openaiApiKey: process.env.OPENAI_API_KEY!,
  rpcUrl: 'https://evm-rpc.sei-apis.com'
};

const agentKit = new SeiDeFiAgentKit(config);
```

#### Step 2: Create Custom Strategy
```typescript
async function deltaNeutralStrategy(params: {
  baseAmount: string;
  targetPair: string;
  leverage: number;
}) {
  // Step 1: Analyze current market
  const riskAssessment = await agentKit.assessRisk(
    agentKit.getWalletAddress()
  );
  
  // Step 2: Execute custom strategy
  const strategy = `
    Implement delta neutral yield farming:
    1. Provide ${params.baseAmount} liquidity to ${params.targetPair}
    2. Short equivalent amount on Citrex with ${params.leverage}x leverage
    3. Monitor funding rates and LP fees
    4. Rebalance when delta exceeds 5%
  `;
  
  const result = await agentKit.executeStrategy(strategy, params);
  return result;
}
```

#### Step 3: Monitor and Adjust
```typescript
// Set up monitoring
setInterval(async () => {
  const performance = await agentKit.getPerformanceMetrics();
  
  if (performance.roi < -2) { // 2% loss threshold
    await agentKit.emergencyStop();
    console.log('Strategy stopped due to losses');
  }
}, 60000); // Check every minute
```

## Flow 4: Protocol Integration

### Scenario
NewProtocol wants to integrate with the Sei DeFi Agent to offer their yield opportunities to users.

### Integration Steps

#### Step 1: Create Protocol Client
```typescript
// In sei-agent-kit/src/tools/newprotocol/
export interface NewProtocolClient {
  deposit(amount: string, asset: string): Promise<string>;
  withdraw(amount: string, asset: string): Promise<string>;
  getAPY(asset: string): Promise<string>;
  getUserPosition(user: Address): Promise<Position>;
}
```

#### Step 2: Implement LangChain Tools
```typescript
// Create LangChain tool for the protocol
export class NewProtocolDepositTool extends Tool {
  name = "newProtocolDeposit";
  description = "Deposit assets into NewProtocol for yield";
  
  async _call(input: string): Promise<string> {
    const { amount, asset } = JSON.parse(input);
    return await this.seiKit.newProtocolDeposit(amount, asset);
  }
}
```

#### Step 3: Register with Agent
```typescript
// Add to agent kit tools
const tools = [
  ...existingTools,
  new NewProtocolDepositTool(seiKit),
  new NewProtocolWithdrawTool(seiKit),
  new NewProtocolGetAPYTool(seiKit)
];
```

#### Step 4: Update AI Prompts
```typescript
// Update optimization prompts to include new protocol
const protocolInfo = `
Available protocols on Sei:
1. Symphony - Token swapping and liquidity
2. Takara - Lending and borrowing platform  
3. Silo - SEI staking with rewards
4. Citrex - Perpetual trading
5. NewProtocol - High-yield farming with additional rewards
`;
```

## Flow 5: Risk Management Scenarios

### Scenario A: Market Volatility Response

#### Trigger: SEI price drops 15% in 1 hour

**Automated Response:**
1. **Immediate Assessment** (< 30 seconds)
   - Calculate new health factors
   - Assess liquidation risks
   - Check collateral ratios

2. **Risk Mitigation** (if health factor < 1.8)
   - Reduce leveraged positions
   - Add collateral to borrowing positions
   - Convert volatile assets to stablecoins

3. **Portfolio Rebalancing** (within 5 minutes)
   - Optimize new allocations
   - Execute protective strategies
   - Update risk parameters

### Scenario B: Protocol Emergency

#### Trigger: Takara protocol shows unusual behavior

**Automated Response:**
1. **Protocol Assessment**
   - Check protocol health metrics
   - Monitor smart contract events
   - Analyze recent transactions

2. **Position Protection**
   - Withdraw from affected protocol
   - Redistribute to safer alternatives
   - Maintain overall yield targets

3. **User Notification**
   - Send alert to administrators
   - Log detailed incident report
   - Provide recovery recommendations

## Flow 6: Performance Optimization

### Continuous Improvement Loop

#### Daily Analysis
1. **Performance Review**
   - Calculate actual vs expected returns
   - Analyze gas cost efficiency
   - Review strategy effectiveness

2. **Strategy Adjustment**
   - Update yield predictions
   - Optimize transaction batching
   - Refine risk parameters

3. **Learning Integration**
   - Feed results back to AI model
   - Update prompt engineering
   - Improve decision algorithms

#### Weekly Optimization
1. **Deep Analysis**
   - Compare performance across protocols
   - Analyze market trend impacts
   - Review user behavior patterns

2. **Strategy Evolution**
   - Develop new optimization strategies
   - Test advanced DeFi compositions
   - Implement yield farming innovations

3. **System Enhancement**
   - Optimize code performance
   - Enhance monitoring capabilities
   - Improve user experience

## Best Practices

### For Users
1. **Start Small**: Begin with small amounts to test strategies
2. **Monitor Regularly**: Check performance and adjust parameters
3. **Understand Risks**: Each protocol has unique risk profiles
4. **Keep Updated**: Stay informed about protocol changes
5. **Emergency Preparedness**: Know how to use emergency stops

### For Developers
1. **Test Thoroughly**: Use testnet before mainnet deployment
2. **Handle Errors**: Implement robust error handling
3. **Monitor Gas**: Optimize transaction costs
4. **Security First**: Never hardcode private keys
5. **Documentation**: Document custom strategies clearly

### For Institutions
1. **Risk Framework**: Establish clear risk management policies
2. **Compliance**: Ensure regulatory compliance
3. **Monitoring**: Implement comprehensive monitoring
4. **Backup Plans**: Have manual override capabilities
5. **Regular Audits**: Review and audit all strategies

---

This documentation provides comprehensive user flows for different stakeholder types. Each flow includes practical examples, code snippets, and expected outcomes to help users understand how to effectively use the Sei DeFi Agent system. 