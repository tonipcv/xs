// @ts-nocheck
import { AppLayout } from '@/components/AppSidebar'
import { prisma } from '@/lib/prisma'
import { requireClient } from '@/lib/rbac'
import { Playfair_Display } from 'next/font/google'
import { Clock, Activity } from 'lucide-react'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default async function ClientAccessHistoryPage() {
  const context = await requireClient()

  const logs = await prisma.voiceAccessLog.findMany({
    where: {
      clientTenantId: context.tenantId!,
    },
    orderBy: { timestamp: 'desc' },
    take: 100,
    include: {
      dataset: {
        select: {
          datasetId: true,
          name: true,
        },
      },
      policy: {
        select: {
          policyId: true,
          usagePurpose: true,
        },
      },
    },
  })

  const grantedCount = logs.filter((l) => l.outcome === 'GRANTED').length
  const deniedCount = logs.filter((l) => l.outcome !== 'GRANTED').length

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>
                Access History
              </h1>
              <p className="text-sm text-gray-600">Policy-evaluated access events for this AI Lab tenant</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Total Events</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{logs.length}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Granted</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{grantedCount}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Denied</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{deniedCount}</p>
            </div>
          </div>

          {/* Logs list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-200">
              {logs.length > 0 ? (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start justify-between px-5 py-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-900">
                        {log.dataset?.name || 'Unknown dataset'}
                      </p>
                      <p className="text-xs text-gray-600">
                        Policy {log.policy?.policyId || 'N/A'} – {log.policy?.usagePurpose || 'N/A'}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">
                        {log.hoursAccessed.toFixed(2)}h
                      </p>
                      {log.outcome !== 'GRANTED' && log.errorMessage && (
                        <p className="text-[11px] text-red-700 mt-1 max-w-[420px]">
                          {log.errorMessage}
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <span
                        className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                          log.outcome === 'GRANTED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {log.outcome}
                      </span>
                      <div className="text-xs text-gray-500">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-6 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
                  <Activity className="h-5 w-5 text-gray-400" />
                  <span>No access events yet for this AI Lab.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
