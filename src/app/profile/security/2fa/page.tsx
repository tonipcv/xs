'use client'

import { useState } from 'react'
import QRCode from 'qrcode'
import { AppLayout } from '@/components/AppSidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

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
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1100px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-2xl font-semibold text-gray-900 tracking-tight`}>Two-Factor Authentication</h1>
            <p className="text-sm text-gray-600">Use an authenticator app to add an extra layer of security to your account.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="space-y-1 mb-4">
                  <h2 className={`${heading.className} text-sm font-semibold text-gray-900`}>Setup</h2>
                  <p className="text-xs text-gray-600">Use Google Authenticator, 1Password, Authy or similar.</p>
                </div>

                {!otpauthUrl ? (
                  <Button onClick={startSetup} disabled={loading} className="bg-gray-900 hover:bg-gray-800 text-white">
                    {loading ? 'Generating…' : 'Enable 2FA'}
                  </Button>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
                      {qrDataUrl && (
                        <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
                      )}
                      <p className="text-[11px] text-gray-500 break-all text-center">{otpauthUrl}</p>
                    </div>
                    <div className="space-y-3">
                      <Label className="text-gray-700">Authenticator code</Label>
                      <Input
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="000000"
                        className="bg-white border border-gray-300 text-gray-900 placeholder-gray-400"
                      />
                      <div className="flex gap-2">
                        <Button onClick={verify} disabled={loading || token.length === 0} className="bg-gray-900 hover:bg-gray-800 text-white">Verify & enable</Button>
                        <Button onClick={startSetup} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">Regenerate</Button>
                      </div>
                    </div>
                  </div>
                )}

                {status && <p className="text-green-600 text-sm mt-4">{status}</p>}
                {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className={`${heading.className} text-sm font-semibold text-gray-900 mb-2`}>Tips</h3>
                <ul className="text-xs text-gray-600 space-y-2 list-disc pl-4">
                  <li>Store your backup codes in a safe place.</li>
                  <li>If you change phones, disable and re-enable 2FA.</li>
                  <li>Use a reputable authenticator app.</li>
                </ul>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className={`${heading.className} text-sm font-semibold text-gray-900 mb-2`}>Back</h3>
                <Link href="/profile" className="inline-flex items-center px-3 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-md transition-colors">Return to profile</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
