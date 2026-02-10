'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'
import Link from 'next/link'
import { Database, Cpu, DollarSign, Activity } from 'lucide-react'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function AILabDashboard() {
  const [stats, setStats] = useState({
    activeLeases: 0,
    totalHoursConsumed: 0,
    totalSpent: 0,
    datasetsAccessed: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      // TODO: Implement API call to fetch client stats
      setLoading(false)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>
                  AI Lab Dashboard
                </h1>
                <p className="text-sm text-gray-500">Access voice datasets for AI training and development</p>
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-700 leading-relaxed">
              Welcome to your AI Lab dashboard. Browse the marketplace to discover voice datasets, request access, and start training your models.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Active Leases</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{stats.activeLeases}</p>
              <Link href="/xase/ai-lab/training" className="text-xs text-gray-600 hover:text-gray-800 mt-2 inline-block">
                View training →
              </Link>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Hours Consumed</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">
                {stats.totalHoursConsumed.toFixed(2)}h
              </p>
              <p className="text-xs text-gray-500">Total usage</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Total Spent</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">
                ${stats.totalSpent.toFixed(2)}
              </p>
              <Link href="/xase/ai-lab/billing" className="text-xs text-gray-600 hover:text-gray-800 mt-2 inline-block">
                View billing →
              </Link>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Datasets Accessed</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{stats.datasetsAccessed}</p>
              <Link href="/xase/ai-lab/marketplace" className="text-xs text-gray-600 hover:text-gray-800 mt-2 inline-block">
                Browse more →
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid gap-3 md:grid-cols-3">
            <Link
              href="/xase/ai-lab/marketplace"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors"
            >
              <Database className="h-5 w-5 text-gray-700 mb-2" />
              <h3 className="text-sm font-medium text-gray-900 mb-1">Browse Marketplace</h3>
              <p className="text-xs text-gray-600">Discover voice datasets for training</p>
            </Link>

            <Link
              href="/xase/ai-lab/training"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors"
            >
              <Cpu className="h-5 w-5 text-gray-700 mb-2" />
              <h3 className="text-sm font-medium text-gray-900 mb-1">Active Training</h3>
              <p className="text-xs text-gray-600">Manage your training jobs</p>
            </Link>

            <Link
              href="/xase/ai-lab/billing"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors"
            >
              <DollarSign className="h-5 w-5 text-gray-700 mb-2" />
              <h3 className="text-sm font-medium text-gray-900 mb-1">Billing & Usage</h3>
              <p className="text-xs text-gray-600">Track costs and consumption</p>
            </Link>
          </div>

          {/* Getting Started */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Getting Started</h3>
            <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
              <li>Browse the marketplace to find datasets that match your needs</li>
              <li>Request access to datasets with appropriate usage policies</li>
              <li>Once approved, start streaming or downloading data for training</li>
              <li>Monitor your usage and costs in the billing section</li>
            </ol>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
