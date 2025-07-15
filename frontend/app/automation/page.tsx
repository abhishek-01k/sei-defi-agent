"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Settings, 
  Play, 
  Pause, 
  TrendingUp, 
  Shield, 
  Eye, 
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Zap,
  DollarSign
} from "lucide-react"

interface AutomationScenario {
  id: string
  name: string
  description: string
  type: string
  enabled: boolean
  priority: number
  riskLevel: 'low' | 'medium' | 'high'
  triggers: any[]
  parameters: any
}

interface AutomationContext {
  userAddress: string
  chainId: number
  scenarios: AutomationScenario[]
  globalConfig: any
  performanceMetrics: {
    totalExecutions: number
    successRate: number
    totalProfit: string
    totalGasCost: string
    lastExecution: number
  }
}

interface AutomationStatus {
  isRunning: boolean
  registeredUsers: number
  totalScenarios: number
}

export default function AutomationPage() {
  const [automationContext, setAutomationContext] = useState<AutomationContext | null>(null)
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [userAddress, setUserAddress] = useState<string>('')
  const [isRegistered, setIsRegistered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('dashboard')

  // Fetch automation status
  const fetchAutomationStatus = async () => {
    try {
      const response = await fetch('/api/automation/status')
      const data = await response.json()
      if (data.success) {
        setAutomationStatus(data.status)
      }
    } catch (error) {
      console.error('Error fetching automation status:', error)
    }
  }

  // Fetch automation context for user
  const fetchAutomationContext = async (address: string) => {
    try {
      const response = await fetch(`/api/automation/context/${address}`)
      const data = await response.json()
      if (data.success) {
        setAutomationContext(data.context)
        setIsRegistered(true)
      } else {
        setIsRegistered(false)
      }
    } catch (error) {
      console.error('Error fetching automation context:', error)
      setIsRegistered(false)
    }
  }

  // Register user for automation
  const registerAutomation = async () => {
    if (!userAddress) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/automation/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress,
          preferences: {
            enableYieldOptimization: true,
            enablePortfolioRebalancing: true,
            enableRiskManagement: true,
            enablePositionMonitoring: true,
            enableLiquidationProtection: true,
            riskTolerance: 'medium',
            maxSlippage: 0.5,
            targetAPY: '12.0',
            preferredProtocols: ['symphony', 'takara', 'silo']
          }
        })
      })

      const data = await response.json()
      if (data.success) {
        await fetchAutomationContext(userAddress)
        setError(null)
      } else {
        setError(data.error || 'Failed to register automation')
      }
    } catch (error) {
      setError('Failed to register automation')
      console.error('Error registering automation:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Toggle scenario enabled/disabled
  const toggleScenario = async (scenarioId: string, enabled: boolean) => {
    if (!automationContext) return

    const updatedScenarios = automationContext.scenarios.map(scenario =>
      scenario.id === scenarioId ? { ...scenario, enabled } : scenario
    )

    try {
      const response = await fetch(`/api/automation/scenarios/${userAddress}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scenarios: updatedScenarios })
      })

      const data = await response.json()
      if (data.success) {
        setAutomationContext(prev => prev ? { ...prev, scenarios: updatedScenarios } : null)
      }
    } catch (error) {
      console.error('Error updating scenario:', error)
    }
  }

  // Start/Stop automation
  const toggleAutomation = async (start: boolean) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/automation/${start ? 'start' : 'stop'}`, {
        method: 'POST'
      })

      const data = await response.json()
      if (data.success) {
        await fetchAutomationStatus()
      }
    } catch (error) {
      console.error('Error toggling automation:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Get scenario icon
  const getScenarioIcon = (type: string) => {
    switch (type) {
      case 'yield_optimization':
        return <TrendingUp className="h-4 w-4" />
      case 'portfolio_rebalancing':
        return <BarChart3 className="h-4 w-4" />
      case 'risk_management':
        return <Shield className="h-4 w-4" />
      case 'position_monitoring':
        return <Eye className="h-4 w-4" />
      case 'liquidation_protection':
        return <AlertTriangle className="h-4 w-4" />
      case 'profit_taking':
        return <Target className="h-4 w-4" />
      case 'stop_loss':
        return <DollarSign className="h-4 w-4" />
      default:
        return <Settings className="h-4 w-4" />
    }
  }

  // Get risk level color
  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low':
        return 'bg-green-100 text-green-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'high':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Format number with commas
  const formatNumber = (num: string | number) => {
    return parseFloat(num.toString()).toLocaleString()
  }

  // Format time
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  useEffect(() => {
    fetchAutomationStatus()
    const interval = setInterval(fetchAutomationStatus, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (userAddress) {
      fetchAutomationContext(userAddress)
    }
  }, [userAddress])

  return (
    <div className="min-h-screen bg-[#1c1c1c] text-[#fcf7f0] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Automation Dashboard</h1>
            <p className="text-[#fcf7f0]/70 mt-2">Manage your DeFi automation strategies</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${automationStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">
                {automationStatus?.isRunning ? 'Running' : 'Stopped'}
              </span>
            </div>
            <Button
              onClick={() => toggleAutomation(!automationStatus?.isRunning)}
              disabled={isLoading}
              className={`${
                automationStatus?.isRunning 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-green-600 hover:bg-green-700'
              } text-white`}
            >
              {automationStatus?.isRunning ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {automationStatus?.isRunning ? 'Stop' : 'Start'}
            </Button>
          </div>
        </div>

        {/* User Address Input */}
        <Card className="mb-6 bg-[#2a2a2a] border-[#333333]">
          <CardHeader>
            <CardTitle className="text-[#fcf7f0]">User Address</CardTitle>
            <CardDescription className="text-[#fcf7f0]/70">
              Enter your wallet address to manage automation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <input
                type="text"
                value={userAddress}
                onChange={(e) => setUserAddress(e.target.value)}
                placeholder="0x..."
                className="flex-1 p-3 rounded-lg bg-[#333333] border border-[#444444] text-[#fcf7f0] placeholder-[#fcf7f0]/50"
              />
              <Button
                onClick={registerAutomation}
                disabled={isLoading || !userAddress}
                className="bg-[#ccff33] hover:bg-[#b8e62e] text-[#1c1c1c]"
              >
                {isRegistered ? 'Refresh' : 'Register'}
              </Button>
            </div>
            {error && (
              <Alert className="mt-4 bg-red-900/20 border-red-800">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card className="bg-[#2a2a2a] border-[#333333]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-[#fcf7f0]/70">Engine Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${automationStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-2xl font-bold text-[#fcf7f0]">
                  {automationStatus?.isRunning ? 'Active' : 'Inactive'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#2a2a2a] border-[#333333]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-[#fcf7f0]/70">Registered Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#fcf7f0]">
                {automationStatus?.registeredUsers || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#2a2a2a] border-[#333333]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-[#fcf7f0]/70">Total Scenarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#fcf7f0]">
                {automationStatus?.totalScenarios || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard */}
        {isRegistered && automationContext && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 bg-[#2a2a2a] border-[#333333]">
              <TabsTrigger value="dashboard" className="text-[#fcf7f0] data-[state=active]:bg-[#ccff33] data-[state=active]:text-[#1c1c1c]">
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="scenarios" className="text-[#fcf7f0] data-[state=active]:bg-[#ccff33] data-[state=active]:text-[#1c1c1c]">
                Scenarios
              </TabsTrigger>
              <TabsTrigger value="performance" className="text-[#fcf7f0] data-[state=active]:bg-[#ccff33] data-[state=active]:text-[#1c1c1c]">
                Performance
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              {/* Performance Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-[#2a2a2a] border-[#333333]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-[#fcf7f0]/70">Total Executions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#fcf7f0]">
                      {automationContext.performanceMetrics.totalExecutions}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-[#2a2a2a] border-[#333333]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-[#fcf7f0]/70">Success Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#fcf7f0]">
                      {(automationContext.performanceMetrics.successRate * 100).toFixed(1)}%
                    </div>
                    <Progress 
                      value={automationContext.performanceMetrics.successRate * 100} 
                      className="mt-2"
                    />
                  </CardContent>
                </Card>

                <Card className="bg-[#2a2a2a] border-[#333333]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-[#fcf7f0]/70">Total Profit</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-400">
                      {formatNumber(automationContext.performanceMetrics.totalProfit)} SEI
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-[#2a2a2a] border-[#333333]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-[#fcf7f0]/70">Gas Cost</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-400">
                      {formatNumber(automationContext.performanceMetrics.totalGasCost)} SEI
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Active Scenarios Overview */}
              <Card className="bg-[#2a2a2a] border-[#333333]">
                <CardHeader>
                  <CardTitle className="text-[#fcf7f0]">Active Scenarios</CardTitle>
                  <CardDescription className="text-[#fcf7f0]/70">
                    Currently enabled automation scenarios
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {automationContext.scenarios.filter(s => s.enabled).map((scenario) => (
                      <div key={scenario.id} className="flex items-center justify-between p-4 bg-[#333333] rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="text-[#ccff33]">
                            {getScenarioIcon(scenario.type)}
                          </div>
                          <div>
                            <div className="font-medium text-[#fcf7f0]">{scenario.name}</div>
                            <div className="text-sm text-[#fcf7f0]/70">Priority: {scenario.priority}</div>
                          </div>
                        </div>
                        <Badge className={getRiskLevelColor(scenario.riskLevel)}>
                          {scenario.riskLevel}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Last Execution */}
              {automationContext.performanceMetrics.lastExecution > 0 && (
                <Card className="bg-[#2a2a2a] border-[#333333]">
                  <CardHeader>
                    <CardTitle className="text-[#fcf7f0]">Last Execution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#fcf7f0]/70" />
                      <span className="text-[#fcf7f0]">
                        {formatTime(automationContext.performanceMetrics.lastExecution)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="scenarios" className="space-y-6">
              <Card className="bg-[#2a2a2a] border-[#333333]">
                <CardHeader>
                  <CardTitle className="text-[#fcf7f0]">Automation Scenarios</CardTitle>
                  <CardDescription className="text-[#fcf7f0]/70">
                    Configure and manage your automation scenarios
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {automationContext.scenarios.map((scenario) => (
                    <div key={scenario.id} className="p-4 bg-[#333333] rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-[#ccff33]">
                            {getScenarioIcon(scenario.type)}
                          </div>
                          <div>
                            <div className="font-medium text-[#fcf7f0]">{scenario.name}</div>
                            <div className="text-sm text-[#fcf7f0]/70">{scenario.description}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={getRiskLevelColor(scenario.riskLevel)}>
                            {scenario.riskLevel}
                          </Badge>
                          <div className="text-sm text-[#fcf7f0]/70">P{scenario.priority}</div>
                          <Switch
                            checked={scenario.enabled}
                            onCheckedChange={(checked) => toggleScenario(scenario.id, checked)}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <div className="text-sm font-medium text-[#fcf7f0]/70 mb-2">Triggers</div>
                          <div className="space-y-1">
                            {scenario.triggers.map((trigger, index) => (
                              <div key={index} className="text-sm text-[#fcf7f0] bg-[#444444] px-2 py-1 rounded">
                                {trigger.type}: {trigger.condition} {trigger.value}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#fcf7f0]/70 mb-2">Parameters</div>
                          <div className="space-y-1">
                            {Object.entries(scenario.parameters).slice(0, 3).map(([key, value]) => (
                              <div key={key} className="text-sm text-[#fcf7f0]">
                                {key}: {typeof value === 'object' ? JSON.stringify(value) : value.toString()}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="performance" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-[#2a2a2a] border-[#333333]">
                  <CardHeader>
                    <CardTitle className="text-[#fcf7f0]">Execution History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[#fcf7f0]/70">Total Executions</span>
                        <span className="text-[#fcf7f0] font-medium">
                          {automationContext.performanceMetrics.totalExecutions}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#fcf7f0]/70">Success Rate</span>
                        <span className="text-green-400 font-medium">
                          {(automationContext.performanceMetrics.successRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#fcf7f0]/70">Last Execution</span>
                        <span className="text-[#fcf7f0] font-medium">
                          {automationContext.performanceMetrics.lastExecution > 0 
                            ? formatTime(automationContext.performanceMetrics.lastExecution)
                            : 'Never'
                          }
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-[#2a2a2a] border-[#333333]">
                  <CardHeader>
                    <CardTitle className="text-[#fcf7f0]">Financial Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[#fcf7f0]/70">Total Profit</span>
                        <span className="text-green-400 font-medium">
                          {formatNumber(automationContext.performanceMetrics.totalProfit)} SEI
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#fcf7f0]/70">Gas Costs</span>
                        <span className="text-red-400 font-medium">
                          {formatNumber(automationContext.performanceMetrics.totalGasCost)} SEI
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-4 border-t border-[#444444]">
                        <span className="text-[#fcf7f0]/70">Net Profit</span>
                        <span className="text-[#ccff33] font-bold">
                          {formatNumber(
                            (parseFloat(automationContext.performanceMetrics.totalProfit) - 
                             parseFloat(automationContext.performanceMetrics.totalGasCost)).toString()
                          )} SEI
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Registration Prompt */}
        {!isRegistered && userAddress && (
          <Card className="bg-[#2a2a2a] border-[#333333]">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="text-[#fcf7f0] text-lg">
                  User not registered for automation
                </div>
                <div className="text-[#fcf7f0]/70">
                  Register to start using automated DeFi strategies
                </div>
                <Button
                  onClick={registerAutomation}
                  disabled={isLoading}
                  className="bg-[#ccff33] hover:bg-[#b8e62e] text-[#1c1c1c]"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Register for Automation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
} 