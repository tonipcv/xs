"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Calendar, CreditCard, Download, TrendingUp, Zap } from "lucide-react"

type UsageData = {
  period: string
  apiCalls: number
  dataProcessed: number
  cost: number
}

type BillingInfo = {
  plan: string
  nextBillingDate: string
  paymentMethod: string
  totalSpent: number
}

export default function UsageBillingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [usageData, setUsageData] = useState<UsageData[]>([])
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState("current")

  useEffect(() => {
    fetchUsageData()
    fetchBillingInfo()
  }, [selectedPeriod])

  const fetchUsageData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/xase/usage?period=${selectedPeriod}`)
      if (res.ok) {
        const data = await res.json()
        setUsageData(data.usage || [])
      }
    } catch (error) {
      console.error("Failed to fetch usage data", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchBillingInfo = async () => {
    try {
      const res = await fetch("/api/xase/billing")
      if (res.ok) {
        const data = await res.json()
        setBillingInfo(data.billing || null)
      }
    } catch (error) {
      console.error("Failed to fetch billing info", error)
    }
  }

  const handleExport = () => {
    console.log("Exporting usage data...")
  }

  const currentUsage = usageData[0] || { apiCalls: 0, dataProcessed: 0, cost: 0 }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-8 py-10 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold text-gray-900">Usage & Billing</h1>
            <p className="mt-2 text-gray-700">Monitor your API usage, costs, and billing information</p>
          </div>
          <button
            onClick={() => router.back()}
            className="px-5 py-2 border border-gray-400 text-gray-900 hover:bg-gray-100 rounded-full text-sm font-medium flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="bg-white border border-gray-400 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">API Calls</h3>
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{currentUsage.apiCalls.toLocaleString()}</p>
            <p className="text-xs text-gray-600 mt-1">This billing period</p>
          </div>

          <div className="bg-white border border-gray-400 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Data Processed</h3>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{(currentUsage.dataProcessed / 1024).toFixed(2)} GB</p>
            <p className="text-xs text-gray-600 mt-1">Total data volume</p>
          </div>

          <div className="bg-white border border-gray-400 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Current Cost</h3>
              <CreditCard className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">${currentUsage.cost.toFixed(2)}</p>
            <p className="text-xs text-gray-600 mt-1">Estimated charges</p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
          <div className="bg-white border border-gray-400 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Usage History</h2>
              <div className="flex items-center gap-3">
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="px-4 py-2 border border-gray-400 rounded-full text-sm font-medium text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                >
                  <option value="current">Current Period</option>
                  <option value="last30">Last 30 Days</option>
                  <option value="last90">Last 90 Days</option>
                  <option value="all">All Time</option>
                </select>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 border border-gray-400 text-gray-900 hover:bg-gray-100 rounded-full text-sm font-medium flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Export
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
              </div>
            ) : usageData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                <Calendar className="w-12 h-12 mb-4 text-gray-400" />
                <p className="text-sm font-medium">No usage data for this period</p>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b border-gray-300">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Period</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">API Calls</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Data (GB)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {usageData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.period}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">{row.apiCalls.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">{(row.dataProcessed / 1024).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">${row.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="bg-white border border-gray-400 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Billing Info</h2>
              {billingInfo ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase">Current Plan</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{billingInfo.plan}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase">Next Billing Date</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">{billingInfo.nextBillingDate}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase">Payment Method</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">{billingInfo.paymentMethod}</p>
                  </div>
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 uppercase">Total Spent</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">${billingInfo.totalSpent.toFixed(2)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">No billing information available</p>
              )}
              <button className="w-full px-4 py-2.5 bg-gray-900 text-white hover:bg-gray-800 rounded-full text-sm font-semibold">
                Manage Billing
              </button>
            </div>

            <div className="bg-white border border-gray-400 rounded-2xl p-6 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Quick Actions</h2>
              <div className="space-y-2">
                <button className="w-full px-4 py-2 border border-gray-400 text-gray-900 hover:bg-gray-100 rounded-full text-sm font-medium text-left">
                  View Invoices
                </button>
                <button className="w-full px-4 py-2 border border-gray-400 text-gray-900 hover:bg-gray-100 rounded-full text-sm font-medium text-left">
                  Update Payment Method
                </button>
                <button className="w-full px-4 py-2 border border-gray-400 text-gray-900 hover:bg-gray-100 rounded-full text-sm font-medium text-left">
                  Set Usage Alerts
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-300 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">💡 Optimize Costs</h3>
              <p className="text-xs text-blue-800 leading-relaxed">
                Review your API usage patterns and consider batching requests or caching frequently accessed data to reduce costs.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
