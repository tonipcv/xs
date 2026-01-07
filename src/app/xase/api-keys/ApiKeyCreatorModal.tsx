'use client'

import { useState } from 'react'
import ApiKeyCreator from './ApiKeyCreator'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export default function ApiKeyCreatorModal() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="px-4 py-2 border border-white/12 bg-transparent text-white/85 text-sm font-medium rounded-md hover:bg-white/[0.04] hover:border-white/20 transition-colors">
          Create API Key
        </button>
      </DialogTrigger>
      <DialogContent className="bg-[#0e0f12] border-white/[0.08]">
        <DialogHeader>
          <DialogTitle className="text-white">Create API Key</DialogTitle>
          <DialogDescription>Generate a new API key for this tenant. The full key will be shown only once.</DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <ApiKeyCreator />
        </div>
      </DialogContent>
    </Dialog>
  )
}
