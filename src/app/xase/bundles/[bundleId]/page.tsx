import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AppLayout } from '@/components/AppSidebar';
import Link from 'next/link';
import { getTenantContext } from '@/lib/xase/server-auth';

export const metadata: Metadata = {
  title: 'Evidence Bundle Details',
  description: 'Timeline, download history, and verification instructions for an evidence bundle',
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    READY: 'bg-green-500/10 text-green-400 border-green-500/20',
    PROCESSING: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    FAILED: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const cls = map[status] || 'bg-white/[0.06] text-white/60 border-white/[0.08]';
  return <span className={`text-xs px-2 py-1 rounded border ${cls}`}>{status}</span>;
}

export default async function BundleDetailsPage({ params }: { params: Promise<{ bundleId: string }> }) {
  const { bundleId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  const ctx = await getTenantContext();
  if (!ctx.tenantId) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-[#121316]">
          <div className="max-w-[1200px] mx-auto px-8 py-8">
            <h1 className="text-xl font-semibold text-white">Evidence Bundle</h1>
            <p className="text-sm text-white/60 mt-2">No tenant found.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const tenantId = ctx.tenantId;
  const bundle = await prisma.evidenceBundle.findFirst({
    where: { bundleId, tenantId },
    select: {
      id: true,
      bundleId: true,
      status: true,
      purpose: true,
      description: true,
      recordCount: true,
      createdAt: true,
      completedAt: true,
      dateFrom: true,
      dateTo: true,
      storageKey: true,
      storageUrl: true,
      bundleSize: true,
      bundleHash: true,
      legalHold: true,
      retentionUntil: true,
      expiresAt: true,
      createdBy: true,
    },
  });

  if (!bundle) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-[#121316]">
          <div className="max-w-[1200px] mx-auto px-8 py-8">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-red-300">Bundle not found or you do not have access.</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const downloads = await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: 'BUNDLE_DOWNLOAD',
      resourceType: 'EVIDENCE_BUNDLE',
      resourceId: bundle.bundleId,
      status: 'SUCCESS',
    },
    select: {
      id: true,
      userId: true,
      timestamp: true,
      metadata: true,
    },
    orderBy: { timestamp: 'desc' },
    take: 100,
  });

  const createdItem = { label: 'Created', ts: bundle.createdAt, note: `By ${bundle.createdBy}` };
  const completedItem = bundle.completedAt ? { label: bundle.status === 'READY' ? 'Ready' : 'Completed', ts: bundle.completedAt, note: `Status: ${bundle.status}` } : null;

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-white tracking-tight">Evidence Bundle</h1>
                <StatusBadge status={bundle.status} />
              </div>
              <p className="text-sm text-white/60 font-mono">{bundle.bundleId}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40">Tenant</p>
              <p className="text-sm text-white/70 font-mono">{tenantId}</p>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5 space-y-2">
              <p className="text-[10px] text-white/40 tracking-wider">PURPOSE</p>
              <p className="text-sm text-white">{bundle.purpose || 'N/A'}</p>
              {bundle.description && <p className="text-xs text-white/60">{bundle.description}</p>}
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5 space-y-2">
              <p className="text-[10px] text-white/40 tracking-wider">RECORDS</p>
              <p className="text-sm text-white">{bundle.recordCount?.toLocaleString() || 0}</p>
              {(bundle.dateFrom || bundle.dateTo) && (
                <p className="text-xs text-white/60">{bundle.dateFrom ? new Date(bundle.dateFrom).toLocaleDateString() : '—'} → {bundle.dateTo ? new Date(bundle.dateTo).toLocaleDateString() : '—'}</p>
              )}
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5 space-y-2">
              <p className="text-[10px] text-white/40 tracking-wider">RETENTION</p>
              <p className="text-xs text-white/70">Legal Hold: <span className={bundle.legalHold ? 'text-green-400' : 'text-white/60'}>{String(!!bundle.legalHold).toUpperCase()}</span></p>
              <p className="text-xs text-white/70">Retention Until: {bundle.retentionUntil ? new Date(bundle.retentionUntil).toLocaleString() : '—'}</p>
              <p className="text-xs text-white/70">Expires At: {bundle.expiresAt ? new Date(bundle.expiresAt).toLocaleString() : '—'}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Status Timeline</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-white/60 mt-1.5" />
                <div>
                  <p className="text-sm text-white">{createdItem.label}</p>
                  <p className="text-xs text-white/60">{new Date(createdItem.ts).toLocaleString()} • {createdItem.note}</p>
                </div>
              </div>
              {completedItem && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-white/60 mt-1.5" />
                  <div>
                    <p className="text-sm text-white">{completedItem.label}</p>
                    <p className="text-xs text-white/60">{new Date(completedItem.ts!).toLocaleString()} • {completedItem.note}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Download history */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Download History</h3>
            {downloads.length === 0 ? (
              <p className="text-xs text-white/60">No downloads yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="text-left px-4 py-2 text-xs font-medium text-white/50 tracking-wider">WHEN</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-white/50 tracking-wider">USER</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-white/50 tracking-wider">DETAILS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downloads.map((d) => {
                      let details: any = null;
                      try { details = d.metadata ? JSON.parse(d.metadata as any) : null; } catch {}
                      return (
                        <tr key={d.id} className="border-b border-white/[0.06]">
                          <td className="px-4 py-2 text-sm text-white/80">{new Date(d.timestamp).toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm text-white/80">{d.userId || '—'}</td>
                          <td className="px-4 py-2 text-xs text-white/60">{details?.storageKey ? `storage: ${details.storageKey}` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Verification instructions */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Verification Instructions</h3>
            <p className="text-xs text-white/70">To verify integrity offline:</p>
            <pre className="bg-black/40 border border-white/[0.08] rounded p-3 text-xs text-white/80 overflow-auto"><code>{`unzip evidence-bundle-${bundle.bundleId}.zip
cd evidence-bundle-${bundle.bundleId}
node verify.js`}</code></pre>
            <p className="text-xs text-white/60">Expected output: <span className="text-green-400">"✅ VERIFICATION PASSED"</span>. If it fails, the bundle may have been tampered with.</p>
          </div>

          {/* Back */}
          <div>
            <Link href="/xase/bundles" className="text-xs text-white/60 hover:text-white/80">← Back to Bundles</Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
