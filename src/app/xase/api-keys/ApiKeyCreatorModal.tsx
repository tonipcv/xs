'use client'

import { useState } from 'react'
import ApiKeyCreator from './ApiKeyCreator'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export default function ApiKeyCreatorModal() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="px-4 py-2 border border-gray-300 bg-white text-gray-900 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors">
          Create API Key
        </button>
      </DialogTrigger>
      <DialogContent className="bg-white border border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Create API Key</DialogTitle>
          <DialogDescription className="text-gray-600">Generate a new API key for this tenant. The full key will be shown only once.</DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <ApiKeyCreator />
        </div>
      </DialogContent>
    </Dialog>
  )
}
