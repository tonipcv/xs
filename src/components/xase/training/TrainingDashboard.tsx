'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, Activity, Zap, DollarSign, Clock } from 'lucide-react'
import { formatCurrency, formatHours } from '@/lib/xase/cost-calculator'

interface TrainingMetrics {
  throughputMBps: number
  cacheHitRate: number
  gpuUtilization: number
  costSoFar: number
  budgetLimit: number
  leaseExpiresAt: string
  sessionId: string
  datasetName: string
  status: 'running' | 'paused' | 'completed' | 'failed'
}

interface TrainingDashboardProps {
  sessionId: string
  refreshInterval?: number
}

export function TrainingDashboard({ sessionId, refreshInterval = 5000 }: TrainingDashboardProps) {
  const [metrics, setMetrics] = useState<TrainingMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`/api/v1/training/${sessionId}/metrics`)
        if (response.ok) {
          const data = await response.json()
          setMetrics(data)
        }
      } catch (error) {
        console.error('Failed to fetch metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, refreshInterval)
    return () => clearInterval(interval)
  }, [sessionId, refreshInterval])

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!metrics) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No metrics available
          </div>
        </CardContent>
      </Card>
    )
  }

  const timeUntilExpiry = new Date(metrics.leaseExpiresAt).getTime() - Date.now()
  const hoursRemaining = timeUntilExpiry / (1000 * 60 * 60)
  const budgetUsedPercent = (metrics.costSoFar / metrics.budgetLimit) * 100

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Training Session: {sessionId}</CardTitle>
              <CardDescription>Dataset: {metrics.datasetName}</CardDescription>
            </div>
            <Badge variant={metrics.status === 'running' ? 'default' : 'secondary'}>
              {metrics.status.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Throughput */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Throughput</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.throughputMBps.toFixed(1)} MB/s</div>
            <Progress value={Math.min((metrics.throughputMBps / 100) * 100, 100)} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metrics.throughputMBps > 50 ? 'Excellent' : metrics.throughputMBps > 20 ? 'Good' : 'Slow'}
            </p>
          </CardContent>
        </Card>

        {/* Cache Hit Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.cacheHitRate.toFixed(1)}%</div>
            <Progress value={metrics.cacheHitRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metrics.cacheHitRate > 90 ? 'Optimal' : metrics.cacheHitRate > 70 ? 'Good' : 'Low'}
            </p>
          </CardContent>
        </Card>

        {/* GPU Utilization */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">GPU Utilization</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.gpuUtilization.toFixed(1)}%</div>
            <Progress value={metrics.gpuUtilization} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metrics.gpuUtilization > 95 ? 'Excellent' : metrics.gpuUtilization > 80 ? 'Good' : 'Underutilized'}
            </p>
          </CardContent>
        </Card>

        {/* Cost Tracker */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.costSoFar)}</div>
            <Progress value={budgetUsedPercent} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              of {formatCurrency(metrics.budgetLimit)} budget
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lease Countdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Lease Expiry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">{formatHours(hoursRemaining)}</div>
              <p className="text-sm text-muted-foreground">
                Expires at {new Date(metrics.leaseExpiresAt).toLocaleString()}
              </p>
            </div>
            {hoursRemaining < 1 && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Expiring soon!</span>
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm">
              Extend Lease
            </Button>
            <Button variant="outline" size="sm">
              Pause Training
            </Button>
            <Button variant="destructive" size="sm">
              Kill Switch
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {(metrics.gpuUtilization < 80 || budgetUsedPercent > 90 || hoursRemaining < 1) && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-600">
              <AlertCircle className="h-4 w-4" />
              Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.gpuUtilization < 80 && (
              <div className="text-sm">
                ⚠️ GPU utilization is below 80%. Data pipeline may be bottleneck.
              </div>
            )}
            {budgetUsedPercent > 90 && (
              <div className="text-sm">
                ⚠️ Budget usage is above 90%. Training may stop soon.
              </div>
            )}
            {hoursRemaining < 1 && (
              <div className="text-sm">
                🚨 Lease expires in less than 1 hour. Extend now to avoid interruption.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
