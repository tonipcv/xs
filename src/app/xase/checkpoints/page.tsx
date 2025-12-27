import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { CheckpointsTable } from './CheckpointsTable';

export const metadata: Metadata = {
  title: 'Xase Checkpoints',
  description: 'Integrity anchors with KMS signature and enterprise filtering',
};

export default async function CheckpointsPage() {
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
              <h1 className="text-2xl font-semibold text-white tracking-tight">Checkpoints</h1>
              <p className="text-sm text-white/50">No tenant found</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  let checkpoints: any[] = [];
  let totalCheckpoints = 0;
  let signedCheckpoints = 0;
  let lastCheckpoint: Date | null = null;

  {
    [checkpoints, totalCheckpoints, signedCheckpoints] = await Promise.all([
      prisma.checkpointRecord.findMany({
        where: { tenantId },
        orderBy: { checkpointNumber: 'desc' },
        take: 20,
        select: {
          id: true,
          checkpointId: true,
          checkpointNumber: true,
          recordCount: true,
          isVerified: true,
          timestamp: true,
          signatureAlgo: true,
        },
      }),
      prisma.checkpointRecord.count({ where: { tenantId } }),
      prisma.checkpointRecord.count({
        where: { tenantId, signature: { not: null } },
      }),
    ]);

    const last = await prisma.checkpointRecord.findFirst({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    lastCheckpoint = last?.timestamp || null;
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">
                Checkpoints
              </h1>
              <p className="text-sm text-white/50">
                Integrity anchors with KMS signature
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/40 tracking-wider">TOTAL</p>
              <p className="text-3xl font-semibold text-white">{totalCheckpoints}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/40 tracking-wider">SIGNED</p>
              <p className="text-3xl font-semibold text-white">{signedCheckpoints}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/40 tracking-wider">LAST CHECKPOINT</p>
              <p className="text-sm text-white">
                {lastCheckpoint
                  ? new Date(lastCheckpoint).toLocaleString('en-US', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Never'}
              </p>
            </div>
          </div>

          {/* Checkpoint Configuration */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">Configuration</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">Automatic Checkpoint</p>
                  <p className="text-xs text-white/50">Run every 1 hour</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Active</span>
                  <div className="w-10 h-6 bg-white/[0.06] rounded-full relative" />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">KMS Provider</p>
                  <p className="text-xs text-white/50">Mock (development)</p>
                </div>
                <span className="text-xs px-2 py-1 bg-white/[0.06] text-white/80 rounded">Dev Mode</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">Algorithm</p>
                  <p className="text-xs text-white/50">RSA-SHA256</p>
                </div>
                <span className="text-xs text-white/40">KMS</span>
              </div>
            </div>
          </div>

          {checkpoints.length > 0 ? (
            <CheckpointsTable
              initialCheckpoints={checkpoints}
              initialTotal={totalCheckpoints}
              tenantId={tenantId}
            />
          ) : (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">No checkpoints yet</h3>
                  <p className="text-sm text-white/50 max-w-md">Checkpoints are created automatically every hour</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
