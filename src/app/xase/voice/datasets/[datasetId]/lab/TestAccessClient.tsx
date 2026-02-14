'use client'

import { useState } from 'react'

interface Props {
  datasetId: string
  policyOptions: { policyId: string; usagePurpose: string }[]
  defaultPolicyId?: string
}

export default function TestAccessClient({ datasetId, policyOptions, defaultPolicyId }: Props) {
  const [policyId, setPolicyId] = useState(defaultPolicyId || (policyOptions[0]?.policyId || ''))
  const [requestedHours, setRequestedHours] = useState('0.5')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<null | { allowed: boolean; reason?: string }>(null)

  const runTest = async () => {
    if (!policyId) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`/api/v1/policies/${encodeURIComponent(policyId)}/validate?requestedHours=${encodeURIComponent(requestedHours || '0.5')}`, { method: 'GET' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Test failed')
      setResult({ allowed: data.allowed, reason: data.reason })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Policy</label>
          <select
            value={policyId}
            onChange={(e) => setPolicyId(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-gray-400"
          >
            {policyOptions.map((p) => (
              <option key={p.policyId} value={p.policyId}>
                {p.policyId} — {p.usagePurpose}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Requested Hours</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={requestedHours}
            onChange={(e) => setRequestedHours(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder:text-gray-500 focus:outline-none focus:border-gray-400"
          />
        </div>
        <button
          onClick={runTest}
          disabled={loading || !policyId}
          className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-900 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
        >
          {loading ? 'Testing…' : 'Test Access'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-800">Evaluation</p>
            <span className={`px-2 py-0.5 rounded text-[10px] ${result.allowed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {result.allowed ? 'GRANTED' : 'DENIED'}
            </span>
          </div>
          {!result.allowed && result.reason && (
            <p className="mt-2 text-xs text-red-700">Reason: <span className="font-mono">{result.reason}</span></p>
          )}
        </div>
      )}
    </div>
  )
}
