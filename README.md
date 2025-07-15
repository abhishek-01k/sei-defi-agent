# Sei DeFi Automation System

A comprehensive end-to-end DeFi automation system for the Sei blockchain, featuring yield optimization across multiple protocols including Yei Finance, Takara Lending, and Sailor Finance, powered by Brahma Console Kit.

## 🚀 Features

- **Multi-Protocol Yield Optimization**: Automatically rebalances funds across Yei Finance, Takara Lending, and Sailor Finance to maximize yields
- **Risk Management**: Built-in risk assessment and emergency stop mechanisms
- **Brahma Console Integration**: Leverages Brahma Console Kit for secure automation workflows
- **Real-time Monitoring**: Live metrics, health checks, and performance tracking
- **Production Ready**: Comprehensive error handling, logging, and graceful shutdown
- **RESTful API**: Complete API for monitoring and controlling the automation system

## 🏗️ Architecture

### System Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Yei Finance   │    │ Takara Lending  │    │ Sailor Finance  │
│   (Lending)     │    │   (Lending)     │    │     (DEX)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Automation     │
                    │    Engine       │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │ Brahma Console  │
                    │      Kit        │
                    └─────────────────┘
```

### Frontend-Backend Architecture
```
┌─────────────────┐         HTTP API          ┌─────────────────┐
│   Frontend UI   │ ────────────────────────→ │   Backend API   │
│  (Next.js)      │                           │   (Express)     │
│  Port: 3001     │ ←──────────────────────── │   Port: 3000    │
└─────────────────┘    WebSocket/SSE           └─────────────────┘
                                                        │
                                               ┌─────────────────┐
                                               │  Sei Agent Kit  │
                                               │   & Automation  │
                                               └─────────────────┘
```

**Key Points:**
- Frontend runs on port 3001, Backend runs on port 3000
- Frontend acts as a proxy and calls backend APIs exclusively
- All sensitive operations (private keys, agent setup) happen on backend only
- Real-time updates via WebSocket connections from backend to frontend

## 📋 Prerequisites

- Node.js v18+ and npm
- A Sei wallet with private key
- Brahma Console Kit API credentials
- Access to Sei mainnet/testnet

## 🛠️ Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd sei-defi-automation
npm install
```

2. **Configure environment variables:**
```bash
cp env.example .env
```

Edit `.env` with your configuration:
```env
# Sei Network Configuration
PRIVATE_KEY=your_private_key_here
SEI_RPC_URL=https://evm-rpc.sei-apis.com
SEI_CHAIN_ID=1329

# Brahma Console Kit Configuration
BRAHMA_API_KEY=65832024-c1f4-48d2-81e6-3460f2722600
BRAHMA_API_URL=https://dev.console.fi/
BRAHMA_EXECUTOR_PRIVATE_KEY=your_executor_private_key_here

# Database & Redis (Optional)
DATABASE_URL=postgresql://localhost:5432/sei_automation
REDIS_URL=redis://localhost:6379

# Automation Settings
AUTOMATION_INTERVAL_MS=30000
MIN_YIELD_DIFFERENCE_BPS=50
MAX_SLIPPAGE_BPS=100
EMERGENCY_STOP=false
```

3. **Build the project:**
```bash
npm run build
```

## 🚀 Usage

### Development Mode

1. **Start the Backend (Port 3000):**
```bash
cd backend
npm run dev
```

2. **Start the Frontend (Port 3001):**
```bash
cd frontend
npm run dev
```

3. **Access the Application:**
- Frontend UI: http://localhost:3001
- Backend API: http://localhost:3000
- API Health Check: http://localhost:3000/health

### Production Mode

1. **Build and start the Backend:**
```bash
cd backend
npm run build
npm start
```

2. **Build and start the Frontend:**
```bash
cd frontend
npm run build
npm start
```

### Run Automation Only (Backend)
```bash
cd backend
npm run automation:start
```

### Environment Variables

**Backend (.env):**
- Required: `PRIVATE_KEY`, `OPENAI_API_KEY`, `BRAHMA_API_KEY`
- Optional: `RPC_URL`, `CHAIN_ID`, etc.

**Frontend (.env.local):**
- `NEXT_PUBLIC_BACKEND_URL=http://localhost:3000` (for production, use your backend URL)

## 📡 API Endpoints

### Health Check
```http
GET /health
```
Returns system health and automation status.

### Automation Control

#### Start Automation
```http
POST /automation/start
```

#### Stop Automation
```http
POST /automation/stop
```

#### Emergency Stop
```http
POST /automation/emergency-stop
```

### Monitoring

#### Get Metrics
```http
GET /automation/metrics
```
Returns performance metrics including TVL, yields, and transaction counts.

#### Get Risk Metrics
```http
GET /automation/risk
```
Returns risk assessment including health factors and concentration risk.

#### Get Status
```http
GET /automation/status
```
Returns current automation status and configuration.

## 🔧 Configuration

### Automation Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| `AUTOMATION_INTERVAL_MS` | Automation cycle interval | 30000 (30s) |
| `MIN_YIELD_DIFFERENCE_BPS` | Minimum yield difference to trigger rebalancing | 50 (0.5%) |
| `MAX_SLIPPAGE_BPS` | Maximum allowed slippage | 100 (1%) |
| `MAX_GAS_PRICE_GWEI` | Maximum gas price for transactions | 50 |
| `EMERGENCY_STOP` | Emergency stop flag | false |

### Risk Management

| Parameter | Description | Default |
|-----------|-------------|---------|
| `MAX_POSITION_SIZE_USD` | Maximum position size per protocol | 100000 |
| `MAX_LEVERAGE` | Maximum leverage ratio | 3 |
| `STOP_LOSS_BPS` | Stop loss threshold | 500 (5%) |
| `TAKE_PROFIT_BPS` | Take profit threshold | 1000 (10%) |

## 🏦 Supported Protocols

### Yei Finance
- **Type**: Lending/Borrowing Protocol
- **Features**: Supply, withdraw, borrow, repay
- **Markets**: USDC, SEI, and other supported tokens

### Takara Lending
- **Type**: Lending/Borrowing Protocol  
- **Features**: Supply, withdraw, borrow, repay with utilization-based risk scoring
- **Markets**: USDC, SEI, and other supported tokens

### Sailor Finance
- **Type**: Concentrated Liquidity DEX (Uniswap V3 style)
- **Features**: Swap, add/remove liquidity, fee collection
- **Pools**: Multiple fee tiers (0.05%, 0.3%, 1%)

## 🔐 Security Features

- **Private Key Management**: Secure handling of wallet private keys
- **Risk Assessment**: Real-time risk scoring and monitoring
- **Emergency Stop**: Immediate halt of all operations
- **Health Factor Monitoring**: Automatic liquidation risk assessment
- **Gas Price Protection**: Maximum gas price limits
- **Slippage Protection**: Configurable slippage tolerance

## 📊 Monitoring & Metrics

### Performance Metrics
- Total Value Locked (TVL)
- Current and average yield
- Transaction success/failure rates
- Gas costs and net profit
- System uptime

### Risk Metrics
- Health factor across positions
- Liquidation risk assessment
- Protocol concentration risk
- Overall risk score

## 🚨 Emergency Procedures

### Emergency Stop
```bash
curl -X POST http://localhost:3000/automation/emergency-stop
```

### Manual Position Exit
The system provides APIs to manually withdraw from specific protocols if needed.

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Test on Sei Testnet
Update your `.env` to use testnet configuration:
```env
SEI_RPC_URL=https://evm-rpc-testnet.sei-apis.com
SEI_CHAIN_ID=1328
```

## 📝 Logging

Logs are written to:
- Console (with colors in development)
- `logs/combined.log` (all logs)
- `logs/error.log` (errors only)

Log levels: `error`, `warn`, `info`, `debug`

## 🔄 Automation Logic

### Yield Optimization Flow
1. **Scan Opportunities**: Check yields across all supported protocols
2. **Risk Assessment**: Calculate risk scores for each opportunity
3. **Position Analysis**: Evaluate current positions and performance
4. **Strategy Calculation**: Determine optimal rebalancing actions
5. **Execution**: Execute rebalancing if profitable after gas costs
6. **Monitoring**: Update metrics and continue monitoring

### Risk Management
- Continuous health factor monitoring
- Automatic emergency exit on high liquidation risk
- Diversification across multiple protocols
- Gas cost optimization

## 🛠️ Development

### Project Structure
```
src/
├── config/           # Configuration management
├── protocols/        # Protocol-specific clients
│   ├── yei/         # Yei Finance integration
│   ├── takara/      # Takara Lending integration
│   └── sailor/      # Sailor Finance integration
├── brahma/          # Brahma Console Kit integration
├── automation/      # Core automation engine
├── utils/           # Utilities (logging, etc.)
└── index.ts         # Main application entry point
```

### Adding New Protocols
1. Create a new client in `src/protocols/[protocol]/`
2. Implement the standard interface with methods for supply, withdraw, etc.
3. Add protocol scanning to the automation engine
4. Update configuration and documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This software is provided "as is" without warranty. DeFi protocols involve significant financial risks. Users should:

- Understand the risks involved in DeFi protocols
- Start with small amounts for testing
- Monitor positions regularly
- Have emergency procedures in place
- Consider this experimental software

The developers are not responsible for any financial losses incurred through the use of this software.

## 📞 Support

For questions, issues, or support:
- Create an issue on GitHub
- Check the documentation
- Review the logs for error details

## 🔗 Links

- [Sei Network Documentation](https://docs.sei.io/)
- [Brahma Console Kit](https://docs.brahma.fi/)
- [Yei Finance](https://docs.yei.finance/)
- [Takara Lending](https://takara.gitbook.io/takara-lend)
- [Sailor Finance](https://sailor-finance.gitbook.io/sailor-finance-docs) 