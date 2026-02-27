import { AppLayout } from '@/components/AppSidebar'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/rbac'
import { Playfair_Display } from 'next/font/google'
import { DollarSign, Activity, Clock, TrendingUp } from 'lucide-react'
import { BillingDashboard } from '@/components/xase/BillingDashboard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default async function BillingPage() {
  const context = await requireAuth()

  const [entries, agg] = await Promise.all([
    prisma.creditLedger.findMany({
      where: { tenantId: context.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.creditLedger.aggregate({
      where: { tenantId: context.tenantId! },
      _sum: { amount: true },
    }),
  ])

  const balance = agg._sum.amount ? Number(agg._sum.amount) : 0
  const debits = entries.filter((e) => (e.eventType || '').includes('DEBIT'))
  const totalDebits = debits.reduce((sum, e) => sum + Number(e.amount), 0)
  const credits = entries.filter((e) => (e.eventType || '').includes('CREDIT'))
  const totalCredits = credits.reduce((sum, e) => sum + Number(e.amount), 0)
  const isSupplier = context.organizationType === 'SUPPLIER'

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>
                {isSupplier ? 'Revenue & Billing' : 'Usage & Billing'}
              </h1>
              <p className="text-sm text-gray-900">
                {isSupplier
                  ? 'Revenue credits and platform movements for this tenant'
                  : 'Comprehensive billing dashboard with storage, compute, and data processing metrics'}
              </p>
            </div>
          </div>

          {/* Tabs for Dashboard and Ledger */}
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList>
              <TabsTrigger value="dashboard" className="flex items-center gap-2 text-gray-900">
                <TrendingUp className="h-4 w-4 text-gray-900" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="ledger" className="flex items-center gap-2 text-gray-900">
                <Activity className="h-4 w-4 text-gray-900" />
                Ledger
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              <BillingDashboard tenantId={context.tenantId!} />
            </TabsContent>

            <TabsContent value="ledger" className="space-y-6">

          {/* Summary cards */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-900">Current Balance</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-gray-900" />
                {balance.toFixed(2)}
              </p>
              <p className="text-xs text-gray-900 mt-1">Positive = credits available for usage</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-900">
                {isSupplier ? 'Total Credits (sample)' : 'Total Debits (sample)'}
              </p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">
                {isSupplier ? totalCredits.toFixed(2) : Math.abs(totalDebits).toFixed(2)}
              </p>
              <p className="text-xs text-gray-900 mt-1">
                {isSupplier
                  ? `Revenue credits in the last ${entries.length} entries`
                  : `Usage-based charges in the last ${entries.length} entries`}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-900">Ledger Entries</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{entries.length}</p>
              <p className="text-xs text-gray-900 mt-1">Most recent movements only</p>
            </div>
          </div>

              {/* Ledger table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-900">When</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-900">Type</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-900">Amount</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-900">Policy / Dataset</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-900">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.length > 0 ? (
                        entries.map((entry) => (
                          <tr
                            key={entry.id}
                            className="border-b border-gray-200 hover:bg-white transition-colors"
                          >
                            <td className="px-4 py-2 text-xs text-gray-900 tabular-nums">
                              <Clock className="h-3 w-3 inline mr-1 text-gray-900" />
                              {new Date(entry.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-xs">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-medium text-gray-900 border border-gray-900 bg-white`}
                              >
                                {entry.eventType}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs tabular-nums text-gray-900">
                              {Number(entry.amount).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 max-w-[220px] truncate">
                              {(entry.metadata as any)?.policyId || '-'}
                              {(entry.metadata as any)?.datasetName ? ` • ${(entry.metadata as any).datasetName}` : ''}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 max-w-[260px] truncate">
                              {entry.description || entry.eventType}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-xs text-gray-900">
                            <Activity className="h-4 w-4 inline mr-2 text-gray-900" />
                            No billing activity yet for this account.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  )
}
