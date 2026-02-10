'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock, DollarSign, Activity, FileText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { toast } from 'sonner'

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchExecutions()
  }, [statusFilter])

  const fetchExecutions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/v1/executions?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setExecutions(data.executions)
      } else {
        toast.error('Failed to load executions')
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error)
      toast.error('Failed to load executions')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'EXPIRED':
        return 'bg-gray-100 text-gray-800 border-gray-300'
      case 'REVOKED':
        return 'bg-red-100 text-red-800 border-red-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">My Access Executions</h1>
        <p className="text-muted-foreground text-lg">
          Track your active and past governed access contracts, usage metrics, and evidence generation.
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-64">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="REVOKED">Revoked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          {executions.length} execution{executions.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Executions List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : executions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No Executions Yet</h3>
            <p className="text-muted-foreground mb-4">
              You haven't requested access to any governed data contracts yet.
            </p>
            <Link href="/xase/governed-access">
              <Button>Browse Access Catalog</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {executions.map((execution) => (
            <Card key={execution.executionId} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl mb-1">
                      {execution.offer.title}
                    </CardTitle>
                    <CardDescription>{execution.policy.usagePurpose}</CardDescription>
                  </div>
                  <Badge className={getStatusColor(execution.status)}>
                    {execution.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  {/* Hours Used */}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{execution.hoursUsed.toFixed(2)}h</div>
                      <div className="text-xs text-muted-foreground">Hours Used</div>
                    </div>
                  </div>

                  {/* Requests */}
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{execution.requestCount}</div>
                      <div className="text-xs text-muted-foreground">Requests</div>
                    </div>
                  </div>

                  {/* Total Cost */}
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">
                        {execution.currency} {execution.totalCost}
                      </div>
                      <div className="text-xs text-muted-foreground">Total Cost</div>
                    </div>
                  </div>

                  {/* Evidence */}
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">
                        {execution.evidenceHash ? 'Generated' : 'Not Yet'}
                      </div>
                      <div className="text-xs text-muted-foreground">Evidence</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <span>Started: {new Date(execution.startedAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Expires: {new Date(execution.expiresAt).toLocaleDateString()}</span>
                  {execution.lease.status === 'EXPIRED' && (
                    <>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs">Lease Expired</Badge>
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <Link href={`/xase/executions/${execution.executionId}`}>
                    <Button size="sm">View Details</Button>
                  </Link>
                  <Link href={`/xase/governed-access/${execution.offer.offerId}`}>
                    <Button size="sm" variant="outline">View Contract</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
