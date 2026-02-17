"use client"

import { useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppSidebar'

function NewOfferContent() {
  const router = useRouter()
  const params = useSearchParams()

  const datasetId = params?.get('datasetId') ?? ''
  const datasetName = params?.get('name') ?? ''
  const datasetLanguage = params?.get('lang') ?? 'en-US'
  const datasetJurisdiction = params?.get('jur') ?? 'US'

  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({
    title: datasetName ? `Governed Access: ${datasetName}` : 'Governed Access Offer',
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
    scopeRecordings: undefined as number | undefined,
    priceModel: 'PAY_PER_HOUR',
    pricePerHour: 10,
    currency: 'USD',
    language: datasetLanguage,
    useCases: [''],
    riskClass: 'MEDIUM',
    sampleMetadata: {},
  })

  const handlePurposeChange = (i: number, v: string) => {
    const arr = [...form.allowedPurposes]
    arr[i] = v
    setForm({ ...form, allowedPurposes: arr })
  }
  const handleAddPurpose = () => setForm({ ...form, allowedPurposes: [...form.allowedPurposes, ''] })
  const handleRemovePurpose = (i: number) => setForm({ ...form, allowedPurposes: form.allowedPurposes.filter((_: any, idx: number) => idx !== i) })

  const handleUseCaseChange = (i: number, v: string) => {
    const arr = [...form.useCases]
    arr[i] = v
    setForm({ ...form, useCases: arr })
  }
  const handleAddUseCase = () => setForm({ ...form, useCases: [...form.useCases, ''] })
  const handleRemoveUseCase = (i: number) => setForm({ ...form, useCases: form.useCases.filter((_: any, idx: number) => idx !== i) })

  const canSubmit = useMemo(() => {
    if (!datasetId) return false
    if (!form.title?.trim()) return false
    if (!(form.description?.trim() && form.description.trim().length >= 10)) return false
    if ((form.allowedPurposes || []).filter((p: string) => p.trim()).length === 0) return false
    return true
  }, [datasetId, form])

  const handleSubmit = async () => {
    const validPurposes = (form.allowedPurposes || []).map((p: string) => p.trim()).filter((p: string) => p)
    if (!datasetId) { toast.error('Missing datasetId'); return }
    if (!form.title?.trim()) { toast.error('Title is required'); return }
    if (!(form.description?.trim() && form.description.trim().length >= 10)) { toast.error('Description must be at least 10 characters'); return }
    if (validPurposes.length === 0) { toast.error('At least one allowed purpose is required'); return }

    try {
      setSubmitting(true)
      const res = await fetch(`/api/v1/datasets/${datasetId}/access-offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          title: (form.title || '').trim(),
          description: (form.description || '').trim(),
          jurisdiction: (form.jurisdiction || '').trim(),
          language: (form.language || '').trim(),
          allowedPurposes: validPurposes,
          useCases: (form.useCases || []).map((u: string) => u.trim()).filter((u: string) => u),
        })
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as any))
        // Prefer field-level messages if available
        const fieldErrors = e?.details?.fieldErrors || {}
        const formErrors = e?.details?.formErrors || []
        const issues = e?.issues || []
        const messages: string[] = []
        Object.entries(fieldErrors).forEach(([field, msgs]: any) => {
          if (Array.isArray(msgs) && msgs.length) messages.push(`${field}: ${msgs[0]}`)
        })
        formErrors.forEach((m: string) => messages.push(m))
        issues.forEach((i: any) => {
          if (i?.path && i?.message) messages.push(`${i.path}: ${i.message}`)
        })
        const msg = messages[0] || e?.error || `Failed with ${res.status}`
        throw new Error(msg)
      }
      const offer = await res.json()
      toast.success('Access offer created successfully')
      router.replace(`/xase/governed-access/${offer.offerId}`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create offer')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="mx-auto max-w-screen-xl w-full px-4 md:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Publish Governed Access Offer</h1>
          <p className="text-gray-600 mt-1">Create an executable access contract with built-in governance, pricing, and evidence generation.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-8">
          {/* Dataset context */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-800">Dataset</Label>
              <div className="mt-1 text-sm text-gray-900 font-medium">{datasetName || datasetId}</div>
              <div className="text-xs text-gray-600">Lang: {datasetLanguage} • Jurisdiction: {datasetJurisdiction}</div>
            </div>
          </div>

          {/* Basic info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title" className="text-gray-800">Title *</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                     placeholder="e.g., Governed Access: Medical Voice Dataset"
                     className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500" />
            </div>
            <div>
              <Label htmlFor="description" className="text-gray-800">Description *</Label>
              <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={4} placeholder="Describe what this data is, its quality, and what makes it valuable..."
                        className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500" />
            </div>
          </div>

          {/* Allowed Purposes */}
          <div>
            <Label className="text-gray-800">Allowed Purposes *</Label>
            <p className="text-sm text-gray-600 mb-2">What can buyers use this data for?</p>
            {(form.allowedPurposes || []).map((purpose: string, i: number) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input value={purpose} onChange={(e) => handlePurposeChange(i, e.target.value)}
                       placeholder="e.g., Training speech recognition models"
                       className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500" />
                {form.allowedPurposes.length > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="border-gray-300 text-gray-700 hover:bg-gray-100"
                    onClick={() => handleRemovePurpose(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="border-gray-300 text-gray-900 hover:bg-gray-100"
              onClick={handleAddPurpose}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Purpose
            </Button>
          </div>

          {/* Constraints */}
          <div>
            <Label className="text-gray-800">Access Constraints</Label>
            <div className="grid grid-cols-2 gap-3 mt-2 text-gray-900">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.constraints.canStream}
                       onChange={(e) => setForm({ ...form, constraints: { ...form.constraints, canStream: e.target.checked } })} />
                Allow Streaming
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.constraints.canBatchDownload}
                       onChange={(e) => setForm({ ...form, constraints: { ...form.constraints, canBatchDownload: e.target.checked } })} />
                Allow Batch Download
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.constraints.canCache}
                       onChange={(e) => setForm({ ...form, constraints: { ...form.constraints, canCache: e.target.checked } })} />
                Allow Caching
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.constraints.canExport}
                       onChange={(e) => setForm({ ...form, constraints: { ...form.constraints, canExport: e.target.checked } })} />
                Allow Export
              </label>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pricePerHour" className="text-gray-800">Price per Hour *</Label>
              <Input id="pricePerHour" type="number" value={form.pricePerHour}
                     onChange={(e) => setForm({ ...form, pricePerHour: parseFloat(e.target.value) })}
                     className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500" />
            </div>
            <div>
              <Label htmlFor="scopeHours" className="text-gray-800">Scope (Hours) *</Label>
              <Input id="scopeHours" type="number" value={form.scopeHours}
                     onChange={(e) => setForm({ ...form, scopeHours: parseFloat(e.target.value) })}
                     className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500" />
            </div>
          </div>

          {/* Risk & Jurisdiction */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="riskClass" className="text-gray-800">Risk Class *</Label>
              <select id="riskClass" className="mt-1 w-full h-9 rounded-md border border-gray-300 bg-white text-gray-900 text-sm px-2"
                      value={form.riskClass}
                      onChange={(e) => setForm({ ...form, riskClass: e.target.value })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <Label htmlFor="jurisdiction" className="text-gray-800">Jurisdiction *</Label>
              <Input id="jurisdiction" value={form.jurisdiction}
                     onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
                     placeholder="e.g., US, EU, UK"
                     className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500" />
            </div>
          </div>

          {/* Use Cases */}
          <div>
            <Label className="text-gray-800">Use Cases (optional)</Label>
            <p className="text-sm text-gray-600 mb-2">Help buyers discover your offer</p>
            {(form.useCases || []).map((u: string, i: number) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input value={u} onChange={(e) => handleUseCaseChange(i, e.target.value)} placeholder="e.g., Healthcare, Customer Service"
                       className="bg-white text-gray-900 border border-gray-300 placeholder:text-gray-500" />
                {form.useCases.length > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="border-gray-300 text-gray-700 hover:bg-gray-100"
                    onClick={() => handleRemoveUseCase(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="border-gray-300 text-gray-900 hover:bg-gray-100"
              onClick={handleAddUseCase}
            >
              Add Use Case
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              className="border-gray-300 text-gray-900 hover:bg-gray-100 bg-gray-100"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button
              className="bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              {submitting ? 'Publishing...' : 'Publish Offer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NewOfferPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
        <NewOfferContent />
      </Suspense>
    </AppLayout>
  )
}
