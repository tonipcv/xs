'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
// Removed shadcn Select in favor of native select per UX request
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface PublishAccessOfferButtonProps {
  datasetId: string
  datasetName: string
  datasetLanguage?: string
  datasetJurisdiction?: string
}

export function PublishAccessOfferButton({ 
  datasetId, 
  datasetName,
  datasetLanguage = 'en-US',
  datasetJurisdiction = 'US'
}: PublishAccessOfferButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [form, setForm] = useState({
    title: `Governed Access: ${datasetName}`,
    description: '',
    allowedPurposes: [''],
    constraints: {
      canStream: true,
      canBatchDownload: false,
      canCache: false,
      canExport: false,
      canFineTuneReuse: false,
      retentionPolicy: 'DELETE_AFTER_30_DAYS',
      requiresEncryption: true,
      requiresAuditLog: true,
    },
    jurisdiction: datasetJurisdiction,
    scopeHours: 100,
    scopeRecordings: undefined,
    priceModel: 'PAY_PER_HOUR',
    pricePerHour: 10,
    currency: 'USD',
    language: datasetLanguage,
    useCases: [''],
    riskClass: 'MEDIUM',
    sampleMetadata: {},
  })

  const handleAddPurpose = () => {
    setForm({ ...form, allowedPurposes: [...form.allowedPurposes, ''] })
  }

  const handleRemovePurpose = (index: number) => {
    setForm({ ...form, allowedPurposes: form.allowedPurposes.filter((_, i) => i !== index) })
  }

  const handlePurposeChange = (index: number, value: string) => {
    const newPurposes = [...form.allowedPurposes]
    newPurposes[index] = value
    setForm({ ...form, allowedPurposes: newPurposes })
  }

  const handleAddUseCase = () => {
    setForm({ ...form, useCases: [...form.useCases, ''] })
  }

  const handleRemoveUseCase = (index: number) => {
    setForm({ ...form, useCases: form.useCases.filter((_, i) => i !== index) })
  }

  const handleUseCaseChange = (index: number, value: string) => {
    const newUseCases = [...form.useCases]
    newUseCases[index] = value
    setForm({ ...form, useCases: newUseCases })
  }

  const handlePublish = async () => {
    // Validate
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!form.description.trim()) {
      toast.error('Description is required')
      return
    }
    const validPurposes = form.allowedPurposes.filter(p => p.trim())
    if (validPurposes.length === 0) {
      toast.error('At least one allowed purpose is required')
      return
    }

    try {
      setPublishing(true)
      const res = await fetch(`/api/v1/datasets/${datasetId}/access-offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          allowedPurposes: validPurposes,
          useCases: form.useCases.filter(u => u.trim()),
        }),
      })

      if (res.ok) {
        const offer = await res.json()
        toast.success('Access offer created successfully!')
        setOpen(false)
        router.push(`/xase/governed-access/${offer.offerId}`)
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to create access offer')
      }
    } catch (error) {
      console.error('Failed to publish offer:', error)
      toast.error('Failed to create access offer')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 h-9 px-4 py-2 text-sm">
          Publish as Access Offer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white border border-gray-200 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Publish Governed Access Offer</DialogTitle>
          <DialogDescription className="text-gray-600">
            Create an executable access contract with built-in governance, pricing, and evidence generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title" className="text-gray-800">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Governed Access: Medical Voice Dataset"
                className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-gray-800">Description *</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe what this data is, its quality, and what makes it valuable..."
                rows={4}
                className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Allowed Purposes */}
          <div>
            <Label className="text-gray-800">Allowed Purposes *</Label>
            <p className="text-sm text-gray-600 mb-2">
              What can buyers use this data for?
            </p>
            {form.allowedPurposes.map((purpose, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input
                  value={purpose}
                  onChange={(e) => handlePurposeChange(i, e.target.value)}
                  placeholder="e.g., Training speech recognition models"
                  className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500"
                />
                {form.allowedPurposes.length > 1 && (
                  <Button variant="outline" size="icon" onClick={() => handleRemovePurpose(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={handleAddPurpose}>
              <Plus className="h-4 w-4 mr-1" />
              Add Purpose
            </Button>
          </div>

          {/* Constraints */}
          <div>
            <Label className="text-gray-800">Access Constraints</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="canStream"
                  checked={form.constraints.canStream}
                  onChange={(e) => 
                    setForm({ ...form, constraints: { ...form.constraints, canStream: e.target.checked } })
                  }
                />
                <label htmlFor="canStream" className="text-sm">Allow Streaming</label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="canBatchDownload"
                  checked={form.constraints.canBatchDownload}
                  onChange={(e) => 
                    setForm({ ...form, constraints: { ...form.constraints, canBatchDownload: e.target.checked } })
                  }
                />
                <label htmlFor="canBatchDownload" className="text-sm">Allow Batch Download</label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="canCache"
                  checked={form.constraints.canCache}
                  onChange={(e) => 
                    setForm({ ...form, constraints: { ...form.constraints, canCache: e.target.checked } })
                  }
                />
                <label htmlFor="canCache" className="text-sm">Allow Caching</label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="canExport"
                  checked={form.constraints.canExport}
                  onChange={(e) => 
                    setForm({ ...form, constraints: { ...form.constraints, canExport: e.target.checked } })
                  }
                />
                <label htmlFor="canExport" className="text-sm">Allow Export</label>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pricePerHour" className="text-gray-800">Price per Hour *</Label>
              <Input
                id="pricePerHour"
                type="number"
                value={form.pricePerHour}
                onChange={(e) => setForm({ ...form, pricePerHour: parseFloat(e.target.value) })}
                className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500"
              />
            </div>
            <div>
              <Label htmlFor="scopeHours" className="text-gray-800">Scope (Hours) *</Label>
              <Input
                id="scopeHours"
                type="number"
                value={form.scopeHours}
                onChange={(e) => setForm({ ...form, scopeHours: parseFloat(e.target.value) })}
                className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Risk & Jurisdiction */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="riskClass" className="text-gray-800">Risk Class *</Label>
              <select
                id="riskClass"
                className="mt-1 w-full h-9 rounded-md border border-gray-300 bg-white text-gray-900 text-sm px-2"
                value={form.riskClass}
                onChange={(e) => setForm({ ...form, riskClass: e.target.value })}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <Label htmlFor="jurisdiction" className="text-gray-800">Jurisdiction *</Label>
              <Input
                id="jurisdiction"
                value={form.jurisdiction}
                onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
                placeholder="e.g., US, EU, UK"
                className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Use Cases */}
          <div>
            <Label>Use Cases (optional)</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Help buyers discover your offer
            </p>
            {form.useCases.map((useCase, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input
                  value={useCase}
                  onChange={(e) => handleUseCaseChange(i, e.target.value)}
                  placeholder="e.g., Healthcare, Customer Service"
                />
                {form.useCases.length > 1 && (
                  <Button variant="outline" size="icon" onClick={() => handleRemoveUseCase(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={handleAddUseCase}>
              <Plus className="h-4 w-4 mr-1" />
              Add Use Case
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={publishing}>
            {publishing ? 'Publishing...' : 'Publish Offer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
