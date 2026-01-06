import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { BundlesTable } from './BundlesTable';

export const metadata: Metadata = {
  title: 'Evidence Bundles',
  description: 'Compliance-ready evidence packages with cryptographic signatures',
};

export default async function EvidenceBundlesPage() {
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
              <h1 className="text-2xl font-semibold text-white tracking-tight">Evidence Bundles</h1>
              <p className="text-sm text-white/50">No tenant found</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Fetch bundles and statistics using transaction to avoid connection pool issues
  const [bundles, total, readyCount, pendingCount] = await prisma.$transaction([
    prisma.evidenceBundle.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        bundleId: true,
        status: true,
        recordCount: true,
        purpose: true,
        createdBy: true,
        createdAt: true,
        completedAt: true,
        expiresAt: true,
        pdfReportUrl: true,
        legalFormat: true,
        bundleManifestHash: true,
      },
    }),
    prisma.evidenceBundle.count({ where: { tenantId } }),
    prisma.evidenceBundle.count({ where: { tenantId, status: 'READY' } }),
    prisma.evidenceBundle.count({ where: { tenantId, status: 'PENDING' } }),
  ]);

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">
                Evidence Bundles
              </h1>
              <p className="text-sm text-white/50">
                Compliance-ready evidence packages with cryptographic signatures
              </p>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/30 tracking-wider uppercase font-medium">Total Bundles</p>
              <p className="text-2xl font-semibold text-white/90 mt-2">{total}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/30 tracking-wider uppercase font-medium">Ready</p>
              <p className="text-2xl font-semibold text-emerald-400/90 mt-2">{readyCount}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/30 tracking-wider uppercase font-medium">Pending</p>
              <p className="text-2xl font-semibold text-amber-400/90 mt-2">{pendingCount}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-[10px] text-white/30 tracking-wider uppercase font-medium">Compliance</p>
              <p className="text-sm text-white/80 mt-2">SOC2 Ready</p>
            </div>
          </div>

          {/* Compliance Notice */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-4 h-4 rounded-full bg-white/[0.04] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-2.5 h-2.5 text-white/40" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-medium text-white/80 mb-1">Compliance & Legal Holds</h3>
                <p className="text-xs text-white/50">
                  Evidence bundles are cryptographically signed and tamper-evident. All downloads are audited. 
                  Bundles include offline verification scripts for legal proceedings.
                </p>
              </div>
            </div>
          </div>

          {bundles.length > 0 ? (
            <BundlesTable
              initialBundles={bundles}
              initialTotal={total}
              tenantId={tenantId}
            />
          ) : (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center">
                  <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">No evidence bundles yet</h3>
                  <p className="text-sm text-white/50 max-w-md">
                    Create your first evidence bundle to package decision records for compliance, audits, or legal requests
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
