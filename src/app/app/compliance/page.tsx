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

type ComplianceModule = 'gdpr' | 'fca' | 'bafin'
type ComplianceAction = 'dsar' | 'erasure' | 'portability' | 'model-risk' | 'consumer-duty' | 'marisk' | 'ai-risk'

export default function ComplianceConsolePage() {
  const [module, setModule] = useState<ComplianceModule>('gdpr')
  const [action, setAction] = useState<ComplianceAction>('dsar')
  const [userId, setUserId] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [modelId, setModelId] = useState('')
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
    return true
  }, [module, action, userId, datasetId, modelId])

  const resetForm = () => {
    setUserId(''); setDatasetId(''); setModelId(''); setResult(null); setError('')
  }

  const executeAction = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      let endpoint = ''
      let payload: any = {}

      if (module === 'gdpr') {
        if (action === 'dsar') {
          endpoint = '/api/v1/compliance/gdpr/dsar'
          payload = { userId, requestType: 'full' }
        } else if (action === 'erasure') {
          endpoint = '/api/v1/compliance/gdpr/erasure'
          payload = { userId, reason: 'User requested via UI' }
        } else if (action === 'portability') {
          endpoint = '/api/v1/compliance/gdpr/portability'
          payload = { userId, format: 'json' }
        }
      } else if (module === 'fca') {
        if (action === 'model-risk') {
          endpoint = '/api/v1/compliance/fca/model-risk'
          payload = { modelId, modelType: 'classification', useCases: ['underwriting'] }
        } else if (action === 'consumer-duty') {
          endpoint = '/api/v1/compliance/fca/consumer-duty'
          payload = { datasetId, productType: 'insurance' }
        }
      } else if (module === 'bafin') {
        if (action === 'marisk') {
          endpoint = '/api/v1/compliance/bafin/marisk'
          payload = { datasetId, riskCategory: 'operational' }
        } else if (action === 'ai-risk') {
          endpoint = '/api/v1/compliance/bafin/ai-risk'
          payload = { modelId, aiSystemType: 'decision-support' }
        }
      }

      if (!endpoint) throw new Error('Invalid action')

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
            ] as {key: ComplianceModule, label: string}[]).map((m) => (
              <button
                key={m.key}
                onClick={() => { setModule(m.key); resetForm(); setAction(m.key === 'gdpr' ? 'dsar' : m.key === 'fca' ? 'model-risk' : 'marisk') }}
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
                  • <a href="https://www.bafin.de/" target="_blank" rel="noreferrer" className="underline hover:text-gray-800">BaFin</a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
