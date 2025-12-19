'use client'

import { useState } from 'react'

export default function ApiKeyCreator() {
  const [name, setName] = useState('server-mvp')
  const [permissions, setPermissions] = useState<string[]>(['ingest','verify','export'])
  const [rateLimit, setRateLimit] = useState(1000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [meta, setMeta] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [reveal, setReveal] = useState(false)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setCreatedKey(null)

    try {
      const res = await fetch('/xase/api-keys/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, permissions: permissions.join(','), rateLimit }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create API key')
      }
      setCreatedKey(data.key)
      setMeta(data)
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
      <h2 className="text-base font-semibold text-white mb-4">Create API Key</h2>
      <form onSubmit={onCreate} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Name</label>
            <input
              className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.08] text-white text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="server-mvp"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-white/50 mb-2">Permissions</label>
            <div className="flex flex-wrap gap-2">
              {['ingest','verify','export'].map((p) => {
                const active = permissions.includes(p)
                return (
                  <label
                    key={p}
                    className={`cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-colors ${active ? 'bg-white/[0.10] border-white/[0.24] text-white' : 'bg-white/[0.03] border-white/[0.10] text-white/70 hover:bg-white/[0.06]'}`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={active}
                      onChange={() => {
                        setPermissions((prev) => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
                      }}
                    />
                    <span className="font-medium">{p}</span>
                  </label>
                )
              })}
            </div>
            <p className="text-[11px] text-white/40 mt-1">Selecione as permissões necessárias para esta chave.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Rate Limit (per hour)</label>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.08] text-white text-sm"
              value={rateLimit}
              onChange={(e) => setRateLimit(parseInt(e.target.value || '0', 10))}
              min={1}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.16] text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create API Key'}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </form>

      {createdKey && (
        <div className="mt-4 p-4 border border-emerald-400/20 bg-emerald-400/5 rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-emerald-200 font-semibold">API Key criada</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setReveal((v) => !v)}
                className="px-2 py-1 rounded text-[11px] bg-white/[0.06] hover:bg-white/[0.12] text-white/90"
              >
                {reveal ? 'Hide' : 'Reveal'}
              </button>
              <button
                onClick={async () => { await navigator.clipboard.writeText(createdKey); setCopied(true); setTimeout(()=>setCopied(false), 1500) }}
                className="px-2 py-1 rounded text-[11px] bg-white/[0.06] hover:bg-white/[0.12] text-white/90"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <pre className="mt-2 text-xs text-white font-mono whitespace-pre-wrap break-all">
            {reveal ? createdKey : createdKey.replace(/.(?=.{6})/g, '•')}
          </pre>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-white/70">
            <div>
              <div className="text-white/40 mb-0.5">Prefix</div>
              <div className="font-mono">{meta?.keyPrefix}…</div>
            </div>
            <div>
              <div className="text-white/40 mb-0.5">Permissions</div>
              <div>{meta?.permissions}</div>
            </div>
            <div>
              <div className="text-white/40 mb-0.5">Rate Limit</div>
              <div>{meta?.rateLimit}/hour</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
