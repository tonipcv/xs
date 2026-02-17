'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function NewPolicyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [datasets, setDatasets] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [tenantSearch, setTenantSearch] = useState('')

  const [formData, setFormData] = useState({
    datasetId: '',
    clientTenantId: '',
    usagePurpose: '',
    otherUsagePurpose: '',
    maxHours: '',
    maxDownloads: '',
    pricePerHour: '',
    currency: 'USD',
    expiresAt: '',
    canStream: true,
    maxConcurrentLeases: '',
    allowedEnvironment: '',
  })

  useEffect(() => {
    // Carregar datasets do supplier
    fetch('/api/v1/datasets')
      .then(res => res.json())
      .then(data => {
        if (data.datasets) setDatasets(data.datasets)
      })
      .catch(console.error)

    // Carregar AI Labs (TODOS os tenants cadastrados na plataforma)
    fetch('/api/v1/tenants?limit=1000')
      .then(async (res) => {
        const data = await res.json().catch(() => ({} as any))
        if (res.ok && Array.isArray(data.tenants) && data.tenants.length > 0) {
          setTenants(data.tenants)
        } else {
          // Fallback redundante
          return fetch('/api/v1/tenants?limit=1000')
            .then(r => r.json())
            .then(d => { if (Array.isArray(d.tenants)) setTenants(d.tenants) })
        }
      })
      .catch(console.error)
  }, [])

  // Busca server-side por AI Labs (todos os tenants) com debounce
  useEffect(() => {
    const q = tenantSearch.trim()
    const ctrl = new AbortController()
    const tid = setTimeout(() => {
      const url = q
        ? `/api/v1/tenants?limit=1000&q=${encodeURIComponent(q)}`
        : `/api/v1/tenants?limit=1000`
      fetch(url, { signal: ctrl.signal })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data.tenants)) setTenants(data.tenants)
        })
        .catch(() => {})
    }, 300)
    return () => { ctrl.abort(); clearTimeout(tid) }
  }, [tenantSearch])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const payload = {
        datasetId: formData.datasetId,
        clientTenantId: formData.clientTenantId,
        usagePurpose: formData.usagePurpose === 'OTHER' ? (formData.otherUsagePurpose || '').trim() : formData.usagePurpose,
        maxHours: formData.maxHours ? parseFloat(formData.maxHours) : undefined,
        maxDownloads: formData.maxDownloads ? parseInt(formData.maxDownloads) : undefined,
        pricePerHour: parseFloat(formData.pricePerHour),
        currency: formData.currency,
        expiresAt: formData.expiresAt || undefined,
        canStream: formData.canStream,
        maxConcurrentLeases: formData.maxConcurrentLeases ? parseInt(formData.maxConcurrentLeases) : undefined,
        allowedEnvironment: formData.allowedEnvironment || undefined,
      }

      const res = await fetch('/api/v1/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create policy')
      }

      router.push('/app/policies')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-white">
        <div className="max-w-[800px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-2xl font-semibold text-gray-900 tracking-tight`}>
              Create Access Policy
            </h1>
            <p className="text-sm text-gray-600">
              Define access rules and pricing for a dataset
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
              {/* Dataset */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  Dataset <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={formData.datasetId}
                  onChange={(e) => setFormData({ ...formData, datasetId: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-gray-400"
                >
                  <option value="">Select a dataset</option>
                  {datasets.map((ds) => (
                    <option key={ds.datasetId} value={ds.datasetId}>
                      {ds.name} ({ds.totalDurationHours}h)
                    </option>
                  ))}
                </select>
              </div>

              {/* Client Tenant (AI Lab) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  AI Lab (Client Organization) <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <a
                    href="/app/settings"
                    className="ml-auto text-xs text-gray-600 hover:text-gray-900 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Add new client
                  </a>
                </div>
                {/* Search box for AI Labs */}
                <input
                  type="text"
                  placeholder="Search AI Labs by name or email"
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm placeholder:text-gray-500 focus:outline-none focus:border-gray-400"
                />
                <select
                  required
                  value={formData.clientTenantId}
                  onChange={(e) => setFormData({ ...formData, clientTenantId: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-gray-400"
                >
                  <option value="">Select a client</option>
                  {tenants
                    .filter((t) => {
                      if (!tenantSearch.trim()) return true
                      const q = tenantSearch.toLowerCase()
                      return (
                        (t.name && t.name.toLowerCase().includes(q)) ||
                        (t.email && t.email.toLowerCase().includes(q))
                      )
                    })
                    .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  Select the AI Lab that will have governed access to this dataset
                </p>
              </div>

              {/* Usage Purpose */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  Usage Purpose <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={formData.usagePurpose}
                  onChange={(e) => setFormData({ ...formData, usagePurpose: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-gray-400"
                >
                  <option value="">Select purpose</option>
                  <option value="AI_MODEL_TRAINING">AI Model Training</option>
                  <option value="VALIDATION_TESTING">Validation / Testing</option>
                  <option value="RESEARCH_NON_COMMERCIAL">Research (Non-Commercial)</option>
                  <option value="ANALYTICS_BI">Analytics / BI</option>
                  <option value="PROTOTYPING_POC">Prototyping / POC</option>
                  <option value="DEMONSTRATION">Demonstration</option>
                  <option value="BENCHMARKING">Benchmarking</option>
                  <option value="EVALUATION_ONLY">Evaluation-only (No Training)</option>
                  <option value="INCIDENT_RESPONSE">Incident Response / Forensics</option>
                  <option value="OTHER">Other</option>
                </select>
                {formData.usagePurpose === 'OTHER' && (
                  <input
                    type="text"
                    required
                    placeholder="Describe the purpose"
                    value={formData.otherUsagePurpose}
                    onChange={(e) => setFormData({ ...formData, otherUsagePurpose: e.target.value })}
                    className="w-full mt-2 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm placeholder:text-gray-500 focus:outline-none focus:border-gray-400"
                  />
                )}
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    Max Hours
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Unlimited"
                    value={formData.maxHours}
                    onChange={(e) => setFormData({ ...formData, maxHours: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm placeholder:text-gray-500 focus:outline-none focus:border-gray-400"
                  />
                  <p className="text-xs text-gray-500">Leave empty for unlimited</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    Max Downloads
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Unlimited"
                    value={formData.maxDownloads}
                    onChange={(e) => setFormData({ ...formData, maxDownloads: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm placeholder:text-gray-500 focus:outline-none focus:border-gray-400"
                  />
                  <p className="text-xs text-gray-500">Leave empty for unlimited</p>
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    Price per Hour <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={formData.pricePerHour}
                    onChange={(e) => setFormData({ ...formData, pricePerHour: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm placeholder:text-gray-500 focus:outline-none focus:border-gray-400"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    Currency
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-gray-400"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="BRL">BRL</option>
                  </select>
                </div>
              </div>

              {/* Expiration */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  Expires At
                </label>
                <input
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-gray-400"
                />
                <p className="text-xs text-gray-500">Leave empty for no expiration</p>
              </div>

              {/* Streaming Settings */}
              <div className="border-t border-gray-200 pt-5 space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Training Infrastructure Settings</h3>
                
                {/* Can Stream */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="canStream"
                    checked={formData.canStream}
                    onChange={(e) => setFormData({ ...formData, canStream: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 bg-white text-gray-900 focus:ring-gray-400"
                  />
                  <label htmlFor="canStream" className="text-sm text-gray-900">
                    Enable Streaming Access
                  </label>
                </div>
                <p className="text-xs text-gray-500 ml-7">
                  Allow AI labs to stream this dataset for training via time-limited leases
                </p>

                {/* Max Concurrent Leases */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    Max Concurrent Leases
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="Unlimited"
                    value={formData.maxConcurrentLeases}
                    onChange={(e) => setFormData({ ...formData, maxConcurrentLeases: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm placeholder:text-gray-500 focus:outline-none focus:border-gray-400"
                  />
                  <p className="text-xs text-gray-500">
                    Limit how many AI labs can stream simultaneously (leave empty for unlimited)
                  </p>
                </div>

                {/* Allowed Environment */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    Allowed Environment
                  </label>
                  <select
                    value={formData.allowedEnvironment}
                    onChange={(e) => setFormData({ ...formData, allowedEnvironment: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-gray-400"
                  >
                    <option value="">Any Environment</option>
                    <option value="training">Training Only</option>
                    <option value="validation">Validation Only</option>
                  </select>
                  <p className="text-xs text-gray-500">
                    Restrict usage to specific training phases
                  </p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-md text-sm transition-colors disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Policy'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  )
}
