import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import XaseUsageBanner from '@/components/XaseUsageBanner';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Xase',
  description: 'Immutable ledger for AI decisions',
};

export default async function XaseDashboard() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Buscar tenant ID
  const tenantId = await getTenantId();
  
  // Buscar stats reais
  let totalRecords = 0;
  let totalCheckpoints = 0;
  let totalExports = 0;
  let lastCheckpoint: Date | null = null;
  let integrityStatus = 'Pending';

  if (tenantId) {
    [totalRecords, totalCheckpoints, totalExports] = await Promise.all([
      prisma.decisionRecord.count({ where: { tenantId } }),
      prisma.checkpointRecord.count({ where: { tenantId } }),
      prisma.auditLog.count({
        where: { tenantId, action: 'EXPORT_CREATED' },
      }),
    ]);

    const lastCp = await prisma.checkpointRecord.findFirst({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true, isVerified: true },
    });

    lastCheckpoint = lastCp?.timestamp || null;
    integrityStatus = lastCp?.isVerified ? 'Verified' : 'Pending';
  }

  const stats = [
    {
      label: 'RECORDS',
      value: totalRecords.toString(),
      change: null,
    },
    {
      label: 'CHECKPOINTS',
      value: totalCheckpoints.toString(),
      change: null,
    },
    {
      label: 'EXPORTS',
      value: totalExports.toString(),
      change: null,
    },
    {
      label: 'INTEGRITY',
      value: totalRecords > 0 ? '100%' : 'N/A',
      change: integrityStatus,
    },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#1c1d20]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header + minimal usage (top-right) */}
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard</h1>
              <p className="text-sm text-gray-400">Overview of your evidence ledger</p>
            </div>
            <div className="w-full flex justify-end">
              <div className="w-full max-w-sm">
                <XaseUsageBanner />
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6"
              >
                <div className="space-y-3">
                  <p className="text-[10px] font-medium text-white/40 tracking-wider">
                    {stat.label}
                  </p>
                  <p className="text-4xl font-semibold text-white tracking-tight">
                    {stat.value}
                  </p>
                  {stat.change && (
                    <p className="text-xs text-white/50">
                      {stat.change}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-white/50">
              Quick actions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <a
                href="/xase/records"
                className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
              >
                <p className="text-sm font-medium text-white">View records</p>
                <p className="text-xs text-white/40">Browse decision ledger</p>
              </a>

              <a
                href="/xase/checkpoints"
                className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
              >
                <p className="text-sm font-medium text-white">Checkpoints</p>
                <p className="text-xs text-white/40">KMS integrity anchors</p>
              </a>

              <a
                href="/xase/audit"
                className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
              >
                <p className="text-sm font-medium text-white">Audit trail</p>
                <p className="text-xs text-white/40">Immutable action log</p>
              </a>
            </div>
          </div>

          {/* System Status */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white/50">
                System status
              </h2>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                <span className="text-xs text-white/50">Operational</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <span className="text-xs text-white/40">Hash chain</span>
                <span className="text-sm text-white">Verified</span>
              </div>
              <div className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <span className="text-xs text-white/40">Last checkpoint</span>
                <span className="text-sm text-white">
                  {lastCheckpoint
                    ? new Date(lastCheckpoint).toLocaleString('en-US', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Never'}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <span className="text-xs text-white/40">API</span>
                <span className="text-sm text-white">Online</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
