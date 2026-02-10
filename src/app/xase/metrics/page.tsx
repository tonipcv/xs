import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

async function fetchText(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    return await res.text()
  } catch (e) {
    return ''
  }
}

type ParsedMetric = { name: string; labels: Record<string, string>; value: string }

function parseMetrics(prom: string): ParsedMetric[] {
  const lines = prom.split('\n')
  const out: ParsedMetric[] = []
  const rx = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)\s*$/

  for (const raw of lines) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    const m = l.match(rx)
    if (!m) continue
    const name = m[1]
    const labelsStr = m[2] || ''
    const value = m[3]
    const labels: Record<string, string> = {}
    if (labelsStr) {
      // Strip braces { ... }
      const inner = labelsStr.slice(1, -1)
      if (inner.includes('=')) {
        // Standard Prometheus format: key="value",key2="value2"
        for (const part of inner.split(',')) {
          const [k, v] = part.split('=')
          if (!k) continue
          labels[k.trim()] = (v || '').replace(/^"|"$/g, '').trim()
        }
      } else if (inner.length > 0) {
        // Non-standard export like {service,federated_agent,status,healthy}
        const toks = inner.split(',').map((t) => t.trim()).filter(Boolean)
        for (let i = 0; i < toks.length; i += 2) {
          const k = toks[i]
          const v = toks[i + 1] ?? ''
          if (k) labels[k] = v
        }
      }
    }
    out.push({ name, labels, value })
  }
  return out.slice(0, 20)
}

export default async function MetricsPage() {
  // Build absolute base URL to avoid relative fetch issues on server
  const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const prom = await fetchText(`${base}/api/metrics`)
  const sample = parseMetrics(prom)

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>Metrics</h1>
            <p className="text-sm text-gray-600">Prometheus exposition and quick view</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl">
            {sample.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Metric</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Labels</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sample.map((m, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="px-4 py-2 font-mono text-gray-800">{m.name}</td>
                        <td className="px-4 py-2">
                          {Object.keys(m.labels).length > 0 ? (
                            <code className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-800">
                              {Object.entries(m.labels).map(([k, v]) => `${k}="${v}"`).join(', ')}
                            </code>
                          ) : (
                            <span className="text-xs text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-800">{m.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <p className="text-sm text-gray-700">No metrics parsed yet. Open the raw endpoint to verify exposition format.</p>
                <a href={`${base}/api/metrics`} target="_blank" className="inline-block mt-2 text-blue-600 hover:underline text-sm">Open /api/metrics</a>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-medium text-gray-800">Raw Prometheus</h2>
            <pre className="text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto">{prom || '# No metrics yet'}</pre>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
