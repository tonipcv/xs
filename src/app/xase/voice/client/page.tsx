import { requireClient } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppLayout } from '@/components/AppSidebar'
// Icons removed per request (no emojis/icons)
import { Playfair_Display } from 'next/font/google'
import Link from 'next/link'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default async function ClientDashboard() {
  const context = await requireClient()

  const [
    activePolicies,
    totalAccessLogs,
    totalCreditsSpent,
    recentAccessLogs,
    uniqueDatasets,
    activePolicyList,
    latestApiKey,
  ] = await Promise.all([
    prisma.voiceAccessPolicy.count({
      where: {
        clientTenantId: context.tenantId!,
        status: 'ACTIVE',
      }
    }),
    prisma.voiceAccessLog.count({
      where: {
        clientTenantId: context.tenantId!,
      }
    }),
    prisma.creditLedger.aggregate({
      where: {
        tenantId: context.tenantId!,
        eventType: {
          contains: 'DEBIT',
        }
      },
      _sum: {
        amount: true,
      }
    }),
    prisma.voiceAccessLog.findMany({
      where: {
        clientTenantId: context.tenantId!,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 10,
      include: {
        dataset: {
          select: {
            name: true,
          }
        },
        policy: {
          select: {
            policyId: true,
            usagePurpose: true,
          }
        }
      }
    }),
    prisma.voiceAccessLog.groupBy({
      by: ['datasetId'],
      where: {
        clientTenantId: context.tenantId!,
      },
      _count: {
        id: true,
      }
    }),
    prisma.voiceAccessPolicy.findMany({
      where: {
        clientTenantId: context.tenantId!,
        status: 'ACTIVE',
      },
      select: {
        policyId: true,
        usagePurpose: true,
        maxHours: true,
        hoursConsumed: true,
        expiresAt: true,
        dataset: {
          select: { datasetId: true, name: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.apiKey.findFirst({
      where: { tenantId: context.tenantId! },
      select: { keyPrefix: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const totalSpent = totalCreditsSpent._sum.amount ? Math.abs(Number(totalCreditsSpent._sum.amount)) : 0

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header (reduced) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <h1 className={`${heading.className} text-2xl font-semibold text-gray-900 tracking-tight`}>
                  AI Lab
                </h1>
              </div>
            </div>
          </div>

          {/* Summary strip (compact) */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-800">
            <span className="font-mono text-gray-900">{activePolicies}</span> active policies •
            <span className="font-mono text-gray-900"> {uniqueDatasets.length}</span> datasets •
            <span className="font-mono text-gray-900"> {totalAccessLogs.toLocaleString()}</span> access events
          </div>

          {/* Stats Grid */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Active Policies</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{activePolicies}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Access Events</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{totalAccessLogs.toLocaleString()}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Credits Spent</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{totalSpent.toLocaleString()}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Datasets in Scope</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{uniqueDatasets.length}</p>
            </div>
          </div>

          {/* API Key + Evidence */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5 md:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-medium text-gray-600">API Key</p>
                  <p className="text-xs text-gray-500">Lab credential for policy‑evaluated access</p>
                </div>
              </div>
              {latestApiKey ? (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Prefix: <span className="font-mono text-gray-900">{latestApiKey.keyPrefix}…</span>
                  </div>
                  <Link href="/xase/api-keys" className="text-xs text-gray-600 hover:text-gray-800 underline">
                    Manage keys
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    No API key detected yet.
                  </div>
                  <Link href="/xase/api-keys" className="text-xs text-gray-600 hover:text-gray-800 underline">
                    Create key
                  </Link>
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600 mb-1">Training Evidence</p>
              <p className="text-xs text-gray-500 mb-3">Export evidence bundle for last 3 days of access.</p>
              <a
                href={`/api/v1/voice/evidence?days=3`}
                className="inline-flex items-center rounded border border-gray-300 px-3 py-2 text-xs text-gray-800 hover:bg-gray-50"
              >
                Export Evidence Bundle (JSON)
              </a>
            </div>
          </div>

          {/* Outcomes + Active Sessions */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-medium text-gray-600">Policy Evaluation Outcomes</p>
                  <p className="text-xs text-gray-500">GRANTED vs DENIED, with explicit reasons</p>
                </div>
              </div>
              <div className="space-y-4">
                {recentAccessLogs.length === 0 ? (
                  <p className="text-sm text-gray-600">No access logs yet</p>
                ) : (
                  recentAccessLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between border-b border-gray-200 pb-3 last:border-0">
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none text-gray-900">
                          {log.dataset?.name || 'Unknown Dataset'}
                        </p>
                        <p className="text-xs text-gray-600">
                          {log.policy?.usagePurpose || 'N/A'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${log.outcome === 'GRANTED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            {log.outcome}
                          </span>
                          <p className="text-xs text-gray-600 mt-1 font-mono">{log.hoursAccessed.toFixed(2)}h</p>
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(log.timestamp).toLocaleDateString()}
                          {log.outcome !== 'GRANTED' && log.errorMessage && (
                            <div className="text-[11px] text-red-700 mt-1 max-w-[220px] truncate" title={log.errorMessage}>
                              {log.errorMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-medium text-gray-600">Active Data Access Sessions</p>
                  <p className="text-xs text-gray-500">What your lab is interacting with right now</p>
                </div>
              </div>
              <div className="space-y-3">
                {activePolicyList.length === 0 ? (
                  <p className="text-sm text-gray-600">No active sessions</p>
                ) : (
                  activePolicyList.map((p) => (
                    <div key={p.policyId} className="flex items-center justify-between border-b border-gray-200 pb-3 last:border-0">
                      <div className="space-y-1">
                        <Link
                          href={`/xase/voice/datasets/${p.dataset?.datasetId}/lab`}
                          className="text-sm font-medium leading-none text-gray-900 underline-offset-2 hover:underline"
                        >
                          {p.dataset?.name || p.dataset?.datasetId}
                        </Link>
                        <p className="text-xs text-gray-600">{p.usagePurpose} • {p.policyId}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900 font-mono">
                          {(p.hoursConsumed || 0).toFixed(1)}h / {p.maxHours ?? '∞'}h
                        </p>
                        <p className="text-xs text-gray-500">
                          {p.expiresAt ? `expires ${new Date(p.expiresAt).toLocaleDateString()}` : 'no expiration'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
