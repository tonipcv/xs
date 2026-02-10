'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

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
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>Compliance Console</h1>
            <p className="text-sm text-gray-600">Execute GDPR, FCA, and BaFin compliance operations</p>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <button
              onClick={() => { setModule('gdpr'); setAction('dsar') }}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                module === 'gdpr' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              GDPR
            </button>
            <button
              onClick={() => { setModule('fca'); setAction('model-risk') }}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                module === 'fca' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              FCA
            </button>
            <button
              onClick={() => { setModule('bafin'); setAction('marisk') }}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                module === 'bafin' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              BaFin
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-700">Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as ComplianceAction)}
                className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-md"
              >
                {module === 'gdpr' && (
                  <>
                    <option value="dsar">DSAR (Data Subject Access Request)</option>
                    <option value="erasure">Right to Erasure</option>
                    <option value="portability">Data Portability</option>
                  </>
                )}
                {module === 'fca' && (
                  <>
                    <option value="model-risk">Model Risk Assessment</option>
                    <option value="consumer-duty">Consumer Duty Check</option>
                  </>
                )}
                {module === 'bafin' && (
                  <>
                    <option value="marisk">MaRisk Assessment</option>
                    <option value="ai-risk">AI Risk Classification</option>
                  </>
                )}
              </select>
            </div>

            {(action === 'dsar' || action === 'erasure' || action === 'portability') && (
              <div>
                <label className="text-sm font-medium text-gray-700">User ID</label>
                <input
                  className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-md"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Enter user ID"
                />
              </div>
            )}

            {(action === 'consumer-duty' || action === 'marisk') && (
              <div>
                <label className="text-sm font-medium text-gray-700">Dataset ID</label>
                <input
                  className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-md"
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                  placeholder="Enter dataset ID"
                />
              </div>
            )}

            {(action === 'model-risk' || action === 'ai-risk') && (
              <div>
                <label className="text-sm font-medium text-gray-700">Model ID</label>
                <input
                  className="mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-md"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="Enter model ID"
                />
              </div>
            )}

            <button
              onClick={executeAction}
              disabled={loading}
              className="w-full px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? 'Executing...' : 'Execute'}
            </button>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
            )}

            {result && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Result:</p>
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto max-h-96">{JSON.stringify(result, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
