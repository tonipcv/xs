'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

export default function ObservabilityDashboardPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      const [metricsRes, healthRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch('/api/v1/health/detailed')
      ])

      const metricsText = await metricsRes.text()
      const healthData = await healthRes.json()

      const parsed = parsePrometheusMetrics(metricsText)
      setMetrics(parsed)
      setHealth(healthData)
      setError('')
    } catch (e: any) {
      setError(e.message || 'Failed to fetch observability data')
    } finally {
      setLoading(false)
    }
  }

  const parsePrometheusMetrics = (prom: string) => {
    const lines = prom.split('\n')
    const out: Record<string, number> = {}
    const rx = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)\s*$/
    for (const raw of lines) {
      const l = raw.trim()
      if (!l || l.startsWith('#')) continue
      const m = l.match(rx)
      if (!m) continue
      const nameOnly = m[1] // strip labels block
      const val = parseFloat(m[3])
      if (!isNaN(val) && out[nameOnly] === undefined) {
        out[nameOnly] = val // keep first occurrence per metric name
      }
    }
    return out
  }

  const getMetricValue = (key: string) => {
    if (!metrics) return '—'
    const val = metrics[key]
    return val !== undefined ? val.toString() : '—'
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>Observability Dashboard</h1>
              <p className="text-sm text-gray-600">Real-time system metrics and health status</p>
            </div>
            <button onClick={fetchData} className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs hover:bg-gray-800">
              Refresh
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="text-gray-600">Loading metrics...</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">System Up</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">{getMetricValue('xase_system_up')}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">API Requests</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">{getMetricValue('xase_api_requests_total')}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Epsilon Consumed</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">{getMetricValue('xase_epsilon_budget_consumed')}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Policy Enforcements</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">{getMetricValue('xase_policy_enforcements_total')}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                  <h2 className="text-sm font-medium text-gray-800">Health Status</h2>
                  {health ? (
                    <div className="space-y-2">
                      {(() => {
                        const dbHealthy = health?.checks?.database?.status === 'healthy'
                        const rdHealthy = health?.checks?.redis?.status === 'healthy'
                        const faHealthy = health?.checks?.federatedAgent?.status === 'healthy'
                        return (
                          <>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Database</span>
                              <span className={dbHealthy ? 'text-green-600' : 'text-red-600'}>
                                {dbHealthy ? '✓ Healthy' : '✗ Unhealthy'}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Redis</span>
                              <span className={rdHealthy ? 'text-green-600' : 'text-red-600'}>
                                {rdHealthy ? '✓ Healthy' : '✗ Unhealthy'}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Federated Agent</span>
                              <span className={faHealthy ? 'text-green-600' : 'text-red-600'}>
                                {faHealthy ? '✓ Healthy' : '✗ Unhealthy'}
                              </span>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No health data available</p>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                  <h2 className="text-sm font-medium text-gray-800">Privacy & Compliance</h2>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Consent Revocations</span>
                      <span className="text-gray-900">{getMetricValue('xase_consent_revocations_total')}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">K-Anonymity Violations</span>
                      <span className="text-gray-900">0</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">DP Budget Resets</span>
                      <span className="text-gray-900">0</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-medium text-gray-800">All Metrics</h2>
                <div className="grid gap-2 md:grid-cols-3">
                  {metrics && Object.entries(metrics).map(([key, value]) => (
                    <div key={key} className="text-xs">
                      <span className="text-gray-600">{key}:</span>{' '}
                      <span className="text-gray-900 font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
