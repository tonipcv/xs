'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Activity, Database, Shield, Zap } from 'lucide-react'

interface SidecarSession {
  id: string
  leaseId: string
  status: string
  startedAt: string
  lastHeartbeat: string
  totalBytesServed: string
  totalSegmentsServed: number
  trustLevel: string
  attested: boolean
}

export default function SidecarDashboard() {
  const [sessions, setSessions] = useState<SidecarSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [])

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/v1/sidecar/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes: string) => {
    const num = parseInt(bytes)
    if (num < 1024) return `${num} B`
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(2)} KB`
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(2)} MB`
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'expired': return 'bg-yellow-500'
      case 'killed': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getTrustBadge = (trustLevel: string, attested: boolean) => {
    if (attested) {
      return <Badge className="bg-blue-600">Attested</Badge>
    }
    return <Badge variant="outline">Self-Reported</Badge>
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sidecar Dashboard</h1>
          <p className="text-muted-foreground">Monitor active training sessions</p>
        </div>
        <Button onClick={fetchSessions} variant="outline">
          <Activity className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sessions.filter(s => s.status === 'active').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Data Served</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(
                sessions.reduce((sum, s) => sum + parseInt(s.totalBytesServed), 0).toString()
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attested Sessions</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sessions.filter(s => s.attested).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Segments Served</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sessions.reduce((sum, s) => sum + s.totalSegmentsServed, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Real-time monitoring of Sidecar instances</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No active sessions</div>
          ) : (
            <div className="space-y-4">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{session.id}</code>
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(session.status)}`} />
                      {getTrustBadge(session.trustLevel, session.attested)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Lease: {session.leaseId}
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="text-sm font-medium">
                      {formatBytes(session.totalBytesServed)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {session.totalSegmentsServed.toLocaleString()} segments
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Started: {new Date(session.startedAt).toLocaleTimeString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last: {new Date(session.lastHeartbeat).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
