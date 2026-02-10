"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle, Cloud, Database, Loader2, Save, Server, XCircle } from "lucide-react"

const connectorTypes = [
  { value: "postgres", label: "PostgreSQL", icon: Database },
  { value: "snowflake", label: "Snowflake", icon: Cloud },
  { value: "bigquery", label: "BigQuery", icon: Cloud },
  { value: "gcs", label: "Google Cloud Storage", icon: Cloud },
  { value: "s3", label: "AWS S3", icon: Cloud },
  { value: "azure-blob", label: "Azure Blob Storage", icon: Server },
]

export default function ConnectorsPage() {
  const router = useRouter()
  const [selectedType, setSelectedType] = useState("")
  const [name, setName] = useState("")
  const [connectionString, setConnectionString] = useState("")
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [sources, setSources] = useState<any[]>([])
  const [saved, setSaved] = useState<any[]>([])
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    fetch("/api/xase/connectors")
      .then((r) => r.json())
      .then((d) => setSaved(d.connectors || []))
      .catch(() => {})
  }, [])

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setSources([])
    setError("")
    try {
      const res = await fetch("/api/v1/ingestion/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: selectedType, connectionString, credentials }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Test failed")
      setTestResult({ success: true, sourcesFound: data.sourcesFound })
      setSources(data.sources || [])
    } catch (e: any) {
      setTestResult({ success: false, error: e.message })
      setError(e.message)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name required")
      return
    }
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      const res = await fetch("/api/xase/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: selectedType, connectionString, credentials }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Save failed")
      setSuccess("Saved successfully")
      const list = await fetch("/api/xase/connectors")
      const listData = await list.json()
      setSaved(listData.connectors || [])
      setName("")
      setConnectionString("")
      setCredentials({})
      setTestResult(null)
      setSources([])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-8 py-10 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold text-gray-900">Data Connectors</h1>
            <p className="mt-2 text-gray-700">Configure and test enterprise data connectors</p>
          </div>
          <button onClick={() => router.back()} className="px-5 py-2 border border-gray-400 text-gray-900 hover:bg-gray-100 rounded-full text-sm font-medium flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </header>

        {error && <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-red-900 text-sm font-medium">{error}</div>}
        {success && <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-green-900 text-sm font-medium">{success}</div>}

        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-4">
            <div className="bg-white border border-gray-400 rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Choose Connector</h2>
              <div className="space-y-2">
                {connectorTypes.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setSelectedType(t.value)
                      setTestResult(null)
                      setSources([])
                      setError("")
                      setSuccess("")
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 border rounded-full text-left text-sm font-medium transition ${
                      selectedType === t.value ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-900 border-gray-400 hover:bg-gray-100"
                    }`}
                  >
                    <t.icon className={`w-4 h-4 ${selectedType === t.value ? "text-white" : "text-gray-800"}`} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {saved.length > 0 && (
              <div className="bg-white border border-gray-400 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900">Saved ({saved.length})</h2>
                {saved.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-2 border border-gray-300 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-600">{c.type}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <main className="bg-white border border-gray-400 rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Configure</h2>
              <p className="text-sm text-gray-700 mt-1">{selectedType ? `Setup ${connectorTypes.find((c) => c.value === selectedType)?.label}` : "Select a connector"}</p>
            </div>

            {!selectedType && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                <Database className="w-12 h-12 mb-4 text-gray-400" />
                <p className="text-sm font-medium">Pick a connector to begin</p>
              </div>
            )}

            {selectedType && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900">Name</label>
                  <input type="text" placeholder="e.g. Production DB" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20" />
                </div>

                {["postgres", "azure-blob"].includes(selectedType) && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-900">Connection String</label>
                    <input type="text" placeholder={selectedType === "postgres" ? "postgresql://user:pass@host:5432/db" : "DefaultEndpointsProtocol=https;..."} value={connectionString} onChange={(e) => setConnectionString(e.target.value)} className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20" />
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button onClick={handleTest} disabled={testing || !selectedType} className="px-6 py-2.5 border border-gray-400 text-gray-900 hover:bg-gray-100 rounded-full text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                    {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing...</> : "Test Connection"}
                  </button>
                  <button onClick={handleSave} disabled={saving || !name.trim()} className="px-6 py-2.5 bg-gray-900 text-white hover:bg-gray-800 rounded-full text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save</>}
                  </button>
                </div>

                {testResult && (
                  <div className={`p-4 rounded-xl border-2 ${testResult.success ? "bg-green-50 border-green-400" : "bg-red-50 border-red-400"}`}>
                    <div className="flex items-center gap-2">
                      {testResult.success ? <><CheckCircle className="w-5 h-5 text-green-700" /><span className="font-semibold text-green-900">Success</span></> : <><XCircle className="w-5 h-5 text-red-700" /><span className="font-semibold text-red-900">Failed</span></>}
                    </div>
                    {testResult.error && <p className="text-sm text-red-900 mt-2">{testResult.error}</p>}
                    {testResult.sourcesFound !== undefined && <p className="text-sm text-green-900 mt-2">Found {testResult.sourcesFound} sources</p>}
                  </div>
                )}

                {sources.length > 0 && (
                  <div className="border border-gray-300 rounded-xl overflow-hidden">
                    <div className="bg-gray-100 px-4 py-3 border-b border-gray-300 text-sm font-semibold text-gray-900">Available Sources ({sources.length})</div>
                    <ul className="divide-y divide-gray-200">
                      {sources.map((s: any, i: number) => (
                        <li key={i} className="px-4 py-3 flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                            <p className="text-xs text-gray-600">{s.location}</p>
                          </div>
                          <span className="px-3 py-1 bg-gray-200 text-gray-900 rounded-full text-xs font-semibold">{s.type}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
