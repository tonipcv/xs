import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'XASE AI - Checkpoints',
  description: 'Integrity anchors with KMS signature',
};

export default async function CheckpointsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();
  
  let checkpoints: any[] = [];
  let totalCheckpoints = 0;
  let signedCheckpoints = 0;
  let lastCheckpoint: Date | null = null;

  if (tenantId) {
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
      <div className="min-h-screen bg-[#0a0a0a]">
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
                  ? new Date(lastCheckpoint).toLocaleString('pt-BR', {
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
            <h2 className="text-base font-semibold text-white mb-4">
              Configuração
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">Checkpoint Automático</p>
                  <p className="text-xs text-white/50">Executar a cada 1 hora</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Ativo</span>
                  <div className="w-10 h-6 bg-white/[0.06] rounded-full relative" />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">KMS Provider</p>
                  <p className="text-xs text-white/50">Mock (desenvolvimento)</p>
                </div>
                <span className="text-xs px-2 py-1 bg-white/[0.06] text-white/80 rounded">Dev Mode</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">Algoritmo</p>
                  <p className="text-xs text-white/50">RSA-SHA256</p>
                </div>
                <span className="text-xs text-white/40">KMS</span>
              </div>
            </div>
          </div>

          {checkpoints.length > 0 ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">CHECKPOINT #</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">CHECKPOINT ID</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">RECORDS</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">ALGORITHM</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">TIMESTAMP</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {checkpoints.map((cp) => (
                    <tr key={cp.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-sm text-white font-mono">#{cp.checkpointNumber}</td>
                      <td className="px-6 py-4 text-sm text-white/80 font-mono">{cp.checkpointId.substring(0, 16)}...</td>
                      <td className="px-6 py-4 text-sm text-white/80">{cp.recordCount}</td>
                      <td className="px-6 py-4 text-sm text-white/80">{cp.signatureAlgo || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-white/80">
                        {new Date(cp.timestamp).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded ${cp.isVerified ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                          {cp.isVerified ? 'Verified' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
