'use client'

/**
 * Billing Dashboard Component
 * Comprehensive billing visualization with storage, compute, and data processing metrics
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  DollarSign, 
  HardDrive, 
  Cpu, 
  Database, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Download,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BillingSummary {
  currentMonth: {
    period: { start: Date; end: Date }
    usage: {
      bytesProcessed: string
      computeHours: number
      storageGbHours: number
    }
    costs: {
      dataProcessing: number
      compute: number
      storage: number
      total: number
    }
    breakdown: {
      byDataset: Record<string, any>
      byLease: Record<string, any>
    }
  }
  lastMonth: {
    costs: {
      total: number
      storage: number
      compute: number
      dataProcessing: number
    }
  }
  balance: number
  upcomingInvoice: {
    amount: number
    dueDate: Date
  }
  trends: {
    storageGrowth: number
    computeGrowth: number
    costGrowth: number
  }
}

interface StorageMetrics {
  totalStorageGb: number
  totalStorageBytes: string
  datasetCount: number
  lastUpdated: Date
  datasets: Array<{
    datasetId: string
    storageGb: number
    storageBytes: string
    lastSnapshot: Date
  }>
}

export function BillingDashboard({ tenantId }: { tenantId: string }) {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [storage, setStorage] = useState<StorageMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadBillingData()
  }, [tenantId])

  const loadBillingData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [summaryRes, storageRes] = await Promise.all([
        fetch(`/api/v1/billing/dashboard?tenantId=${tenantId}&action=summary`),
        fetch(`/api/v1/billing/storage?tenantId=${tenantId}&action=current`),
      ])

      if (!summaryRes.ok || !storageRes.ok) {
        throw new Error('Failed to load billing data')
      }

      const summaryData = await summaryRes.json()
      const storageData = await storageRes.json()

      setSummary(summaryData)
      setStorage(storageData)
    } catch (err: any) {
      setError(err.message)
      console.error('Failed to load billing data:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const getTrendIcon = (growth: number) => {
    if (growth > 0) return <TrendingUp className="h-4 w-4 text-gray-900" />
    if (growth < 0) return <TrendingDown className="h-4 w-4 text-gray-900" />
    return null
  }

  const getTrendColor = (growth: number) => {
    return 'text-gray-900'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading billing data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      </div>
    )
  }

  if (!summary || !storage) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-900">Current Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-900" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(summary.balance)}</div>
            <p className="text-xs text-gray-900">
              Available credits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-900">Storage Usage</CardTitle>
            <HardDrive className="h-4 w-4 text-gray-900" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{storage.totalStorageGb.toFixed(2)} GB</div>
            <p className="text-xs text-gray-900 flex items-center gap-1">
              {getTrendIcon(summary.trends.storageGrowth)}
              <span className={getTrendColor(summary.trends.storageGrowth)}>
                {Math.abs(summary.trends.storageGrowth).toFixed(1)}% from last month
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-900">Compute Hours</CardTitle>
            <Cpu className="h-4 w-4 text-gray-900" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {summary.currentMonth.usage.computeHours.toFixed(1)}h
            </div>
            <p className="text-xs text-gray-900 flex items-center gap-1">
              {getTrendIcon(summary.trends.computeGrowth)}
              <span className={getTrendColor(summary.trends.computeGrowth)}>
                {Math.abs(summary.trends.computeGrowth).toFixed(1)}% from last month
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-900">This Month</CardTitle>
            <Calendar className="h-4 w-4 text-gray-900" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(summary.currentMonth.costs.total)}
            </div>
            <p className="text-xs text-gray-900 flex items-center gap-1">
              {getTrendIcon(summary.trends.costGrowth)}
              <span className={getTrendColor(summary.trends.costGrowth)}>
                {Math.abs(summary.trends.costGrowth).toFixed(1)}% from last month
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Cost Breakdown</CardTitle>
          <CardDescription className="text-gray-900">Current month usage and costs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Data Processing */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-gray-900" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Data Processing</p>
                  <p className="text-xs text-gray-900">
                    {formatBytes(Number(summary.currentMonth.usage.bytesProcessed))} processed
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-900">
                  {formatCurrency(summary.currentMonth.costs.dataProcessing)}
                </p>
                <p className="text-xs text-gray-900">
                  {((summary.currentMonth.costs.dataProcessing / summary.currentMonth.costs.total) * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Compute */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-gray-900" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Compute</p>
                  <p className="text-xs text-gray-900">
                    {summary.currentMonth.usage.computeHours.toFixed(1)} hours
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-900">
                  {formatCurrency(summary.currentMonth.costs.compute)}
                </p>
                <p className="text-xs text-gray-900">
                  {((summary.currentMonth.costs.compute / summary.currentMonth.costs.total) * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Storage */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-gray-900" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Storage</p>
                  <p className="text-xs text-gray-900">
                    {summary.currentMonth.usage.storageGbHours.toFixed(1)} GB-hours
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-900">
                  {formatCurrency(summary.currentMonth.costs.storage)}
                </p>
                <p className="text-xs text-gray-900">
                  {((summary.currentMonth.costs.storage / summary.currentMonth.costs.total) * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Total */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Total</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatCurrency(summary.currentMonth.costs.total)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Storage by Dataset */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Storage by Dataset</CardTitle>
          <CardDescription className="text-gray-900">Current storage allocation across datasets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {storage.datasets.length > 0 ? (
              storage.datasets.map((dataset) => (
                <div key={dataset.datasetId} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{dataset.datasetId}</p>
                    <p className="text-xs text-gray-900">
                      Last updated: {new Date(dataset.lastSnapshot).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{dataset.storageGb.toFixed(2)} GB</p>
                    <p className="text-xs text-gray-900">
                      {((dataset.storageGb / storage.totalStorageGb) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-900 text-center py-4">
                No storage data available
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Invoice */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Upcoming Invoice</CardTitle>
          <CardDescription className="text-gray-900">
            Due {new Date(summary.upcomingInvoice.dueDate).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {formatCurrency(summary.upcomingInvoice.amount)}
              </p>
              <p className="text-sm text-gray-900 mt-1">
                Based on current month usage
              </p>
            </div>
            <Button variant="outline" size="sm" className="border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
