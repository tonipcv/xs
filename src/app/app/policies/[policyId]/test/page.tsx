'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function TestAccessPage() {
  const router = useRouter()
  const params = useParams<{ policyId: string }>()
  const policyId = params?.policyId as string
  const [requestedHours, setRequestedHours] = useState('0.5')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<null | { allowed: boolean; reason?: string; datasetId?: string }>(null)
  const [error, setError] = useState('')

  const runTest = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const url = `/api/v1/policies/${encodeURIComponent(policyId)}/validate?requestedHours=${encodeURIComponent(requestedHours || '0.5')}`
      const res = await fetch(url, { method: 'GET' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Test failed')
      setResult({ allowed: data.allowed, reason: data.reason, datasetId: data.datasetId })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // auto-run once on mount for a quick demo
    runTest().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const badge = (ok: boolean) => (
    <span className={`px-2 py-0.5 rounded text-[10px] ${ok ? 'bg-white/10 text-white/80' : 'bg-red-500/10 text-red-400'}`}>
      {ok ? 'GRANTED' : 'DENIED'}
    </span>
  )

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0e0f12]">
        <div className="max-w-[800px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <h1 className={`${heading.className} text-3xl font-semibold text-white tracking-tight`}>
                Test Policy Access
              </h1>
              <p className="text-sm text-white/40 font-mono">Policy: {policyId}</p>
            </div>
            <Link href="/app/policies" className="text-sm text-white/60 hover:text-white/80">
              ← Back to Policies
            </Link>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-white/80">Requested Hours</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={requestedHours}
                  onChange={(e) => setRequestedHours(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
                />
                <p className="text-xs text-white/50">Default 0.5h. This does not consume hours; it only evaluates the policy.</p>
              </div>
              <button
                onClick={runTest}
                disabled={loading}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
              >
                {loading ? 'Testing…' : 'Test Access'}
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {result && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/80">Result</p>
                  {badge(result.allowed)}
                </div>
                <div className="mt-3 text-sm text-white/70 space-y-1">
                  {result.datasetId && (
                    <p>Dataset: <span className="font-mono text-white/80">{result.datasetId}</span></p>
                  )}
                  {!result.allowed && result.reason && (
                    <p>Reason: <span className="font-mono text-red-300">{result.reason}</span></p>
                  )}
                  {result.allowed && <p className="text-white/70">Access granted for the requested window.</p>}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
            <p className="text-sm text-white/80 leading-relaxed">
              This is a non-mutating policy check. It writes an audit entry with action <code className="font-mono">POLICY_CHECK</code> but does not increase
              consumption nor create a usage debit in the ledger.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
