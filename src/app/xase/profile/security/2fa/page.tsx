'use client'

import { useState } from 'react'
import QRCode from 'qrcode'

export default function TwoFactorSetupPage() {
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const startSetup = async () => {
    setLoading(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao iniciar 2FA')
      setOtpauthUrl(data.otpauthUrl)
      const qr = await QRCode.toDataURL(data.otpauthUrl)
      setQrDataUrl(qr)
    } catch (e: any) {
      setError(e.message || 'Erro ao iniciar 2FA')
    } finally {
      setLoading(false)
    }
  }

  const verify = async () => {
    setLoading(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao verificar 2FA')
      setStatus('2FA habilitado com sucesso!')
    } catch (e: any) {
      setError(e.message || 'Erro ao verificar 2FA')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#121316] text-white p-6">
      <div className="max-w-lg mx-auto bg-[#15161a] rounded-xl border border-zinc-800 p-6 space-y-6">
        <h1 className="text-xl font-semibold">Segurança da conta</h1>
        <h2 className="text-lg">Autenticação em duas etapas (TOTP)</h2>

        {!otpauthUrl ? (
          <button
            onClick={startSetup}
            disabled={loading}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50"
          >
            {loading ? 'Gerando…' : 'Habilitar 2FA'}
          </button>
        ) : (
          <div className="space-y-4">
            {qrDataUrl && (
              <div className="flex flex-col items-center gap-2">
                <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
                <p className="text-xs text-zinc-400 break-all">{otpauthUrl}</p>
              </div>
            )}
            <div>
              <label className="block text-sm mb-1">Código do autenticador</label>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="000000"
                className="w-full px-3 py-2 bg-[#121316] border border-zinc-800 rounded outline-none"
              />
            </div>
            <button
              onClick={verify}
              disabled={loading || token.length === 0}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded disabled:opacity-50"
            >
              {loading ? 'Verificando…' : 'Verificar e habilitar'}
            </button>
          </div>
        )}

        {status && <p className="text-green-400 text-sm">{status}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  )
}
