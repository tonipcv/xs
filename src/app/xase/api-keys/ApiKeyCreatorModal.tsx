'use client'

import { useState } from 'react'
import ApiKeyCreator from './ApiKeyCreator'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export default function ApiKeyCreatorModal() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm font-medium rounded-md transition-colors">
          Create API Key
        </button>
      </DialogTrigger>
      <DialogContent className="bg-[#121316] border-white/[0.08]">
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
