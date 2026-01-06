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
        <button className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium rounded-md transition-colors">
          Delete
        </button>
      </DialogTrigger>
      <DialogContent className="bg-[#121316] border-white/[0.08]">
        <DialogHeader>
          <DialogTitle className="text-white">Delete API Key</DialogTitle>
          <DialogDescription>
            This action will deactivate the API key "{apiKeyName}". Clients using this key will be denied. Confirm to proceed.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="text-red-400 text-xs mt-2">{error}</div>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs rounded-md"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 bg-white text-black text-xs rounded-md disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Confirm delete'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
