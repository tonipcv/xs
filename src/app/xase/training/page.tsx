// @ts-nocheck
import { Metadata } from 'next';
import { requireClient } from '@/lib/rbac';
import { AppLayout } from '@/components/AppSidebar';
import { prisma } from '@/lib/prisma';
import { Playfair_Display } from 'next/font/google';
import Link from 'next/link';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });


export default async function TrainingDashboard() {
  const context = await requireClient();
  const tenantId = context.tenantId;

  if (!tenantId) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-[1400px] mx-auto px-8 py-8">
            <p className="text-gray-600">No tenant found</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const now = new Date();

  const [activeLeases, totalLeases, recentAccessLogs] = await prisma.$transaction([
    prisma.voiceAccessLease.findMany({
      where: {
        clientTenantId: tenantId,
        status: 'ACTIVE',
      },
      orderBy: { issuedAt: 'desc' },
      take: 10,
      include: {
        policy: {
          select: {
            policyId: true,
            dataset: {
              select: {
                datasetId: true,
                name: true,
                primaryLanguage: true,
              },
            },
          },
        },
      },
    }),
    prisma.voiceAccessLease.count({
      where: { clientTenantId: tenantId },
    }),
    prisma.voiceAccessLog.findMany({
      where: {
        policy: {
          clientTenantId: tenantId,
        },
        action: 'STREAM_ACCESS',
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
      include: {
        dataset: {
          select: {
            datasetId: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const expiringSoon = activeLeases.filter((lease) => {
    const expiresAt = new Date(lease.expiresAt);
    const diffMs = expiresAt.getTime() - now.getTime();
    return diffMs > 0 && diffMs < 60 * 60 * 1000;
  }).length;

  const totalHoursConsumed = await prisma.voiceAccessLog.aggregate({
    where: {
      policy: {
        clientTenantId: tenantId,
      },
      outcome: 'GRANTED',
    },
    _sum: {
      hoursAccessed: true,
    },
  });

  const hoursConsumed = totalHoursConsumed._sum.hoursAccessed || 0;

  const uniqueJobIds = [...new Set(recentAccessLogs.map((log) => log.requestId).filter(Boolean))];
  const activeJobs = uniqueJobIds.length;

  const serializedLeases = activeLeases.map((lease) => ({
    ...lease,
    issuedAt: lease.issuedAt.toISOString(),
    expiresAt: lease.expiresAt.toISOString(),
    revokedAt: lease.revokedAt?.toISOString() || null,
    policy: {
      ...lease.policy,
      dataset: {
        ...lease.policy.dataset,
        language: lease.policy.dataset.primaryLanguage,
      },
    },
  }));

  const serializedLogs = recentAccessLogs.map((log) => ({
    ...log,
    timestamp: log.timestamp.toISOString(),
  }));

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h1 className={`${heading.className} text-2xl font-semibold text-gray-900 tracking-tight`}>
                Training Dashboard
              </h1>
              <p className="text-sm text-gray-600">
                Monitor your AI training infrastructure and data access
              </p>
            </div>
            <Link
              href="/xase/training/request-lease"
              className="px-4 py-2 bg-white text-black rounded text-sm font-medium hover:bg-white/90 transition-colors"
            >
              Request Lease
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Link href="#active-leases" className="block group focus:outline-none focus:ring-2 focus:ring-gray-300 rounded-xl">
              <div className="bg-white border border-gray-200 rounded-xl p-6 cursor-pointer group-hover:bg-gray-50 transition-colors">
                <p className="text-[10px] text-gray-500 tracking-wider uppercase font-medium">Active Leases</p>
                <p className="text-2xl font-semibold text-gray-900 mt-2 tabular-nums">{activeLeases.length}</p>
                {expiringSoon > 0 && (
                  <p className="text-xs text-gray-600 mt-1">{expiringSoon} expiring soon</p>
                )}
              </div>
            </Link>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <p className="text-[10px] text-gray-500 tracking-wider uppercase font-medium">Total Leases</p>
              <p className="text-2xl font-semibold text-gray-900 mt-2 tabular-nums">{totalLeases}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <p className="text-[10px] text-gray-500 tracking-wider uppercase font-medium">Hours Consumed</p>
              <p className="text-2xl font-semibold text-gray-900 mt-2 tabular-nums">{hoursConsumed.toFixed(2)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <p className="text-[10px] text-gray-500 tracking-wider uppercase font-medium">Active Jobs</p>
              <p className="text-2xl font-semibold text-gray-900 mt-2 tabular-nums">{activeJobs}</p>
            </div>
          </div>

          {expiringSoon > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                <p className="text-sm text-gray-700 font-medium">
                  {expiringSoon} lease{expiringSoon > 1 ? 's' : ''} expiring within 1 hour
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="active-leases" className={`${heading.className} text-base font-semibold text-gray-900`}>
                Active Leases
              </h2>
            </div>

            {serializedLeases.length > 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-6 py-4 text-xs font-medium text-gray-600 tracking-wider">DATASET</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-gray-600 tracking-wider">ISSUED</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-gray-600 tracking-wider">EXPIRES</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-gray-600 tracking-wider">TIME LEFT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serializedLeases.map((lease) => {
                        const expiresAt = new Date(lease.expiresAt);
                        const diffMs = expiresAt.getTime() - now.getTime();
                        const minutes = Math.floor(diffMs / 60000);
                        const hours = Math.floor(minutes / 60);
                        const timeLeft = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
                        const isExpiringSoon = diffMs < 60 * 60 * 1000;

                        return (
                          <tr key={lease.leaseId} className="border-b border-gray-200 hover:bg-white">
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <Link href={`/xase/training/leases/${lease.leaseId}`} className="text-sm text-gray-900 underline hover:text-gray-800">
                                  {lease.policy.dataset.name}
                                </Link>
                                <p className="text-[10px] text-gray-500">{lease.policy.dataset.language}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-gray-600 tabular-nums">
                              {new Date(lease.issuedAt).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-6 py-4 text-xs text-gray-600 tabular-nums">
                              {expiresAt.toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-xs font-medium tabular-nums ${isExpiringSoon ? 'text-gray-700' : 'text-gray-900'}`}>
                                {timeLeft}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-white/[0.08] rounded-xl p-12">
                <div className="flex flex-col items-center justify-center text-center space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">No active leases</h3>
                  <p className="text-sm text-gray-600 max-w-md">
                    Request a lease to start streaming training data from available datasets.
                  </p>
                  <Link
                    href="/xase/training/request-lease"
                    className="px-4 py-2 bg-white text-black rounded text-sm font-medium hover:bg-white/90 transition-colors"
                  >
                    Request Lease
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`${heading.className} text-base font-semibold text-gray-900`}>
                Recent Streaming Activity
              </h2>
            </div>

            {serializedLogs.length > 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-6 py-4 text-xs font-medium text-gray-600 tracking-wider">DATASET</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-gray-600 tracking-wider">JOB ID</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-gray-600 tracking-wider">HOURS</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-gray-600 tracking-wider">TIMESTAMP</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-gray-600 tracking-wider">OUTCOME</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serializedLogs.map((log) => (
                        <tr key={log.id} className="border-b border-gray-200 hover:bg-white">
                          <td className="px-6 py-4 text-sm text-gray-900">{log.dataset.name}</td>
                          <td className="px-6 py-4 text-xs text-gray-600 font-mono">
                            {log.requestId ? log.requestId.substring(0, 12) + '...' : '—'}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600 tabular-nums">{log.hoursAccessed.toFixed(3)}h</td>
                          <td className="px-6 py-4 text-xs text-gray-600 tabular-nums">
                            {new Date(log.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[10px] px-2 py-0.5 rounded border uppercase font-medium text-gray-700 border-gray-300 bg-white`}>
                              {log.outcome}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-white/[0.08] rounded-xl p-8">
                <p className="text-sm text-gray-600 text-center">No streaming activity yet</p>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Link
              href="/xase/training/request-lease"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-medium text-gray-900 mb-1">Request Lease</h3>
              <p className="text-xs text-gray-600">Get access to training datasets</p>
            </Link>

            <Link
              href="/xase/voice/client/access"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-medium text-gray-900 mb-1">Browse Datasets</h3>
              <p className="text-xs text-gray-600">Explore available training data</p>
            </Link>

            <Link
              href="/xase/voice/client/billing"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-medium text-gray-900 mb-1">Billing</h3>
              <p className="text-xs text-gray-600">View usage and invoices</p>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
