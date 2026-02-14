"use client"

import { useState } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Playfair_Display } from 'next/font/google'
import { useRouter } from 'next/navigation'
import { Database, ArrowLeft, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function NewDatasetPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState('en-US')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Dataset name is required')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch('/api/v1/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          language,
          // Legacy fields for backward compatibility
          storageLocation: 'pending',
          region: 'global',
        }),
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create dataset')
      
      const dsId = data?.datasetId || data?.dataset?.datasetId || data?.id || data?.dataset?.id
      if (dsId) {
        router.push(`/xase/voice/datasets/${dsId}`)
      } else {
        router.push('/xase/voice/datasets')
      }
    } catch (e: any) {
      setError(e.message || 'Error creating dataset')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-white p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link href="/xase/voice/datasets" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-4">
              <ArrowLeft className="w-4 h-4" />
              Back to Datasets
            </Link>
            <h1 className={`${heading.className} text-2xl font-semibold text-gray-900 mb-1`}>
              Create New Dataset
            </h1>
            <p className="text-sm text-gray-600">
              Create an empty dataset container. You'll add data sources after creation.
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <form onSubmit={onSubmit} className="space-y-6">
              {/* Error Alert */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              )}

              {/* Dataset Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-gray-900">
                  Dataset Name *
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Healthcare Voice Training v2"
                  className="w-full text-gray-900 placeholder:text-gray-600 rounded-md border border-gray-300"
                  required
                />
                <p className="text-xs text-gray-500">
                  A descriptive name for your dataset
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium text-gray-900">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the purpose and contents of this dataset..."
                  className="w-full min-h-[100px] text-gray-900 placeholder:text-gray-600 rounded-md border border-gray-300"
                  rows={4}
                />
                <p className="text-xs text-gray-500">
                  Optional: Add context about this dataset's purpose and contents
                </p>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <Label htmlFor="language" className="text-sm font-medium text-gray-900">
                  Primary Language *
                </Label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full text-gray-900 rounded-md border border-gray-300 bg-white h-10 px-3"
                >
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="pt-BR">Portuguese (Brazil)</option>
                  <option value="pt-PT">Portuguese (Portugal)</option>
                  <option value="es-ES">Spanish (Spain)</option>
                  <option value="es-MX">Spanish (Mexico)</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                  <option value="it-IT">Italian</option>
                  <option value="ja-JP">Japanese</option>
                  <option value="ko-KR">Korean</option>
                  <option value="zh-CN">Chinese (Simplified)</option>
                  <option value="zh-TW">Chinese (Traditional)</option>
                </select>
                <p className="text-xs text-gray-500">
                  The predominant language of audio files in this dataset
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <Database className="w-4 h-4 text-gray-500 mt-0.5" />
                  <p className="text-sm text-gray-700">
                    This dataset will be created empty. You can add multiple data sources later (GCS, S3, Azure).
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="bg-gray-700 hover:bg-gray-800 text-white rounded-md"
                >
                  {loading ? 'Creating…' : 'Create Dataset'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/xase/voice/datasets')}
                  disabled={loading}
                  className="rounded-md"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
