'use client'

import { useMemo, useState } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Shield, FileText, RefreshCw } from 'lucide-react'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

type ComplianceModule = 'gdpr' | 'fca' | 'bafin' | 'hipaa' | 'lgpd'
type ComplianceAction =
  | 'dsar' | 'erasure' | 'portability'
  | 'model-risk' | 'consumer-duty'
  | 'marisk' | 'ai-risk'
  | 'safe-harbor'              // HIPAA Safe Harbor check
  | 'grant-consent' | 'revoke-consent' // LGPD health consent

export default function ComplianceConsolePage() {
  const [module, setModule] = useState<ComplianceModule>('gdpr')
  const [action, setAction] = useState<ComplianceAction>('dsar')
  const [userId, setUserId] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [modelId, setModelId] = useState('')
  const [hipaaPayload, setHipaaPayload] = useState('') // string or JSON
  const [lgpdVersion, setLgpdVersion] = useState('v1')
  const [lgpdProofUri, setLgpdProofUri] = useState('')
  const [lgpdProofHash, setLgpdProofHash] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const actionLabel = useMemo(() => ({
    dsar: 'DSAR (Subject Access Request)',
    erasure: 'Right to Erasure',
    portability: 'Data Portability',
    'model-risk': 'Model Risk Assessment',
    'consumer-duty': 'Consumer Duty Check',
    marisk: 'MaRisk Assessment',
    'ai-risk': 'AI Risk Classification',
    'safe-harbor': 'HIPAA Safe Harbor Check',
    'grant-consent': 'LGPD Health Consent (Grant)',
    'revoke-consent': 'LGPD Health Consent (Revoke)',
  } as const), [])

  const canExecute = useMemo(() => {
    if (module === 'gdpr') {
      if (action === 'dsar' || action === 'erasure' || action === 'portability') return !!userId.trim()
    }
    if (module === 'fca') {
      if (action === 'consumer-duty') return !!datasetId.trim()
      if (action === 'model-risk') return !!modelId.trim()
    }
    if (module === 'bafin') {
      if (action === 'marisk') return !!datasetId.trim()
      if (action === 'ai-risk') return !!modelId.trim()
    }
    if (module === 'hipaa') {
      if (action === 'safe-harbor') return !!hipaaPayload.trim()
    }
    if (module === 'lgpd') {
      if (action === 'grant-consent') return !!datasetId.trim() && !!lgpdVersion.trim()
      if (action === 'revoke-consent') return !!datasetId.trim()
    }
    return true
  }, [module, action, userId, datasetId, modelId, hipaaPayload, lgpdVersion])

  const resetForm = () => {
    setUserId(''); setDatasetId(''); setModelId(''); setHipaaPayload(''); setLgpdVersion('v1'); setLgpdProofUri(''); setLgpdProofHash(''); setResult(null); setError('')
  }

  const executeAction = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      let endpoint = ''
      let requestBody: any = {}

      if (module === 'gdpr') {
        if (action === 'dsar') {
          endpoint = '/api/v1/compliance/gdpr/dsar'
          requestBody = { userId, requestType: 'full' }
        } else if (action === 'erasure') {
          endpoint = '/api/v1/compliance/gdpr/erasure'
          requestBody = { userId, reason: 'User requested via UI' }
        } else if (action === 'portability') {
          endpoint = '/api/v1/compliance/gdpr/portability'
          requestBody = { userId, format: 'json' }
        }
      } else if (module === 'fca') {
        if (action === 'model-risk') {
          endpoint = '/api/v1/compliance/fca/model-risk'
          requestBody = { modelId, modelType: 'classification', useCases: ['underwriting'] }
        } else if (action === 'consumer-duty') {
          endpoint = '/api/v1/compliance/fca/consumer-duty'
          requestBody = { datasetId, productType: 'insurance' }
        }
      } else if (module === 'bafin') {
        if (action === 'marisk') {
          endpoint = '/api/v1/compliance/bafin/marisk'
          requestBody = { datasetId, riskCategory: 'operational' }
        } else if (action === 'ai-risk') {
          endpoint = '/api/v1/compliance/bafin/ai-risk'
          requestBody = { modelId, aiSystemType: 'decision-support' }
        }
      } else if (module === 'hipaa') {
        if (action === 'safe-harbor') {
          endpoint = '/api/v1/compliance/hipaa/safe-harbor'
          let parsed: any = hipaaPayload
          try { parsed = JSON.parse(hipaaPayload) } catch {}
          requestBody = { payload: parsed }
        }
      } else if (module === 'lgpd') {
        if (action === 'grant-consent') {
          endpoint = '/api/v1/compliance/lgpd/health-consent'
          requestBody = {
            datasetId,
            tenantId: 'self',
            legalBasis: 'EXPLICIT_CONSENT',
            purpose: 'health_data_governance',
            version: lgpdVersion,
            proofUri: lgpdProofUri || undefined,
            proofHash: lgpdProofHash || undefined,
          }
        } else if (action === 'revoke-consent') {
          endpoint = '/api/v1/compliance/lgpd/health-consent'
          requestBody = { datasetId, reason: 'Revoked via Compliance Console' }
        }
      }

      if (!endpoint) throw new Error('Invalid action')

      const method = module === 'lgpd' && action === 'revoke-consent' ? 'DELETE' : 'POST'
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setResult(data)
    } catch (e: any) {
      setError(e.message || 'Failed to execute action')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>Compliance</h1>
              <p className="text-sm text-gray-600">Run GDPR/FCA/BaFin operations with audit-ready responses.</p>
            </div>
            <Badge variant="secondary" className="text-gray-800">Audit Logged</Badge>
          </div>

          {/* Module Tabs */}
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'gdpr', label: 'GDPR' },
              { key: 'fca', label: 'FCA' },
              { key: 'bafin', label: 'BaFin' },
              { key: 'hipaa', label: 'HIPAA' },
              { key: 'lgpd', label: 'LGPD (Saúde)' },
            ] as {key: ComplianceModule, label: string}[]).map((m) => (
              <button
                key={m.key}
                onClick={() => {
                  setModule(m.key)
                  resetForm()
                  setAction(
                    m.key === 'gdpr' ? 'dsar'
                    : m.key === 'fca' ? 'model-risk'
                    : m.key === 'bafin' ? 'marisk'
                    : m.key === 'hipaa' ? 'safe-harbor'
                    : 'grant-consent'
                  )
                }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                  module === m.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {/* Actions list */}
            <Card className="bg-white border border-gray-200 rounded-xl md:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm text-gray-900">Actions</CardTitle>
                <CardDescription className="text-xs text-gray-600">Choose a procedure</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(module === 'gdpr') && (
                  <div className="grid gap-2">
                    {(['dsar','erasure','portability'] as ComplianceAction[]).map((a) => (
                      <Button key={a} variant={action === a ? 'default' : 'outline'} size="sm" className={action===a? 'bg-gray-900 hover:bg-gray-800' : 'border-gray-300 text-gray-800 hover:bg-gray-50'} onClick={()=>{ setAction(a); setResult(null); setError('') }}>
                        {actionLabel[a]}
                      </Button>
                    ))}
                  </div>
                )}
                {(module === 'fca') && (
                  <div className="grid gap-2">
                    {(['model-risk','consumer-duty'] as ComplianceAction[]).map((a) => (
                      <Button key={a} variant={action === a ? 'default' : 'outline'} size="sm" className={action===a? 'bg-gray-900 hover:bg-gray-800' : 'border-gray-300 text-gray-800 hover:bg-gray-50'} onClick={()=>{ setAction(a); setResult(null); setError('') }}>
                        {actionLabel[a]}
                      </Button>
                    ))}
                  </div>
                )}
                {(module === 'bafin') && (
                  <div className="grid gap-2">
                    {(['marisk','ai-risk'] as ComplianceAction[]).map((a) => (
                      <Button key={a} variant={action === a ? 'default' : 'outline'} size="sm" className={action===a? 'bg-gray-900 hover:bg-gray-800' : 'border-gray-300 text-gray-800 hover:bg-gray-50'} onClick={()=>{ setAction(a); setResult(null); setError('') }}>
                        {actionLabel[a]}
                      </Button>
                    ))}
                  </div>
                )}
                {(module === 'hipaa') && (
                  <div className="grid gap-2">
                    {(['safe-harbor'] as ComplianceAction[]).map((a) => (
                      <Button key={a} variant={action === a ? 'default' : 'outline'} size="sm" className={action===a? 'bg-gray-900 hover:bg-gray-800' : 'border-gray-300 text-gray-800 hover:bg-gray-50'} onClick={()=>{ setAction(a); setResult(null); setError('') }}>
                        {actionLabel[a]}
                      </Button>
                    ))}
                  </div>
                )}
                {(module === 'lgpd') && (
                  <div className="grid gap-2">
                    {(['grant-consent','revoke-consent'] as ComplianceAction[]).map((a) => (
                      <Button key={a} variant={action === a ? 'default' : 'outline'} size="sm" className={action===a? 'bg-gray-900 hover:bg-gray-800' : 'border-gray-300 text-gray-800 hover:bg-gray-50'} onClick={()=>{ setAction(a); setResult(null); setError('') }}>
                        {actionLabel[a]}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Form */}
            <Card className="bg-white border border-gray-200 rounded-xl md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm text-gray-900">{actionLabel[action]}</CardTitle>
                  <CardDescription className="text-xs text-gray-600">Fill in the required identifiers and submit</CardDescription>
                </div>
                <Button variant="outline" size="icon" className="border-gray-300" onClick={resetForm} aria-label="Reset">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {(action === 'dsar' || action === 'erasure' || action === 'portability') && (
                  <div>
                    <label className="text-xs font-medium text-gray-700">User ID</label>
                    <Input value={userId} onChange={(e)=>setUserId(e.target.value)} placeholder="e.g., user_123" className="mt-1" />
                  </div>
                )}
                {(action === 'consumer-duty' || action === 'marisk') && (
                  <div>
                    <label className="text-xs font-medium text-gray-700">Dataset ID</label>
                    <Input value={datasetId} onChange={(e)=>setDatasetId(e.target.value)} placeholder="e.g., ds_abc" className="mt-1" />
                  </div>
                )}
                {(action === 'model-risk' || action === 'ai-risk') && (
                  <div>
                    <label className="text-xs font-medium text-gray-700">Model ID</label>
                    <Input value={modelId} onChange={(e)=>setModelId(e.target.value)} placeholder="e.g., mdl_456" className="mt-1" />
                  </div>
                )}
                {(module === 'hipaa' && action === 'safe-harbor') && (
                  <div>
                    <label className="text-xs font-medium text-gray-700">Sample Clinical Text / JSON</label>
                    <Textarea value={hipaaPayload} onChange={(e)=>setHipaaPayload(e.target.value)} placeholder='{"note":"Patient John Doe with zip 94110"}' className="mt-1" rows={6} />
                  </div>
                )}
                {(module === 'lgpd') && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Dataset ID</label>
                      <Input value={datasetId} onChange={(e)=>setDatasetId(e.target.value)} placeholder="e.g., ds_abc" className="mt-1" />
                    </div>
                    {action === 'grant-consent' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs font-medium text-gray-700">Version</label>
                          <Input value={lgpdVersion} onChange={(e)=>setLgpdVersion(e.target.value)} placeholder="v1" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-700">Proof URI (optional)</label>
                          <Input value={lgpdProofUri} onChange={(e)=>setLgpdProofUri(e.target.value)} placeholder="https://..." className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-700">Proof Hash (optional)</label>
                          <Input value={lgpdProofHash} onChange={(e)=>setLgpdProofHash(e.target.value)} placeholder="sha256:..." className="mt-1" />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={executeAction} disabled={!canExecute || loading} className="bg-gray-900 hover:bg-gray-800">
                    <Shield className="h-4 w-4 mr-2" />
                    {loading ? 'Executing…' : 'Execute'}
                  </Button>
                  <Button variant="outline" onClick={resetForm} className="border-gray-300 text-gray-800 hover:bg-gray-50">Clear</Button>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
                )}

                {result && (
                  <div className="space-y-3">
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900">Result</div>
                      <Badge variant="secondary" className="text-gray-800">OK</Badge>
                    </div>
                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto max-h-96">{JSON.stringify(result, null, 2)}</pre>
                  </div>
                )}

                {/* Helpful links */}
                <div className="pt-2 text-xs text-gray-600">
                  <span className="font-medium">References:</span>{' '}
                  <a href="https://gdpr.eu/" target="_blank" rel="noreferrer" className="underline hover:text-gray-800">GDPR</a>{' '}
                  • <a href="https://www.fca.org.uk/" target="_blank" rel="noreferrer" className="underline hover:text-gray-800">FCA</a>{' '}
                  • <a href="https://www.bafin.de/" target="_blank" rel="noreferrer" className="underline hover:text-gray-800">BaFin</a>{' '}
                  • <a href="https://www.hhs.gov/hipaa/" target="_blank" rel="noreferrer" className="underline hover:text-gray-800">HIPAA</a>{' '}
                  • <a href="https://www.gov.br/anpd/pt-br" target="_blank" rel="noreferrer" className="underline hover:text-gray-800">LGPD</a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
