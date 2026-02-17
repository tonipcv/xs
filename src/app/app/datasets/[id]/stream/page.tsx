'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

export default function StreamingViewerPage() {
  const params = useParams() as { datasetId?: string } | null
  const datasetId = params?.datasetId

  const [dataset, setDataset] = useState<any>(null)
  const [leaseId, setLeaseId] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamData, setStreamData] = useState<any[]>([])
  const [error, setError] = useState('')
  const [epsilonConsumed, setEpsilonConsumed] = useState(0)

  useEffect(() => {
    if (!datasetId) return
    const fetchDataset = async () => {
      try {
        const res = await fetch(`/api/v1/datasets/${datasetId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load dataset')
        setDataset(data)
      } catch (e: any) {
        setError(e.message || 'Failed to load dataset')
      }
    }
    fetchDataset()
  }, [datasetId])

  const handleStream = async () => {
    if (!leaseId.trim()) {
      setError('Please enter a lease ID')
      return
    }
    setStreaming(true)
    setError('')
    setStreamData([])
    setEpsilonConsumed(0)

    try {
      const res = await fetch(`/api/v1/datasets/${datasetId}/stream?leaseId=${leaseId}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Stream failed')
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      if (!reader) throw new Error('No stream reader available')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            try {
              const obj = JSON.parse(line)
              setStreamData(prev => [...prev, obj])
              if (obj.epsilonConsumed) setEpsilonConsumed(obj.epsilonConsumed)
            } catch {
              // ignore non-JSON lines
            }
          }
        }
      }
    } catch (e: any) {
      if (e.message.includes('429')) {
        setError('Epsilon budget exhausted (429). Please reset budget or wait for the next period.')
      } else {
        setError(e.message || 'Stream failed')
      }
    } finally {
      setStreaming(false)
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>Streaming Viewer</h1>
            <p className="text-sm text-gray-600">Dataset: {dataset?.name || datasetId || '—'}</p>
          </div>

          {!datasetId ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">Missing datasetId in route.</div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Lease ID</label>
                  <input
                    className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-md"
                    value={leaseId}
                    onChange={(e) => setLeaseId(e.target.value)}
                    placeholder="Enter your lease ID"
                  />
                </div>
                <button
                  onClick={handleStream}
                  disabled={streaming}
                  className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                >
                  {streaming ? 'Streaming...' : 'Start Stream'}
                </button>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
                )}

                {epsilonConsumed > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700 text-sm">
                    Epsilon consumed: {epsilonConsumed.toFixed(4)}
                  </div>
                )}
              </div>

              {streamData.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                  <h2 className="text-sm font-medium text-gray-800">Stream Data ({streamData.length} items)</h2>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {streamData.map((item, idx) => (
                      <pre key={idx} className="text-xs bg-gray-50 border border-gray-200 rounded p-2">{JSON.stringify(item, null, 2)}</pre>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
