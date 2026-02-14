"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Playfair_Display } from 'next/font/google'
import { useRouter } from 'next/navigation'
import BrandLogo from '@/components/BrandLogo'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function AiLabRegisterPage() {
  const router = useRouter()
  const [company, setCompany] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!company || !name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.')
      setLoading(false)
      return
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email.')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/register/ai-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          organizationName: company,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      router.push('/login')
    } catch (e: any) {
      setError(e.message || 'Registration error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0f12] font-normal tracking-[-0.01em]">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <BrandLogo showText={false} />
            </div>
            <h1 className={`${heading.className} text-xl font-medium text-[#f5f5f7] tracking-tight`}>
              AI Lab Registration
            </h1>
            <p className="text-sm text-[#f5f5f7]/70 mt-1">
              Exclusive for AI companies to access client dashboards and policies.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
            <div>
              <Label className="text-white/70">Company</Label>
              <Input
                value={company}
                onChange={e=>setCompany(e.target.value)}
                className="mt-1 bg-transparent border border-white/[0.08] text-white placeholder-white/40"
                placeholder="Your AI company"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-white/70">Name</Label>
                <Input
                  value={name}
                  onChange={e=>setName(e.target.value)}
                  className="mt-1 bg-transparent border border-white/[0.08] text-white placeholder-white/40"
                  placeholder="Your name"
                  required
                />
              </div>
              <div>
                <Label className="text-white/70">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e=>setEmail(e.target.value)}
                  className="mt-1 bg-transparent border border-white/[0.08] text-white placeholder-white/40"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>
            <div>
              <Label className="text-white/70">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={e=>setPassword(e.target.value)}
                className="mt-1 bg-transparent border border-white/[0.08] text-white placeholder-white/40"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <Label className="text-white/70">Confirm password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e=>setConfirmPassword(e.target.value)}
                className="mt-1 bg-transparent border border-white/[0.08] text-white placeholder-white/40"
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-medium text-black bg-white hover:bg-white/90 rounded transition-colors duration-200 mt-2"
            >
              {loading ? 'Creating...' : 'Create account'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
