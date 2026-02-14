'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Activity, TrendingUp, Clock, DollarSign, Download } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

export default function UsagePage() {
  const [realTimeUsage, setRealTimeUsage] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [billingEvents, setBillingEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRealTimeUsage()
    loadSummary()
    loadBillingEvents()
  }, [])

  const loadRealTimeUsage = async () => {
    try {
      const response = await fetch('/api/v1/billing/usage?action=realtime&tenantId=current')
      const data = await response.json()
      setRealTimeUsage(data.usage)
    } catch (error) {
      console.error('Failed to load real-time usage:', error)
    }
  }

  const loadSummary = async () => {
    try {
      const end = new Date()
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
      const response = await fetch(
        `/api/v1/billing/usage?action=summary&tenantId=current&start=${start.toISOString()}&end=${end.toISOString()}`
      )
      const data = await response.json()
      setSummary(data)
    } catch (error) {
      console.error('Failed to load summary:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadBillingEvents = async () => {
    try {
      const end = new Date()
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
      const response = await fetch(
        `/api/v1/billing/usage?action=events&tenantId=current&start=${start.toISOString()}&end=${end.toISOString()}`
      )
      const data = await response.json()
      setBillingEvents(data.events || [])
    } catch (error) {
      console.error('Failed to load billing events:', error)
    }
  }

  const calculateBill = async () => {
    try {
      const end = new Date()
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
      const response = await fetch('/api/v1/billing/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calculate-bill',
          tenantId: 'current',
          start: start.toISOString(),
          end: end.toISOString(),
          rates: {
            hours: 0.1,
            requests: 0.001,
            bytes: 0.00001,
          },
        }),
      })
      const data = await response.json()
      alert(`Total Bill: $${data.total.toFixed(2)}`)
    } catch (error) {
      console.error('Failed to calculate bill:', error)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usage & Billing</h1>
          <p className="text-muted-foreground mt-2">
            Monitor your resource consumption and costs
          </p>
        </div>
        <Button onClick={calculateBill}>
          <DollarSign className="mr-2 h-4 w-4" />
          Calculate Bill
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Hours (Last Hour)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {realTimeUsage?.hours?.toFixed(2) || '0.00'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {realTimeUsage?.requests || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Bytes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((realTimeUsage?.bytes || 0) / 1024 / 1024).toFixed(2)} MB
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Queries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {realTimeUsage?.queries || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Epsilon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {realTimeUsage?.epsilon?.toFixed(4) || '0.0000'}
            </div>
          </CardContent>
        </Card>
      </div>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>30-Day Summary</CardTitle>
            <CardDescription>
              Usage metrics for the last 30 days
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold">{summary.metrics.totalHours.toFixed(2)}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">{summary.metrics.totalRequests}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Bytes</p>
                <p className="text-2xl font-bold">
                  {(summary.metrics.totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Queries</p>
                <p className="text-2xl font-bold">{summary.metrics.totalQueries}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Epsilon</p>
                <p className="text-2xl font-bold">{summary.metrics.totalEpsilon.toFixed(4)}</p>
              </div>
            </div>

            {Object.keys(summary.breakdown.byDataset).length > 0 && (
              <div>
                <h4 className="font-medium mb-3">Usage by Dataset</h4>
                <div className="space-y-2">
                  {Object.entries(summary.breakdown.byDataset).slice(0, 5).map(([datasetId, metrics]: [string, any]) => (
                    <div key={datasetId} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm font-medium">{datasetId}</span>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{metrics.hours?.toFixed(2) || 0} hrs</span>
                        <span>{metrics.requests || 0} req</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(summary.breakdown.byLease).length > 0 && (
              <div>
                <h4 className="font-medium mb-3">Usage by Lease</h4>
                <div className="space-y-2">
                  {Object.entries(summary.breakdown.byLease).slice(0, 5).map(([leaseId, metrics]: [string, any]) => (
                    <div key={leaseId} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm font-medium">{leaseId}</span>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{metrics.hours?.toFixed(2) || 0} hrs</span>
                        <span>{metrics.requests || 0} req</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Billing Events</CardTitle>
          <CardDescription>
            Recent billing events and charges
          </CardDescription>
        </CardHeader>
        <CardContent>
          {billingEvents.length > 0 ? (
            <div className="space-y-2">
              {billingEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={event.type === 'overage' ? 'destructive' : 'default'}>
                        {event.type}
                      </Badge>
                      <span className="text-sm font-medium">{event.id}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">
                      ${event.amount.toFixed(2)} {event.currency}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No billing events yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
