"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'

interface Props {
  defaultType: 'SUPPLIER' | 'CLIENT'
}

export default function SetupClient({ defaultType }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (!name.trim()) {
        setError('Company name is required')
        setLoading(false)
        return
      }
      const res = await fetch('/api/user/tenant/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || undefined, organizationType: defaultType }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Setup failed')
      }
      // Redirect by role
      if (defaultType === 'SUPPLIER') router.push('/xase/voice')
      else router.push('/xase/voice/client')
    } catch (e: any) {
      setError(e?.message || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" autoComplete="off">
      <div className="space-y-1">
        <Label className="text-gray-800">Company name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={defaultType === 'SUPPLIER' ? 'Call Center Inc.' : 'AI Labs Ltd.'}
          className="bg-white border border-gray-300 text-gray-900 placeholder:text-gray-500"
          required
        />
      </div>
      <div className="space-y-1">
        <Label className="text-gray-800">Contact email (optional)</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contact@company.com"
          className="bg-white border border-gray-300 text-gray-900 placeholder:text-gray-500"
        />
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="pt-1">
        <Button type="submit" disabled={loading} className="bg-gray-900 text-white hover:bg-gray-800 rounded-full">
          {loading ? 'Creating...' : 'Create and Link Tenant'}
        </Button>
      </div>
    </form>
  )
}
