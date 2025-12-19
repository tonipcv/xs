'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, TrendingUp, TrendingDown, Activity, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface MetricsData {
  period: string
  summary: {
    total_decisions: number
    ai_decisions: number
    human_interventions: number
    override_count: number
    approval_count: number
    rejection_count: number
  }
  rates: {
    override_rate: number
    intervention_rate: number
    approval_rate: number
  }
  performance: {
    avg_confidence: number | null
    avg_processing_time_ms: number | null
  }
  top_override_reasons: Array<{ reason: string; count: number }>
  metrics_by_model: Record<string, any>
}

interface AlertData {
  id: string
  alert_type: string
  severity: string
  status: string
  title: string
  message: string
  metric_value?: number
  threshold_value?: number
  triggered_at: string
}

export function TrustDashboard({ period = '24h' }: { period?: string }) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        
        // Fetch metrics
        const metricsRes = await fetch(`/api/xase/v1/metrics?period=${period}`)
        if (!metricsRes.ok) throw new Error('Failed to fetch metrics')
        const metricsData = await metricsRes.json()
        setMetrics(metricsData)

        // Fetch alerts
        const alertsRes = await fetch('/api/xase/v1/alerts?status=OPEN&limit=10')
        if (!alertsRes.ok) throw new Error('Failed to fetch alerts')
        const alertsData = await alertsRes.json()
        setAlerts(alertsData.alerts || [])

        setError(null)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [period])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!metrics) return null

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'destructive'
      case 'ERROR':
        return 'destructive'
      case 'WARNING':
        return 'default'
      case 'INFO':
        return 'secondary'
      default:
        return 'default'
    }
  }

  return (
    <div className="space-y-6">
      {/* Alertas Ativos */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">🔔 Alertas Ativos</h3>
          {alerts.map((alert) => (
            <Alert key={alert.id} variant={getSeverityColor(alert.severity) as any}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="flex items-center gap-2">
                {alert.title}
                <Badge variant={getSeverityColor(alert.severity) as any}>{alert.severity}</Badge>
              </AlertTitle>
              <AlertDescription>
                {alert.message}
                {alert.metric_value && alert.threshold_value && (
                  <div className="mt-2 text-sm">
                    Valor atual: <strong>{alert.metric_value.toFixed(2)}</strong> | Threshold:{' '}
                    <strong>{alert.threshold_value.toFixed(2)}</strong>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Main Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white/[0.02] border border-white/[0.06]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white">Total Decisions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.summary.total_decisions}</div>
            <p className="text-xs text-white/60">
              {metrics.summary.ai_decisions} AI | {metrics.summary.human_interventions} Human
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white">Override Rate</CardTitle>
            {metrics.rates.override_rate > 15 ? (
              <TrendingUp className="h-4 w-4 text-red-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.rates.override_rate.toFixed(1)}%</div>
            <p className="text-xs text-white/60">
              {metrics.summary.override_count} overrides
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border border-white/[0.06]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white">Avg Confidence</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.performance.avg_confidence
                ? (metrics.performance.avg_confidence * 100).toFixed(1) + '%'
                : 'N/A'}
            </div>
            <p className="text-xs text-white/60">Model confidence</p>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border border-white/[0.06]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white">Approval Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.rates.approval_rate.toFixed(1)}%</div>
            <p className="text-xs text-white/60">
              {metrics.summary.approval_count} approvals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Decisions by Source */}
      <Card className="bg-white/[0.02] border border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-white">Decisions: AI vs Human</CardTitle>
          <CardDescription className="text-white/60">Final decision distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">AI (no intervention)</span>
              <span className="text-sm text-white/60">
                {metrics.summary.ai_decisions} (
                {metrics.summary.total_decisions > 0
                  ? ((metrics.summary.ai_decisions / metrics.summary.total_decisions) * 100).toFixed(
                      1
                    )
                  : 0}
                %)
              </span>
            </div>
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{
                  width: `${
                    metrics.summary.total_decisions > 0
                      ? (metrics.summary.ai_decisions / metrics.summary.total_decisions) * 100
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm font-medium text-white">Human Intervention</span>
              <span className="text-sm text-white/60">
                {metrics.summary.human_interventions} (
                {metrics.summary.total_decisions > 0
                  ? (
                      (metrics.summary.human_interventions / metrics.summary.total_decisions) *
                      100
                    ).toFixed(1)
                  : 0}
                %)
              </span>
            </div>
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500"
                style={{
                  width: `${
                    metrics.summary.total_decisions > 0
                      ? (metrics.summary.human_interventions / metrics.summary.total_decisions) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Override Reasons */}
      {metrics.top_override_reasons.length > 0 && (
        <Card className="bg-white/[0.02] border border-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-white">Top Override Reasons</CardTitle>
            <CardDescription className="text-white/60">Most common reasons for human intervention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.top_override_reasons.slice(0, 5).map((reason, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-white">{reason.reason}</span>
                  <Badge variant="secondary">{reason.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metrics by Model */}
      {Object.keys(metrics.metrics_by_model).length > 0 && (
        <Card className="bg-white/[0.02] border border-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-white">Performance by Model</CardTitle>
            <CardDescription className="text-white/60">AI model comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(metrics.metrics_by_model).map(([modelId, modelMetrics]) => (
                <div key={modelId} className="border-b pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white">{modelId}</span>
                    <Badge variant="outline">{modelMetrics.decisions} decisions</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-white/60">Override Rate:</span>
                      <span className="ml-1 font-medium text-white">
                        {modelMetrics.override_rate.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Overrides:</span>
                      <span className="ml-1 font-medium text-white">{modelMetrics.overrides}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Confidence:</span>
                      <span className="ml-1 font-medium text-white">
                        {modelMetrics.avg_confidence
                          ? (modelMetrics.avg_confidence * 100).toFixed(1) + '%'
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
