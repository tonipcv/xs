'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/AppSidebar'
import { Folder, File, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react'
import { Playfair_Display } from 'next/font/google'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

interface Asset {
  name: string
  path: string
  fullPath: string
  type: 'folder' | 'file'
  size?: number
  lastModified?: string
}

function DatasetBrowserContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const integrationId = searchParams?.get('integrationId') || null
  const initialDatasetId = searchParams?.get('datasetId') || ''
  
  const [integration, setIntegration] = useState<any>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState('')
  const [manualPath, setManualPath] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [actionMode, setActionMode] = useState<'create' | 'append'>('create')
  const [existingDatasetId, setExistingDatasetId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [appendError, setAppendError] = useState<string | null>(null)
  const [datasets, setDatasets] = useState<Array<{ datasetId: string; name: string }>>([])

  useEffect(() => {
    if (!integrationId) {
      setError('No integration selected')
      setLoading(false)
      return
    }

    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        const integrationRes = await fetch(`/api/cloud-integrations/${integrationId}`)
        if (!integrationRes.ok) throw new Error('Failed to load integration')
        const integrationData = await integrationRes.json()
        setIntegration(integrationData)

        const projectIdParam = integrationData?.projectId ? `&projectId=${encodeURIComponent(integrationData.projectId)}` : ''
        const assetsRes = await fetch(
          `/api/cloud-integrations/${integrationId}/browse?path=${encodeURIComponent(currentPath)}${projectIdParam}`
        )
        if (!assetsRes.ok) throw new Error('Failed to load assets')
        const assetsData = await assetsRes.json()
        // Keep full list (folders + files). We'll render folders as selectable
        // and files as read-only preview to avoid confusion when root has files only.
        setAssets(assetsData.assets || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [integrationId, currentPath])

  // If arriving from a dataset detail page, default to append mode and prefill datasetId
  useEffect(() => {
    if (initialDatasetId) {
      setExistingDatasetId(initialDatasetId)
      setActionMode('append')
    }
  }, [initialDatasetId])

  // Load existing datasets for dropdown (up to 100)
  useEffect(() => {
    let active = true
    async function loadDatasets() {
      try {
        const r = await fetch('/api/v1/datasets?limit=100')
        const d = await r.json().catch(() => ({}))
        if (active && r.ok && Array.isArray(d.datasets)) {
          setDatasets(d.datasets.map((x: any) => ({ datasetId: x.datasetId, name: x.name || x.datasetId })))
        }
      } catch {}
    }
    loadDatasets()
    return () => { active = false }
  }, [])

  function handleNavigateIntoFolder(folderPath: string) {
    setCurrentPath(folderPath)
    setSelectedFolder(null)
  }

  function handleSelectFolder(folderPath: string) {
    setSelectedFolder(folderPath)
  }

  function getFullPathForCurrentFolder(): string | null {
    if (!integration) return null
    if (!currentPath) return null
    const ensureTrailingSlash = (s: string) => (s.endsWith('/') ? s : s + '/')
    switch (integration.provider) {
      case 'AWS_S3':
        return `s3://${ensureTrailingSlash(currentPath)}`
      case 'GCS':
        return `gs://${ensureTrailingSlash(currentPath)}`
      case 'AZURE_BLOB':
        // currentPath: container[/prefix]
        if (!integration.accountName) return null
        return `https://${integration.accountName}.blob.core.windows.net/${ensureTrailingSlash(currentPath)}`
      default:
        return null
    }
  }

  function navigateToForm(storageLocation: string) {
    const params = new URLSearchParams({
      integrationId: integrationId!,
      storageLocation: storageLocation,
    })
    router.push(`/app/datasets/new?${params.toString()}`)
  }

  function handleManualPathSubmit() {
    if (manualPath.trim()) {
      navigateToForm(manualPath.trim())
    }
  }

  async function addSourceToExistingDataset() {
    if (!integrationId || !selectedFolder || !existingDatasetId.trim()) return
    try {
      setSubmitting(true)
      setAppendError(null)
      const resp = await fetch(`/api/v1/datasets/${encodeURIComponent(existingDatasetId.trim())}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedFolder.split('/').filter(Boolean).slice(-1)[0] || 'Imported Source',
          cloudIntegrationId: integrationId,
          storageLocation: selectedFolder,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || 'Failed to add data source')
      router.push(`/app/datasets/${encodeURIComponent(existingDatasetId.trim())}`)
    } catch (e: any) {
      setAppendError(e?.message || 'Failed to add data source')
    } finally {
      setSubmitting(false)
    }
  }

  const pathSegments = currentPath.split('/').filter(Boolean)

  if (!integrationId) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600">No integration selected</p>
            <Link href="/app/datasets" className="text-blue-600 hover:underline mt-2 inline-block">
              Go back to datasets
            </Link>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-[1000px] mx-auto px-8 py-8 space-y-6 text-gray-900">
          {/* Header */}
          <div className="space-y-2">
            <Link 
              href="/app/datasets"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Datasets
            </Link>
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>
              Browse Datasets
            </h1>
            {integration && (
              <p className="text-sm text-gray-600">
                Select a dataset from <span className="font-medium">{integration.name || integration.provider}</span>
              </p>
            )}
          </div>

          {/* Integration Info */}
          {integration && (
            <div className="border border-gray-200 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-900 truncate">{integration.name || integration.provider}</div>
                <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  {integration.status}
                </span>
              </div>
            </div>
          )}

          {/* Breadcrumb */}
          {currentPath && (
            <div className="flex items-center gap-2 text-sm">
              <button 
                onClick={() => setCurrentPath('')} 
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Root
              </button>
              {pathSegments.map((segment, i) => (
                <span key={i} className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <button
                    onClick={() => setCurrentPath(pathSegments.slice(0, i + 1).join('/'))}
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {segment}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Asset List */}
          {!loading && !error && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {(() => {
                const folders = assets.filter(a => a.type === 'folder')
                const files = assets.filter(a => a.type === 'file')
                if (folders.length === 0 && files.length === 0) {
                  return (
                    <div className="p-8 text-center text-gray-500">No items found in this location</div>
                  )
                }

                return (
                  <div className="divide-y divide-gray-200">
                    {/* Folders (selectable) */}
                    {folders.map((folder) => (
                      <div
                        key={folder.path}
                        className={`w-full flex items-center gap-3 p-4 transition-colors cursor-pointer ${
                          selectedFolder === folder.fullPath
                            ? 'bg-blue-50 border-l-4 border-blue-600'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleSelectFolder(folder.fullPath)}
                        onDoubleClick={() => handleNavigateIntoFolder(folder.path)}
                      >
                        <Folder className={`w-5 h-5 flex-shrink-0 ${
                          selectedFolder === folder.fullPath ? 'text-blue-600' : 'text-gray-600'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium truncate ${
                            selectedFolder === folder.fullPath ? 'text-blue-900' : 'text-gray-900'
                          }`}>
                            {folder.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Double-click to open • Click to select as dataset
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      </div>
                    ))}

                    {/* Files (selectable when present) */}
                    {files.length > 0 && (
                      <div className="bg-blue-50 p-4">
                        <div className="text-xs text-blue-900 mb-2">Files in this location (click to select)</div>
                        <div className="bg-white border border-blue-200 rounded-lg divide-y max-h-72 overflow-auto">
                          {files.slice(0, 200).map((file) => (
                            <div
                              key={file.path}
                              className={`flex items-center gap-3 p-3 cursor-pointer ${selectedFolder === file.fullPath ? 'bg-blue-50' : ''}`}
                              onClick={() => setSelectedFolder(file.fullPath)}
                            >
                              <File className="w-4 h-4 text-gray-600" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-900 truncate">{file.name}</div>
                                <div className="text-xs text-gray-600">
                                  {file.size ? `${formatBytes(file.size)}${file.lastModified ? ` • ${new Date(file.lastModified).toLocaleDateString()}` : ''}` : (file.lastModified ? new Date(file.lastModified).toLocaleDateString() : '')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {files.length > 200 && (
                          <div className="text-xs text-blue-900 mt-2">...and {files.length - 200} more</div>
                        )}
                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-xs text-gray-700">Select a folder or a single file to create a dataset.</div>
                          <Button
                            onClick={() => {
                              const full = getFullPathForCurrentFolder()
                              if (!selectedFolder && full) setSelectedFolder(full)
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Use current selection
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Manual Path Entry */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Or enter folder path manually</h3>
              <p className="text-xs text-gray-600">
                Enter the full path to your dataset folder (not individual file)
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder={
                  integration?.provider === 'AWS_S3' ? 's3://bucket/path/to/folder/' :
                  integration?.provider === 'GCS' ? 'gs://bucket/path/to/folder/' :
                  integration?.provider === 'AZURE_BLOB' ? 'https://account.blob.core.windows.net/container/folder/' :
                  'Enter folder location'
                }
                className="flex-1 bg-white border-gray-300 text-gray-900 placeholder:text-gray-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleManualPathSubmit()
                  }
                }}
              />
              <Button
                onClick={handleManualPathSubmit}
                disabled={!manualPath.trim()}
                className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-900"
              >
                Continue
              </Button>
            </div>
          </div>

          {/* Fixed Action Bar */}
          {selectedFolder && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 text-gray-900">
              <div className="max-w-[1000px] mx-auto px-8 py-4 flex flex-col gap-3 text-gray-900">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="text-xs text-gray-600 mb-1">Selected path:</div>
                    <div className="font-mono text-sm text-gray-900 truncate">{selectedFolder}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-900">
                    <label className="inline-flex items-center gap-1 text-gray-900">
                      <input
                        type="radio"
                        name="actionMode"
                        value="create"
                        checked={actionMode === 'create'}
                        onChange={() => setActionMode('create')}
                      />
                      <span>Create new dataset</span>
                    </label>
                    <label className="inline-flex items-center gap-1 text-gray-900">
                      <input
                        type="radio"
                        name="actionMode"
                        value="append"
                        checked={actionMode === 'append'}
                        onChange={() => setActionMode('append')}
                      />
                      <span>Add to existing</span>
                    </label>
                  </div>
                </div>
                {actionMode === 'append' && (
                  <div className="flex items-center gap-2">
                    <select
                      value={existingDatasetId}
                      onChange={(e) => setExistingDatasetId(e.target.value)}
                      className="flex-1 bg-white border border-gray-300 text-gray-900 h-10 px-3 rounded-md"
                    >
                      <option value="">Select an existing dataset…</option>
                      {datasets.map((d) => (
                        <option key={d.datasetId} value={d.datasetId}>{d.name} ({d.datasetId})</option>
                      ))}
                    </select>
                    <Input
                      type="text"
                      value={existingDatasetId}
                      onChange={(e) => setExistingDatasetId(e.target.value)}
                      placeholder="Enter existing datasetId (e.g., ds_...)"
                      className="flex-1 bg-white border-gray-300 text-gray-900 placeholder:text-gray-600"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && existingDatasetId.trim() && !submitting) {
                          addSourceToExistingDataset()
                        }
                      }}
                    />
                    <Button
                      onClick={addSourceToExistingDataset}
                      disabled={!existingDatasetId.trim() || submitting}
                      className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-900"
                    >
                      {submitting ? 'Adding…' : 'Add to Dataset'}
                    </Button>
                  </div>
                )}
                {appendError && (
                  <div className="text-xs text-red-600">{appendError}</div>
                )}
                {actionMode === 'create' && (
                  <div className="flex items-center justify-end">
                    <Button
                      onClick={() => navigateToForm(selectedFolder)}
                      className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 px-6"
                    >
                      Create Dataset from this Folder
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

export default function DatasetBrowserPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </AppLayout>
    }>
      <DatasetBrowserContent />
    </Suspense>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}
