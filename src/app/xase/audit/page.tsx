import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { AuditTable } from './AuditTable';

export const metadata: Metadata = {
  title: 'Xase Audit Log',
  description: 'Immutable action trail with enterprise-grade filtering',
};

export default async function AuditPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();
  
  if (!tenantId) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-[#121316]">
          <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">Audit Log</h1>
              <p className="text-sm text-white/50">No tenant found</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  let logs: any[] = [];
  let total = 0;
  let todayCount = 0;
  let weekCount = 0;

  {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    [logs, total, todayCount, weekCount] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { timestamp: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          status: true,
          timestamp: true,
          userId: true,
          ipAddress: true,
          userAgent: true,
        },
      }),
      prisma.auditLog.count({ where: { tenantId } }),
      prisma.auditLog.count({
        where: { tenantId, timestamp: { gte: today } },
      }),
      prisma.auditLog.count({
        where: { tenantId, timestamp: { gte: weekAgo } },
      }),
    ]);
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">
                Audit Log
              </h1>
              <p className="text-sm text-white/50">
                {total} action{total !== 1 ? 's' : ''} logged
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/30 tracking-wider uppercase font-medium">Total</p>
              <p className="text-2xl font-semibold text-white/90 mt-2">{total}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/30 tracking-wider uppercase font-medium">Today</p>
              <p className="text-2xl font-semibold text-white/90 mt-2">{todayCount}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/30 tracking-wider uppercase font-medium">This Week</p>
              <p className="text-2xl font-semibold text-white/90 mt-2">{weekCount}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/30 tracking-wider uppercase font-medium">WORM</p>
              <p className="text-sm text-white/80 mt-2">Immutable</p>
            </div>
          </div>

          {logs.length > 0 ? (
            <AuditTable
              initialLogs={logs}
              initialTotal={total}
              tenantId={tenantId}
            />
          ) : (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">No audit logs yet</h3>
                  <p className="text-sm text-white/50 max-w-md">Administrative actions will appear here</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
