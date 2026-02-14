'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

function IntegrationsCatalog() {
  const [open, setOpen] = useState<null | {
    id: string;
    title: string;
  }>(null)

  const providers = [
    { id: 'postgres', title: 'PostgreSQL', hint: 'Connection string' },
    { id: 'snowflake', title: 'Snowflake', hint: 'Account, user, password' },
    { id: 'bigquery', title: 'BigQuery', hint: 'Project & key file' },
    { id: 'gcs', title: 'Google Cloud Storage', hint: 'Project & key file' },
    { id: 'azure', title: 'Azure Blob Storage', hint: 'Connection string' },
    { id: 'smtp', title: 'SMTP (Email)', hint: 'Host, port, user, pass' },
    { id: 'stripe', title: 'Stripe', hint: 'Secret key & webhook secret' },
  ]

  const close = () => setOpen(null)

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        {providers.map(p => (
          <button
            key={p.id}
            onClick={() => setOpen({ id: p.id, title: p.title })}
            className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm"
          >
            <p className="text-sm font-medium text-gray-900">{p.title}</p>
            <p className="text-xs text-gray-500 mt-1">{p.hint}</p>
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={close} />
          <div className="relative bg-white w-full max-w-lg mx-4 rounded-2xl border border-gray-200 shadow-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Configure {open.title}</h3>
              <button onClick={close} className="px-3 py-1 text-gray-600 hover:text-gray-900 rounded-full">✕</button>
            </div>
            {open.id === 'postgres' && (
              <div className="space-y-3">
                <label className="text-sm text-gray-700">Connection String</label>
                <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="postgresql://user:pass@host:5432/db" />
              </div>
            )}
            {open.id === 'snowflake' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Account</label>
                  <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="account.region" />
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-700">Username</label>
                    <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700">Password</label>
                    <input type="password" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" />
                  </div>
                </div>
              </div>
            )}
            {open.id === 'bigquery' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Project ID</label>
                  <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" />
                </div>
                <div>
                  <label className="text-sm text-gray-700">Key File Path</label>
                  <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="/path/to/key.json" />
                </div>
              </div>
            )}
            {open.id === 'gcs' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Project ID</label>
                  <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" />
                </div>
                <div>
                  <label className="text-sm text-gray-700">Key File Path</label>
                  <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="/path/to/key.json" />
                </div>
              </div>
            )}
            {open.id === 'azure' && (
              <div className="space-y-3">
                <label className="text-sm text-gray-700">Connection String</label>
                <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="DefaultEndpointsProtocol=https;..." />
              </div>
            )}
            {open.id === 'smtp' && (
              <div className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-700">Host</label>
                    <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="smtp.example.com" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700">Port</label>
                    <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="465" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-700">Username</label>
                    <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700">Password</label>
                    <input type="password" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" />
                  </div>
                </div>
              </div>
            )}
            {open.id === 'stripe' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Secret Key</label>
                  <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="sk_live_..." />
                </div>
                <div>
                  <label className="text-sm text-gray-700">Webhook Secret</label>
                  <input className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="whsec_..." />
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={close} className="px-4 py-2 rounded-full border text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={close} className="px-5 py-2 bg-gray-900 text-white rounded-full text-sm hover:bg-gray-800">Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'webhooks'>('general')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      // Placeholder for save logic
      await new Promise(resolve => setTimeout(resolve, 1000))
      setSuccess('Settings saved successfully')
    } catch (e: any) {
      setError(e.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>Settings</h1>
            <p className="text-sm text-gray-600">Manage tenant settings, integrations, and webhooks</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('general')}
              className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
                activeTab === 'general'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
                activeTab === 'integrations'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Integrations
            </button>
            <button
              onClick={() => setActiveTab('webhooks')}
              className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
                activeTab === 'webhooks'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Webhooks
            </button>
          </div>

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">{success}</div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
          )}

          {activeTab === 'general' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-medium text-gray-800">General Settings</h2>
              <div>
                <label className="text-sm text-gray-700">Organization Name</label>
                <input className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="Your organization" />
                <p className="text-xs text-gray-500 mt-1">Shown on invoices and webhook metadata.</p>
              </div>
              <div>
                <label className="text-sm text-gray-700">Tenant ID</label>
                <input className="mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl" disabled placeholder="tenant-id-here" />
              </div>
              <div>
                <label className="text-sm text-gray-700">Organization Type</label>
                <select className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-xl">
                  <option>SUPPLIER (Data Holder)</option>
                  <option>CLIENT (AI Lab)</option>
                  <option>PLATFORM_ADMIN</option>
                </select>
              </div>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
              <h2 className="text-sm font-medium text-gray-800">Integrations Catalog</h2>
              <p className="text-xs text-gray-500">Select an integration below to configure provider-specific settings.</p>
              <IntegrationsCatalog />

              <div className="h-px bg-gray-100" />
              <h3 className="text-sm font-medium text-gray-800">Storage & Database (quick inputs)</h3>
              <div>
                <label className="text-sm text-gray-700">S3 Bucket ARN</label>
                <input className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="arn:aws:s3:::your-bucket" />
              </div>
              <div>
                <label className="text-sm text-gray-700">S3 Access Key ID</label>
                <input className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="AKIA..." type="password" />
              </div>
              <div>
                <label className="text-sm text-gray-700">Database Connection String</label>
                <input className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="postgresql://user:pass@host:5432/db" type="password" />
              </div>
              <p className="text-xs text-gray-500">⚠️ Secrets are encrypted at rest and never exposed in logs or UI.</p>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Integrations'}
              </button>
            </div>
          )}

          {activeTab === 'webhooks' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-medium text-gray-800">Webhook Endpoints</h2>
              <div>
                <label className="text-sm text-gray-700">Policy Created Webhook</label>
                <input className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="https://your-domain.com/webhooks/policy-created" />
              </div>
              <div>
                <label className="text-sm text-gray-700">Consent Revoked Webhook</label>
                <input className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="https://your-domain.com/webhooks/consent-revoked" />
              </div>
              <div>
                <label className="text-sm text-gray-700">Lease Issued Webhook</label>
                <input className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-xl" placeholder="https://your-domain.com/webhooks/lease-issued" />
              </div>
              <p className="text-xs text-gray-500">Webhooks will be called with POST requests containing event payloads.</p>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Webhooks'}
              </button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
