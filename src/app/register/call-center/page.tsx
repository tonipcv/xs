"use client"

import { useState } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Playfair_Display } from 'next/font/google'
import { useRouter } from 'next/navigation'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function CallCenterRegisterPage() {
  const router = useRouter()
  const [company, setCompany] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/register/call-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, name, email, password })
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
    <AppLayout>
      <div className="min-h-screen bg-[#0e0f12]">
        <div className="max-w-[900px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-2xl font-semibold text-white tracking-tight`}>Call Center Registration</h1>
            <p className="text-sm text-white/60">Create a supplier account to manage datasets, policies and usage.</p>
          </div>

          <form onSubmit={onSubmit} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 space-y-4">
            <div>
              <Label className="text-white/70">Company</Label>
              <Input value={company} onChange={e=>setCompany(e.target.value)} className="mt-1 bg-[#2a2b2d] border-none text-white placeholder-white/40" placeholder="Your call center" required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-white/70">Name</Label>
                <Input value={name} onChange={e=>setName(e.target.value)} className="mt-1 bg-[#2a2b2d] border-none text-white placeholder-white/40" placeholder="Your name" required />
              </div>
              <div>
                <Label className="text-white/70">Email</Label>
                <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 bg-[#2a2b2d] border-none text-white placeholder-white/40" placeholder="you@company.com" required />
              </div>
            </div>
            <div>
              <Label className="text-white/70">Password</Label>
              <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 bg-[#2a2b2d] border-none text-white placeholder-white/40" placeholder="••••••••" required />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={loading} className="bg-white/[0.06] hover:bg-white/[0.12] text-white">
              {loading ? 'Creating...' : 'Create account'}
            </Button>
          </form>
        </div>
      </div>
    </AppLayout>
  )
}
