'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

type Rules = {
  allowedColumns: string[]
  deniedColumns: string[]
  rowFilters?: any
  maskingRules?: any
}

export default function RewriteRulesEditorPage() {
  const params = useParams() as { policyId?: string } | null
  const router = useRouter()
  const policyId = params?.policyId

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rules, setRules] = useState<Rules>({ allowedColumns: [], deniedColumns: [], rowFilters: {}, maskingRules: {} })
  const [rawFilters, setRawFilters] = useState('')
  const [rawMasking, setRawMasking] = useState('')

  useEffect(() => {
    const run = async () => {
      try {
        if (!policyId) throw new Error('Missing policyId in route')
        const res = await fetch(`/api/v1/policies/${policyId}/rewrite-rules`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load rules')
        setRules({
          allowedColumns: data.allowedColumns || [],
          deniedColumns: data.deniedColumns || [],
          rowFilters: data.rowFilters || {},
          maskingRules: data.maskingRules || {},
        })
        setRawFilters(JSON.stringify(data.rowFilters || {}, null, 2))
        setRawMasking(JSON.stringify(data.maskingRules || {}, null, 2))
      } catch (e: any) {
        setError(e.message || 'Failed to load rules')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [policyId])

  const handleSave = async () => {
    setError('')
    try {
      let parsedFilters: any = {}
      let parsedMasking: any = {}
      if (rawFilters.trim()) parsedFilters = JSON.parse(rawFilters)
      if (rawMasking.trim()) parsedMasking = JSON.parse(rawMasking)

      const payload = {
        allowedColumns: rules.allowedColumns.filter(Boolean),
        deniedColumns: rules.deniedColumns.filter(Boolean),
        rowFilters: parsedFilters,
        maskingRules: parsedMasking,
      }
      const res = await fetch(`/api/v1/policies/${policyId}/rewrite-rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save rules')
      router.back()
    } catch (e: any) {
      setError(e.message || 'Failed to save rules')
    }
  }

  const setList = (key: 'allowedColumns'|'deniedColumns', csv: string) => {
    const arr = csv.split(',').map(s => s.trim()).filter(Boolean)
    setRules({ ...rules, [key]: arr })
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0e0f12]">
        <div className="max-w-[1000px] mx-auto px-8 py-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-3xl font-semibold text-white tracking-tight`}>Rewrite Rules</h1>
            <p className="text-sm text-white/50">Policy: {policyId || '—'}</p>
          </div>

          {!policyId ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">Missing policyId in route.</div>
          ) : loading ? (
            <div className="text-white/70">Loading...</div>
          ) : (
            <div className="space-y-6">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">{error}</div>
              )}

              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm text-white/80">Allowed Columns (comma-separated)</label>
                  <input
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
                    defaultValue={rules.allowedColumns.join(', ')}
                    onChange={(e) => setList('allowedColumns', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-white/80">Denied Columns (comma-separated)</label>
                  <input
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
                    defaultValue={rules.deniedColumns.join(', ')}
                    onChange={(e) => setList('deniedColumns', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm text-white/80">Row Filters (JSON)</label>
                  <textarea
                    className="w-full h-52 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs font-mono"
                    value={rawFilters}
                    onChange={(e) => setRawFilters(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-white/80">Masking Rules (JSON)</label>
                  <textarea
                    className="w-full h-52 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs font-mono"
                    value={rawMasking}
                    onChange={(e) => setRawMasking(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => router.back()} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm">Cancel</button>
                <button onClick={handleSave} className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm">Save</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
