import { requireClient } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import TestAccessClient from './TestAccessClient'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] })

export default async function LabDatasetView({ params }: { params: Promise<{ datasetId: string }> }) {
  const context = await requireClient()
  const { datasetId: publicDatasetId } = await params

  // Get dataset and ensure the current client has a policy for it
  const dataset = await prisma.dataset.findFirst({
    where: { datasetId: publicDatasetId },
    select: {
      id: true,
      datasetId: true,
      name: true,
      description: true,
      primaryLanguage: true,
      consentStatus: true,
      jurisdiction: true,
      createdAt: true,
      publishedAt: true,
    }
  })

  if (!dataset) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50 text-gray-700 p-8">Dataset not found</div>
      </AppLayout>
    )
  }

  const clientPolicies = await prisma.voiceAccessPolicy.findMany({
    where: {
      clientTenantId: context.tenantId!,
      datasetId: dataset.id,
    },
    select: {
      policyId: true,
      usagePurpose: true,
      status: true,
      maxHours: true,
      hoursConsumed: true,
      expiresAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' }
  })

  // If no policies for this client, block access (avoid marketplace vibes)
  if (clientPolicies.length === 0) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50 text-gray-700 p-8">
          <div className="max-w-[900px] mx-auto">
            <h1 className={`${heading.className} text-2xl font-semibold text-gray-900`}>Access Restricted</h1>
            <p className="mt-2 text-sm text-gray-600">Your organization does not have a policy for this dataset.</p>
            <Link className="mt-4 inline-block underline text-gray-800 hover:text-gray-900" href="/app/training">Back to Dashboard</Link>
          </div>
        </div>
      </AppLayout>
    )
  }

  const accessLogs = await prisma.voiceAccessLog.findMany({
    where: {
      datasetId: dataset.id,
      clientTenantId: context.tenantId!,
    },
    orderBy: { timestamp: 'desc' },
    take: 20,
    select: {
      id: true,
      action: true,
      outcome: true,
      hoursAccessed: true,
      errorMessage: true,
      timestamp: true,
    }
  })

  const defaultPolicyId = clientPolicies[0]?.policyId
  const policyOptions = clientPolicies.map((p) => ({ policyId: p.policyId, usagePurpose: p.usagePurpose }))

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1100px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Link href="/app/training" className="text-gray-600 hover:text-gray-800 text-sm">← Back to Lab Dashboard</Link>
              <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>{dataset.name}</h1>
              <p className="text-sm text-gray-500 font-mono">Dataset: {dataset.datasetId}</p>
            </div>
          </div>

          {/* Provenance */}
          <div className="grid gap-3 md:grid-cols-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Language</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">{dataset.primaryLanguage}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Consent</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{dataset.consentStatus}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Jurisdiction</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{dataset.jurisdiction || 'N/A'}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Freshness</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {dataset.publishedAt ? new Date(dataset.publishedAt).toLocaleDateString() : new Date(dataset.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Policies (for this client) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`${heading.className} text-base font-semibold text-gray-900`}>Your Access Policies</h2>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Policy</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Purpose</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Limit</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Used</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientPolicies.map((p) => (
                      <tr key={p.policyId} className="border-b border-gray-200">
                        <td className="px-4 py-2 text-xs font-mono text-gray-800">{p.policyId}</td>
                        <td className="px-4 py-2 text-xs text-gray-800">{p.usagePurpose}</td>
                        <td className="px-4 py-2 text-xs text-gray-600 font-mono">{p.maxHours ?? '∞'}h</td>
                        <td className="px-4 py-2 text-xs text-gray-600 font-mono">{(p.hoursConsumed || 0).toFixed(2)}h</td>
                        <td className="px-4 py-2 text-xs">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Test Access widget */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className={`${heading.className} text-base font-semibold text-gray-900 mb-4`}>Access Simulation (Policy Check)</h2>
            <TestAccessClient datasetId={dataset.datasetId} policyOptions={policyOptions} defaultPolicyId={defaultPolicyId} />
            <p className="text-[11px] text-gray-500 mt-3">Non-mutating check: does not consume usage or update billing.</p>
          </div>

          {/* Access Event Log (client scoped) */}
          <div className="space-y-3">
            <h2 className={`${heading.className} text-base font-semibold text-gray-900`}>Access Event Log</h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Timestamp</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Action</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Hours</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Outcome</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLogs.length > 0 ? (
                      accessLogs.map((l) => (
                        <tr key={l.id} className="border-b border-gray-200">
                          <td className="px-4 py-2 text-xs font-mono text-gray-800">{new Date(l.timestamp).toLocaleString()}</td>
                          <td className="px-4 py-2 text-xs text-gray-800">{l.action}</td>
                          <td className="px-4 py-2 text-xs font-mono text-gray-700">{l.hoursAccessed.toFixed(2)}h</td>
                          <td className="px-4 py-2 text-xs">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${l.outcome === 'GRANTED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{l.outcome}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600">{l.errorMessage || '—'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-6 text-center text-xs text-gray-500" colSpan={5}>No access events yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Evidence links removed until API is implemented */}
        </div>
      </div>
    </AppLayout>
  )
}
