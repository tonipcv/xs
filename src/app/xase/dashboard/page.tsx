'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { TrustDashboard } from '@/components/xase/TrustDashboard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function DashboardPage() {
  const [period, setPeriod] = useState('24h')

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0a0a0a]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Trust Dashboard</h1>
            <p className="text-sm text-gray-400">AI decision trust and quality metrics</p>
          </div>

          <div className="flex items-center justify-end">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px] bg-transparent border-white/30 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last hour</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TrustDashboard period={period} />
        </div>
      </div>
    </AppLayout>
  )
}
