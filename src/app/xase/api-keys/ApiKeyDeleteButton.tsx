'use client'

import { useState } from 'react'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

interface Props {
  apiKeyId: string
  apiKeyName: string
}

export default function ApiKeyDeleteButton({ apiKeyId, apiKeyName }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/xase/api-keys/${apiKeyId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Delete failed')
      }
      setOpen(false)
      // naive refresh
      if (typeof window !== 'undefined') window.location.reload()
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="px-3 py-1.5 border border-gray-300 bg-white text-gray-900 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors">
          Delete
        </button>
      </DialogTrigger>
      <DialogContent className="bg-white border border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Delete API Key</DialogTitle>
          <DialogDescription className="text-gray-600">
            This action will deactivate the API key "{apiKeyName}". Clients using this key will be denied. Confirm to proceed.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="text-red-600 text-xs mt-2">{error}</div>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-1.5 border border-gray-300 bg-white text-gray-900 text-xs rounded-md hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md disabled:opacity-60 hover:bg-gray-800"
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Confirm delete'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
