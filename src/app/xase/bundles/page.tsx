import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { Playfair_Display } from 'next/font/google';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { BundlesTable } from './BundlesTable';

export const metadata: Metadata = {
  title: 'Evidence Bundles',
  description: 'Compliance-ready evidence packages with cryptographic signatures',
};

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] });

export default async function EvidenceBundlesPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();
  
  if (!tenantId) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-[#0e0f12]">
          <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
            <div className="space-y-2">
              <h1 className={`${heading.className} text-2xl font-semibold text-white/90 tracking-tight`}>Evidence Bundles</h1>
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
      <div className="min-h-screen bg-[#0e0f12]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h1 className={`${heading.className} text-2xl font-semibold text-white/90 tracking-tight`}>
                Evidence Bundles
              </h1>
              <p className="text-sm text-white/60">
                Court-ready evidence packages with cryptographic integrity
              </p>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-6">
              <p className="text-[10px] text-white/50 tracking-wider uppercase font-medium">Total Bundles</p>
              <p className="text-2xl font-semibold text-white/90 mt-2">{total}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-6">
              <p className="text-[10px] text-white/50 tracking-wider uppercase font-medium">Ready</p>
              <p className="text-2xl font-semibold text-white/90 mt-2">{readyCount}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-6">
              <p className="text-[10px] text-white/50 tracking-wider uppercase font-medium">Pending</p>
              <p className="text-2xl font-semibold text-white/90 mt-2">{pendingCount}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-6">
              <p className="text-[10px] text-white/50 tracking-wider uppercase font-medium">Compliance</p>
              <p className="text-sm text-white/80 mt-2">SOC2 Ready</p>
            </div>
          </div>

          {/* Compliance Notice */}
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-4">
            <h3 className="text-xs font-medium text-white/80 mb-1">Compliance & Legal Holds</h3>
            <p className="text-xs text-white/60">
              Evidence bundles are cryptographically signed and tamper-evident. All downloads are audited. Bundles include offline verification scripts for legal proceedings.
            </p>
          </div>

          {bundles.length > 0 ? (
            <BundlesTable
              initialBundles={bundles}
              initialTotal={total}
              tenantId={tenantId}
            />
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <h3 className="text-lg font-semibold text-white/90">No evidence bundles yet</h3>
                <p className="text-sm text-white/60 max-w-md">
                  Create your first evidence bundle to package decision records for legal and compliance purposes.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
