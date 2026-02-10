'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

export default function EpsilonConsolePage() {
  const [tenantId, setTenantId] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleReset = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/v1/privacy/epsilon/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, datasetId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reset epsilon budget')
      setResult(data)
    } catch (e: any) {
      setError(e.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[900px] mx-auto px-8 py-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>Epsilon Budget</h1>
            <p className="text-sm text-gray-600">Reset budget and inspect usage</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-700">Tenant ID</label>
                <input className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-md" value={tenantId} onChange={e=>setTenantId(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-700">Dataset ID</label>
                <input className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-md" value={datasetId} onChange={e=>setDatasetId(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleReset} disabled={loading} className="px-4 py-2 bg-gray-900 text-white rounded-md disabled:opacity-50">{loading ? 'Resetting...' : 'Reset Budget'}</button>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            {result && (
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs text-gray-600">Note: usage listing UI will be added after we expose a GET endpoint for budgets/queries.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
