import { AppLayout } from '@/components/AppSidebar'
import { prisma } from '@/lib/prisma'
import { requireClient } from '@/lib/rbac'
import { Playfair_Display } from 'next/font/google'
import Link from 'next/link'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default async function ClientPoliciesPage() {
  const context = await requireClient()

  const policies = await prisma.voiceAccessPolicy.findMany({
    where: {
      clientTenantId: context.tenantId!,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      dataset: {
        select: {
          datasetId: true,
          name: true,
          tenantId: true,
        },
      },
    },
  })

  const activeCount = policies.filter((p) => p.status === 'ACTIVE').length

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0e0f12]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <h1 className={`${heading.className} text-3xl font-semibold text-white tracking-tight`}>
                My Access Policies
              </h1>
              <p className="text-sm text-white/40 font-mono">
                {policies.length} polic{policies.length !== 1 ? 'ies' : 'y'} linked to this AI Lab tenant
              </p>
            </div>
          </div>

          {/* Policies Table */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.02] border-b border-white/[0.04]">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-white/60">Dataset</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-white/60">Status</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-white/60">Purpose</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-white/60">Max Hours</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-white/60">Consumed</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-white/60">Expires</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-white/60">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.length > 0 ? (
                    policies.map((policy) => (
                      <tr
                        key={policy.id}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-2 text-xs text-white/80">
                          <Link
                            href={`/xase/voice/datasets/${policy.dataset.datasetId}/lab`}
                            className="hover:text-white underline"
                          >
                            {policy.dataset.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              policy.status === 'ACTIVE'
                                ? 'bg-white/10 text-white/90'
                                : 'bg-white/5 text-white/60'
                            }`}
                          >
                            {policy.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-white/60 max-w-[240px] truncate">
                          {policy.usagePurpose}
                        </td>
                        <td className="px-4 py-2 text-xs text-white/60 font-mono">
                          {policy.maxHours || '∞'}
                        </td>
                        <td className="px-4 py-2 text-xs text-white/60 font-mono">
                          {policy.hoursConsumed.toFixed(2)}h
                        </td>
                        <td className="px-4 py-2 text-xs text-white/60 font-mono">
                          {policy.expiresAt ? new Date(policy.expiresAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <Link
                            href={`/xase/voice/policies/${policy.policyId}/test`}
                            className="text-white/70 hover:text-white/90 underline"
                          >
                            Test Access
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-xs text-white/50">
                        No policies granted to this AI Lab yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
              <p className="text-xs font-medium text-white/80">Active Policies</p>
              <p className="text-2xl font-semibold text-white mt-1 font-mono">{activeCount}</p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
              <p className="text-xs font-medium text-white/80">Total Hours Granted</p>
              <p className="text-2xl font-semibold text-white mt-1 font-mono">
                {policies
                  .filter((p) => p.status === 'ACTIVE')
                  .reduce((sum, p) => sum + (p.maxHours || 0), 0)
                  .toFixed(2)}
                h
              </p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
              <p className="text-xs font-medium text-white/80">Total Hours Consumed</p>
              <p className="text-2xl font-semibold text-white mt-1 font-mono">
                {policies.reduce((sum, p) => sum + p.hoursConsumed, 0).toFixed(2)}h
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
