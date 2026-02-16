'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { PricingTemplates, getTemplateById, type PricingTemplate } from './PricingTemplates'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'

interface AccessPlanData {
  // Step 1: Basic Info
  name: string
  description: string
  datasetId: string
  purpose: string[]
  
  // Step 2: Pricing
  pricingTemplate: string
  pricePerHour: number
  scopeHours: number
  maxConcurrentLeases: number
  
  // Step 3: Constraints
  ttlSeconds: number
  autoRenew: boolean
  maxRenewals: number
  budgetLimit?: number
  allowedEnvironments: string[]
  requiresConsent: boolean
}

interface AccessPlanWizardProps {
  datasets: Array<{ id: string; name: string }>
  onSubmit: (data: AccessPlanData) => Promise<void>
  onCancel: () => void
}

const STEPS = ['Basic Info', 'Pricing', 'Constraints']
const PURPOSES = ['TRAINING', 'ANALYTICS', 'RESEARCH', 'TESTING', 'PRODUCTION', 'INFERENCE']
const ENVIRONMENTS = ['development', 'staging', 'production']

export function AccessPlanWizard({ datasets, onSubmit, onCancel }: AccessPlanWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<AccessPlanData>({
    name: '',
    description: '',
    datasetId: '',
    purpose: ['TRAINING'],
    pricingTemplate: 'pro',
    pricePerHour: 15,
    scopeHours: 1000,
    maxConcurrentLeases: 5,
    ttlSeconds: 86400, // 24h
    autoRenew: true,
    maxRenewals: 2,
    allowedEnvironments: ['production'],
    requiresConsent: true,
  })

  const updateField = (field: keyof AccessPlanData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleTemplateSelect = (template: PricingTemplate) => {
    updateField('pricingTemplate', template.id)
    updateField('pricePerHour', template.pricePerHour)
    updateField('scopeHours', template.scopeHours)
    updateField('maxConcurrentLeases', template.maxConcurrentLeases)
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await onSubmit(formData)
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.name && formData.datasetId && formData.purpose.length > 0
      case 1:
        return formData.pricePerHour > 0
      case 2:
        return formData.ttlSeconds > 0
      default:
        return true
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((step, idx) => (
            <div key={step} className="flex items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                idx < currentStep ? 'bg-primary border-primary text-primary-foreground' :
                idx === currentStep ? 'border-primary text-primary' :
                'border-muted text-muted-foreground'
              }`}>
                {idx < currentStep ? <Check className="h-5 w-5" /> : idx + 1}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`w-24 h-0.5 mx-2 ${
                  idx < currentStep ? 'bg-primary' : 'bg-muted'
                }`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-sm">
          {STEPS.map((step, idx) => (
            <div key={step} className={`${
              idx === currentStep ? 'font-semibold text-primary' : 'text-muted-foreground'
            }`}>
              {step}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep]}</CardTitle>
          <CardDescription>
            {currentStep === 0 && 'Define the basic information for your access plan'}
            {currentStep === 1 && 'Choose a pricing template or customize your own'}
            {currentStep === 2 && 'Set constraints and access rules'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1: Basic Info */}
          {currentStep === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Plan Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Premium Voice Access"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what this plan offers..."
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataset">Dataset *</Label>
                <Select value={formData.datasetId} onValueChange={(v) => updateField('datasetId', v)}>
                  <SelectTrigger id="dataset">
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map(ds => (
                      <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Allowed Purposes *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PURPOSES.map(purpose => (
                    <label key={purpose} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.purpose.includes(purpose)}
                        onChange={(e) => {
                          const newPurposes = e.target.checked
                            ? [...formData.purpose, purpose]
                            : formData.purpose.filter(p => p !== purpose)
                          updateField('purpose', newPurposes)
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{purpose}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Step 2: Pricing */}
          {currentStep === 1 && (
            <>
              <PricingTemplates
                onSelect={handleTemplateSelect}
                selectedId={formData.pricingTemplate}
              />

              <div className="border-t pt-6 space-y-4">
                <h4 className="font-semibold">Custom Pricing (Optional)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pricePerHour">Price per Hour ($)</Label>
                    <Input
                      id="pricePerHour"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.pricePerHour}
                      onChange={(e) => updateField('pricePerHour', Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scopeHours">Scope Hours</Label>
                    <Input
                      id="scopeHours"
                      type="number"
                      min="0"
                      value={formData.scopeHours}
                      onChange={(e) => updateField('scopeHours', Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxLeases">Max Concurrent Leases</Label>
                    <Input
                      id="maxLeases"
                      type="number"
                      min="1"
                      value={formData.maxConcurrentLeases}
                      onChange={(e) => updateField('maxConcurrentLeases', Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Constraints */}
          {currentStep === 2 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ttl">Default TTL (hours)</Label>
                  <Input
                    id="ttl"
                    type="number"
                    min="1"
                    max="72"
                    value={formData.ttlSeconds / 3600}
                    onChange={(e) => updateField('ttlSeconds', Number(e.target.value) * 3600)}
                  />
                  <p className="text-xs text-muted-foreground">Maximum: 72 hours</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="budgetLimit">Budget Limit ($)</Label>
                  <Input
                    id="budgetLimit"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Optional"
                    value={formData.budgetLimit || ''}
                    onChange={(e) => updateField('budgetLimit', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoRenew">Auto-Renew</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically renew leases 30min before expiry
                  </p>
                </div>
                <Switch
                  id="autoRenew"
                  checked={formData.autoRenew}
                  onCheckedChange={(checked) => updateField('autoRenew', checked)}
                />
              </div>

              {formData.autoRenew && (
                <div className="space-y-2">
                  <Label htmlFor="maxRenewals">Max Renewals</Label>
                  <Input
                    id="maxRenewals"
                    type="number"
                    min="0"
                    max="10"
                    value={formData.maxRenewals}
                    onChange={(e) => updateField('maxRenewals', Number(e.target.value))}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Allowed Environments</Label>
                <div className="flex gap-4">
                  {ENVIRONMENTS.map(env => (
                    <label key={env} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allowedEnvironments.includes(env)}
                        onChange={(e) => {
                          const newEnvs = e.target.checked
                            ? [...formData.allowedEnvironments, env]
                            : formData.allowedEnvironments.filter(e => e !== env)
                          updateField('allowedEnvironments', newEnvs)
                        }}
                        className="rounded"
                      />
                      <span className="text-sm capitalize">{env}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="consent">Requires Consent</Label>
                  <p className="text-sm text-muted-foreground">
                    Enforce consent verification before access
                  </p>
                </div>
                <Switch
                  id="consent"
                  checked={formData.requiresConsent}
                  onCheckedChange={(checked) => updateField('requiresConsent', checked)}
                />
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={currentStep === 0 ? onCancel : handleBack}
            disabled={loading}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </Button>

          {currentStep < STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canProceed() || loading}>
              {loading ? 'Creating...' : 'Create Access Plan'}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
