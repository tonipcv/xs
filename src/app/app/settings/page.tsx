'use client'

import { useMemo, useState } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Shield, Key, PlugZap, Globe, Building2, Webhook, Trash2 } from 'lucide-react'

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
          <Card key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen({ id: p.id, title: p.title })}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-900 flex items-center gap-2">
                <PlugZap className="h-4 w-4 text-gray-500" /> {p.title}
              </CardTitle>
              <CardDescription className="text-xs">{p.hint}</CardDescription>
            </CardHeader>
          </Card>
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
                <Input className="w-full" placeholder="postgresql://user:pass@host:5432/db" />
              </div>
            )}
            {open.id === 'snowflake' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Account</label>
                  <Input className="w-full" placeholder="account.region" />
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-700">Username</label>
                    <Input className="w-full" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700">Password</label>
                    <Input type="password" className="w-full" />
                  </div>
                </div>
              </div>
            )}
            {open.id === 'bigquery' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Project ID</label>
                  <Input className="w-full" />
                </div>
                <div>
                  <label className="text-sm text-gray-700">Key File Path</label>
                  <Input className="w-full" placeholder="/path/to/key.json" />
                </div>
              </div>
            )}
            {open.id === 'gcs' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Project ID</label>
                  <Input className="w-full" />
                </div>
                <div>
                  <label className="text-sm text-gray-700">Key File Path</label>
                  <Input className="w-full" placeholder="/path/to/key.json" />
                </div>
              </div>
            )}
            {open.id === 'azure' && (
              <div className="space-y-3">
                <label className="text-sm text-gray-700">Connection String</label>
                <Input className="w-full" placeholder="DefaultEndpointsProtocol=https;..." />
              </div>
            )}
            {open.id === 'smtp' && (
              <div className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-700">Host</label>
                    <Input className="w-full" placeholder="smtp.example.com" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700">Port</label>
                    <Input className="w-full" placeholder="465" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-700">Username</label>
                    <Input className="w-full" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700">Password</label>
                    <Input type="password" className="w-full" />
                  </div>
                </div>
              </div>
            )}
            {open.id === 'stripe' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Secret Key</label>
                  <Input className="w-full" placeholder="sk_live_..." />
                </div>
                <div>
                  <label className="text-sm text-gray-700">Webhook Secret</label>
                  <Input className="w-full" placeholder="whsec_..." />
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={close} className="border-gray-300 text-gray-800 hover:bg-gray-50">Cancel</Button>
              <Button onClick={close} className="bg-gray-900 hover:bg-gray-800">Save</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'webhooks' | 'security'>('general')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const orgType = useMemo(() => 'SUPPLIER', [])

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

          <div className="flex flex-wrap gap-2">
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
              onClick={() => setActiveTab('security')}
              className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
                activeTab === 'security'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Security
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
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-900 flex items-center gap-2"><Building2 className="h-4 w-4 text-gray-500"/> Organization</CardTitle>
                  <CardDescription className="text-xs">Basic details used across billing and audit</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-700">Organization Name</label>
                    <Input className="mt-1" placeholder="Your organization" />
                    <p className="text-xs text-gray-500 mt-1">Shown on invoices and webhook metadata.</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700">Tenant ID</label>
                      <Input className="mt-1" disabled placeholder="tenant-id-here" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Organization Type</label>
                      <select className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-xl">
                        <option>SUPPLIER (Data Holder)</option>
                        <option>CLIENT (AI Lab)</option>
                        <option>PLATFORM_ADMIN</option>
                      </select>
                    </div>
                  </div>
                  <Button onClick={handleSave} disabled={saving} className="bg-gray-900 hover:bg-gray-800">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-gray-900 flex items-center gap-2"><PlugZap className="h-4 w-4 text-gray-500"/> Integrations Catalog</CardTitle>
                  <CardDescription className="text-xs">Select a provider to configure credentials</CardDescription>
                </CardHeader>
                <CardContent>
                  <IntegrationsCatalog />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-gray-900">Storage & Database</CardTitle>
                  <CardDescription className="text-xs">Quick inputs for infra secrets</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700">S3 Bucket ARN</label>
                    <Input className="mt-1" placeholder="arn:aws:s3:::your-bucket" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700">S3 Access Key ID</label>
                      <Input className="mt-1" placeholder="AKIA..." type="password" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Database Connection String</label>
                      <Input className="mt-1" placeholder="postgresql://user:pass@host:5432/db" type="password" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">⚠️ Secrets are encrypted at rest and never exposed in logs or UI.</p>
                  <Button onClick={handleSave} disabled={saving} className="bg-gray-900 hover:bg-gray-800">{saving ? 'Saving...' : 'Save Integrations'}</Button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-gray-900 flex items-center gap-2"><Key className="h-4 w-4 text-gray-500"/> API Keys</CardTitle>
                  <CardDescription className="text-xs">Rotate or revoke programmatic access</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-gray-800">Primary Key</div>
                      <div className="text-xs text-gray-600">••••••••••••••••••</div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="border-gray-300 text-gray-800 hover:bg-gray-50">Reveal</Button>
                      <Button className="bg-gray-900 hover:bg-gray-800">Rotate</Button>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-700">Environment</div>
                    <Badge variant="secondary" className="text-gray-800">Sandbox</Badge>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-gray-900 flex items-center gap-2"><Shield className="h-4 w-4 text-gray-500"/> Access Control</CardTitle>
                  <CardDescription className="text-xs">Organization members & roles</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-gray-700">Organization Type</div>
                  <div className="text-xs"><Badge variant="secondary" className="text-gray-800">{orgType}</Badge></div>
                  <p className="text-xs text-gray-600">Contact support to request role changes.</p>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'webhooks' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-gray-900 flex items-center gap-2"><Webhook className="h-4 w-4 text-gray-500"/> Webhook Endpoints</CardTitle>
                <CardDescription className="text-xs">POST requests with event payloads</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Policy Created</label>
                  <Input className="mt-1" placeholder="https://your-domain.com/webhooks/policy-created" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Consent Revoked</label>
                  <Input className="mt-1" placeholder="https://your-domain.com/webhooks/consent-revoked" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Lease Issued</label>
                  <Input className="mt-1" placeholder="https://your-domain.com/webhooks/lease-issued" />
                </div>
                <Button onClick={handleSave} disabled={saving} className="bg-gray-900 hover:bg-gray-800">{saving ? 'Saving...' : 'Save Webhooks'}</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
