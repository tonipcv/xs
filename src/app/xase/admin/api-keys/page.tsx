'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

export default function APIKeysPage() {
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchKeys()
  }, [])

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/xase/api-keys')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load API keys')
      setKeys(data.keys || [])
    } catch (e: any) {
      setError(e.message || 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      setError('Please enter a key name')
      return
    }
    setCreating(true)
    setError('')
    setNewKey(null)
    try {
      const res = await fetch('/api/xase/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create API key')
      setNewKey(data.key)
      setNewKeyName('')
      setShowCreateModal(false)
      fetchKeys()
    } catch (e: any) {
      setError(e.message || 'Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return
    try {
      const res = await fetch(`/api/xase/api-keys/${keyId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to revoke API key')
      fetchKeys()
    } catch (e: any) {
      setError(e.message || 'Failed to revoke API key')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>API Keys</h1>
            <p className="text-sm text-gray-600">Manage API keys for programmatic access</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
          )}

          {newKey && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-green-800">API Key Created Successfully</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-xs font-mono">{newKey}</code>
                <button
                  onClick={() => copyToClipboard(newKey)}
                  className="px-3 py-2 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-green-700">⚠️ Save this key now. You won't be able to see it again.</p>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-800">Create New API Key</h2>
              <p className="text-xs text-gray-500 mt-1">Issue API credentials with a friendly name</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2 bg-gray-900 text-white rounded-full text-sm hover:bg-gray-800"
            >
              + New Key
            </button>
          </div>

          {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/30" onClick={() => !creating && setShowCreateModal(false)} />
              <div className="relative bg-white w-full max-w-md mx-4 rounded-2xl border border-gray-200 shadow-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">Create API Key</h3>
                  <button
                    onClick={() => !creating && setShowCreateModal(false)}
                    className="px-3 py-1 text-gray-600 hover:text-gray-900 rounded-full"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-700">Key name</label>
                  <input
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production API"
                    disabled={creating}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    disabled={creating}
                    className="px-4 py-2 rounded-full border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="px-5 py-2 bg-gray-900 text-white rounded-full text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create Key'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-gray-600">Loading API keys...</div>
          ) : keys.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <p className="text-gray-600">No API keys yet. Create one above.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-600">Key (masked)</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-600">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key: any) => (
                    <tr key={key.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{key.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{key.keyHash?.substring(0, 16)}...</td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {new Date(key.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          key.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {key.isActive ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {key.isActive && (
                          <button
                            onClick={() => handleRevoke(key.id)}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-full text-xs hover:bg-red-700"
                          >
                            Revoke
                          </button>
                        )}
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
