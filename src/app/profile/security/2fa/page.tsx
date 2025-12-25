'use client'

import { useState } from 'react'
import QRCode from 'qrcode'
import { AppLayout } from '@/components/AppSidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

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
    <AppLayout>
      <div className="min-h-screen bg-[#1c1d20]">
        <div className="max-w-[900px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Two-factor Authentication</h1>
            <p className="text-sm text-white/60">Set up an authenticator app to protect your account.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
                <div className="space-y-1 mb-4">
                  <h2 className="text-sm font-semibold text-white/80">Setup</h2>
                  <p className="text-xs text-white/50">Use Google Authenticator, 1Password, Authy or similar</p>
                </div>

                {!otpauthUrl ? (
                  <Button onClick={startSetup} disabled={loading} className="bg-white/[0.12] hover:bg-white/[0.18] text-white">
                    {loading ? 'Generating…' : 'Enable 2FA'}
                  </Button>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                      {qrDataUrl && (
                        <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
                      )}
                      <p className="text-[11px] text-white/40 break-all text-center">{otpauthUrl}</p>
                    </div>
                    <div className="space-y-3">
                      <Label className="text-white/70">Authenticator code</Label>
                      <Input
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="000000"
                        className="bg-[#2a2b2d] border-none text-white placeholder-white/40"
                      />
                      <div className="flex gap-2">
                        <Button onClick={verify} disabled={loading || token.length === 0} className="bg-green-600 hover:bg-green-500 text-white">Verify & enable</Button>
                        <Button onClick={startSetup} variant="outline" className="border-white/15 text-white/80 hover:bg-white/[0.06]">Regenerate</Button>
                      </div>
                    </div>
                  </div>
                )}

                {status && <p className="text-green-400 text-sm mt-4">{status}</p>}
                {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
                <h3 className="text-sm font-semibold text-white/80 mb-2">Tips</h3>
                <ul className="text-xs text-white/60 space-y-2 list-disc pl-4">
                  <li>Store your backup codes in a safe place.</li>
                  <li>If you change phones, disable and re-enable 2FA.</li>
                  <li>Use a reputable authenticator app.</li>
                </ul>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
                <h3 className="text-sm font-semibold text-white/80 mb-2">Back</h3>
                <Link href="/profile" className="inline-flex items-center px-3 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm font-medium rounded-md transition-colors">Return to profile</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
