"use client"

import { useState, useEffect } from 'react'
import { X, ArrowLeft, ArrowRight, Database, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface AddDataSourceModalProps {
  datasetId: string
  onClose: () => void
  onAdded: (source: any) => void
}

type Step = 'integration' | 'browse' | 'scan' | 'confirm'

export function AddDataSourceModal({ datasetId, onClose, onAdded }: AddDataSourceModalProps) {
  const [step, setStep] = useState<Step>('integration')
  const [integrations, setIntegrations] = useState<any[]>([])
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null)
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [scanResults, setScanResults] = useState<any>(null)
  const [sourceName, setSourceName] = useState('')
  const [sourceDescription, setSourceDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load integrations
  useEffect(() => {
    loadIntegrations()
  }, [])

  const loadIntegrations = async () => {
    try {
      const res = await fetch('/api/cloud-integrations')
      if (!res.ok) throw new Error('Failed to load integrations')
      const data = await res.json()
      const activeIntegrations = (data.integrations || []).filter((i: any) => i.status === 'ACTIVE')
      setIntegrations(activeIntegrations)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleSelectIntegration = (integration: any) => {
    setSelectedIntegration(integration)
    setStep('browse')
  }

  const handleSelectLocation = (location: string) => {
    setSelectedLocation(location)
    setStep('scan')
    performScan(location)
  }

  const performScan = async (location: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cloud-integrations/${selectedIntegration.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageLocation: location })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Scan failed')
      }
      
      const data = await res.json()
      setScanResults(data)
      
      // Auto-generate source name from location
      const pathParts = location.split('/').filter(Boolean)
      const suggestedName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || 'New Source'
      setSourceName(suggestedName)
      
      setStep('confirm')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!sourceName.trim()) {
      setError('Source name is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/v1/datasets/${datasetId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sourceName.trim(),
          description: sourceDescription.trim() || undefined,
          cloudIntegrationId: selectedIntegration.id,
          storageLocation: selectedLocation
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add source')
      }

      const data = await res.json()
      onAdded(data.dataSource)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Add Data Source</h2>
            <p className="text-sm text-gray-600 mt-1">
              {step === 'integration' && 'Select a cloud integration'}
              {step === 'browse' && 'Browse and select a folder or file'}
              {step === 'scan' && 'Scanning selected location...'}
              {step === 'confirm' && 'Review and confirm'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {['integration', 'browse', 'scan', 'confirm'].map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s ? 'bg-blue-600 text-white' :
                  ['integration', 'browse', 'scan', 'confirm'].indexOf(step) > i ? 'bg-green-600 text-white' :
                  'bg-gray-200 text-gray-600'
                }`}>
                  {['integration', 'browse', 'scan', 'confirm'].indexOf(step) > i ? '✓' : i + 1}
                </div>
                {i < 3 && (
                  <div className={`w-16 h-0.5 mx-2 ${
                    ['integration', 'browse', 'scan', 'confirm'].indexOf(step) > i ? 'bg-green-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-red-900">Error</h3>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Step 1: Select Integration */}
          {step === 'integration' && (
            <div className="space-y-4">
              <p className="text-gray-600">Choose which cloud integration to use for this data source:</p>
              {integrations.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <Database className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No active integrations found</p>
                  <p className="text-sm text-gray-500 mt-1">Set up a cloud integration first</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {integrations.map(integration => (
                    <button
                      key={integration.id}
                      onClick={() => handleSelectIntegration(integration)}
                      className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">
                          {integration.provider === 'GCS' && '☁️'}
                          {integration.provider === 'AWS_S3' && '📦'}
                          {integration.provider === 'AZURE_BLOB' && '🔷'}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                          <p className="text-sm text-gray-600">{integration.provider}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Browse */}
          {step === 'browse' && (
            <div className="space-y-4">
              <p className="text-gray-600">Enter the storage location (folder or file path):</p>
              <div className="space-y-2">
                <Label>Storage Location</Label>
                <Input
                  placeholder={
                    selectedIntegration?.provider === 'GCS' ? 'gs://bucket-name/path/' :
                    selectedIntegration?.provider === 'AWS_S3' ? 's3://bucket-name/path/' :
                    'https://account.blob.core.windows.net/container/path/'
                  }
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  Enter the full path to a folder or file in your cloud storage
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setStep('integration')} variant="outline">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={() => handleSelectLocation(selectedLocation)}
                  disabled={!selectedLocation.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Scanning */}
          {step === 'scan' && loading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Scanning location...</p>
              <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && scanResults && (
            <div className="space-y-6">
              {/* Scan Results */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-green-900 mb-2">Scan Complete</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-green-700 font-medium">Files Found</p>
                        <p className="text-green-900 text-lg font-semibold">{scanResults.numRecordings || 0}</p>
                      </div>
                      <div>
                        <p className="text-green-700 font-medium">Est. Duration</p>
                        <p className="text-green-900 text-lg font-semibold">
                          {Math.round(scanResults.estimatedDurationHours || 0)}h
                        </p>
                      </div>
                      <div>
                        <p className="text-green-700 font-medium">Total Size</p>
                        <p className="text-green-900 text-lg font-semibold">
                          {formatBytes(scanResults.totalSizeBytes || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Source Details */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Source Name *</Label>
                  <Input
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="e.g., Hospital A - Consultations"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Textarea
                    value={sourceDescription}
                    onChange={(e) => setSourceDescription(e.target.value)}
                    placeholder="Add notes about this data source..."
                    rows={3}
                  />
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600 mb-1">Location:</p>
                  <p className="text-sm font-mono text-gray-900 break-all">{selectedLocation}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={() => setStep('browse')} variant="outline" disabled={loading}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={loading || !sourceName.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding Source...
                    </>
                  ) : (
                    'Add Data Source'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
