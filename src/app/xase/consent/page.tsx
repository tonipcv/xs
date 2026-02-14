'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

export default function ConsentManagementPage() {
  const [datasets, setDatasets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchDatasets()
  }, [])

  const fetchDatasets = async () => {
    try {
      const res = await fetch('/api/xase/datasets')
      if (!res.ok) {
        // Try to parse JSON error if possible; otherwise raise generic
        let message = 'Failed to load datasets'
        try {
          const err = await res.json()
          message = err.error || message
        } catch {}
        throw new Error(message)
      }
      let data: any
      try {
        data = await res.json()
      } catch (e) {
        throw new Error('Invalid datasets response')
      }
      // Support both array or { datasets: [...] }
      const list = Array.isArray(data) ? data : (data.datasets || [])
      setDatasets(list)
    } catch (e: any) {
      setError(e.message || 'Failed to load datasets')
    } finally {
      setLoading(false)
    }
  }

  const handleGrant = async (datasetId: string) => {
    setActionLoading(datasetId)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/v1/consent/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, userId: 'web-ui-user' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to grant consent')
      setSuccess(`Consent granted for dataset ${datasetId}`)
      fetchDatasets()
    } catch (e: any) {
      setError(e.message || 'Failed to grant consent')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRevoke = async (datasetId: string) => {
    setActionLoading(datasetId)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/v1/consent/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, userId: 'web-ui-user', reason: 'User requested via UI' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to revoke consent')
      setSuccess(`Consent revoked for dataset ${datasetId}. Active leases were automatically revoked.`)
      fetchDatasets()
    } catch (e: any) {
      setError(e.message || 'Failed to revoke consent')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>Consent Management</h1>
            <p className="text-sm text-gray-600">Grant or revoke consent for datasets. Revoking consent automatically revokes active leases.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">{success}</div>
          )}

          {loading ? (
            <div className="text-gray-600">Loading datasets...</div>
          ) : datasets.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <p className="text-gray-600">No datasets found</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-600">Dataset</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-600">Consent Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {datasets.map((ds: any) => (
                    <tr key={ds.datasetId} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{ds.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          ds.consentStatus === 'VERIFIED_BY_XASE' ? 'bg-green-100 text-green-700' :
                          ds.consentStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {ds.consentStatus || 'MISSING'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleGrant(ds.datasetId)}
                            disabled={actionLoading === ds.datasetId}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                          >
                            {actionLoading === ds.datasetId ? 'Processing...' : 'Grant'}
                          </button>
                          <button
                            onClick={() => handleRevoke(ds.datasetId)}
                            disabled={actionLoading === ds.datasetId}
                            className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                          >
                            {actionLoading === ds.datasetId ? 'Processing...' : 'Revoke'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
