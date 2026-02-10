import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

async function fetchJSON(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    // Try to parse body even if not ok (e.g., 503 with diagnostics)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Surface diagnostics rather than hiding with null
      return { status: body?.status || 'unknown', ...body }
    }
    return body
  } catch (e: any) {
    return { status: 'unknown', error: e?.message || 'fetch_failed' }
  }
}

export default async function HealthPage() {
  // Build absolute base URL from env to avoid relative URL parse errors on server
  const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const basic = await fetchJSON(`${base}/api/health`)
  const detailed = await fetchJSON(`${base}/api/v1/health/detailed`)

  const normalizeStatus = (s?: string) => (s === 'ok' ? 'healthy' : (s || 'unknown'))
  const overallStatus: string = normalizeStatus(detailed?.status || basic?.status)
  const statusBadge = (s?: string) => {
    const st = (s || 'unknown') as
      | 'healthy'
      | 'unhealthy'
      | 'degraded'
      | 'unknown'
      | 'not_configured'
    const map: Record<typeof st, string> = {
      healthy: 'bg-green-100 text-green-700 border-green-200',
      unhealthy: 'bg-red-100 text-red-700 border-red-200',
      degraded: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      unknown: 'bg-gray-100 text-gray-700 border-gray-200',
      not_configured: 'bg-gray-100 text-gray-700 border-gray-200',
    }
    const label = String(st).replace('_', ' ')
    return (
      <span className={`px-2 py-0.5 text-xs rounded border ${map[st]}`}>{label}</span>
    )
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>System Health</h1>
            <p className="text-sm text-gray-600">Basic and detailed health status</p>
          </div>

          {/* Overview */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-800">Overall</h2>
                {statusBadge(overallStatus)}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {detailed?.timestamp || basic?.timestamp || '—'}
                {detailed?.error && (
                  <span className="ml-2 text-[11px] text-red-600">{String(detailed.error).slice(0,120)}</span>
                )}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-800">Database</h2>
                {statusBadge(detailed?.checks?.database?.status)}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                RT: {detailed?.checks?.database?.responseTime ?? '—'} ms
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-800">Redis</h2>
                {statusBadge(detailed?.checks?.redis?.status)}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                RT: {detailed?.checks?.redis?.responseTime ?? '—'} ms
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-800">Federated Agent</h2>
                {statusBadge(detailed?.checks?.federatedAgent?.status)}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                RT: {detailed?.checks?.federatedAgent?.responseTime ?? '—'} ms
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-800">System</h2>
                {statusBadge(detailed?.checks?.system?.status)}
              </div>
              <div className="text-xs text-gray-700 mt-2 space-y-1">
                <div>Uptime: {detailed?.checks?.system?.metrics?.uptime?.toFixed?.(0) ?? '—'} s</div>
                <div>Node: {detailed?.checks?.system?.metrics?.nodeVersion ?? '—'}</div>
                <div>RSS: {Math.round((detailed?.checks?.system?.metrics?.memory?.rss || 0) / (1024*1024))} MB</div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-800">API Latency</h2>
                {statusBadge(detailed?.checks?.apiLatency?.status)}
              </div>
              <div className="text-xs text-gray-700 mt-2 space-y-1">
                <div>P50: {detailed?.checks?.apiLatency?.percentiles?.p50 ?? '—'} ms</div>
                <div>P95: {detailed?.checks?.apiLatency?.percentiles?.p95 ?? '—'} ms</div>
                <div>P99: {detailed?.checks?.apiLatency?.percentiles?.p99 ?? '—'} ms</div>
              </div>
            </div>
          </div>

          {/* Raw JSON for debugging */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-medium text-gray-800">Basic Health (raw)</h2>
              <pre className="text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto">{JSON.stringify(basic ?? { status: 'unknown' }, null, 2)}</pre>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-medium text-gray-800">Detailed Health (raw)</h2>
              <pre className="text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto">{JSON.stringify(detailed ?? { status: 'unknown' }, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
