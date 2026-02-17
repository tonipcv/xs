import { Metadata } from 'next';
import { requireSupplier } from '@/lib/rbac';
import { AppLayout } from '@/components/AppSidebar';
import { prisma } from '@/lib/prisma';
import { Playfair_Display } from 'next/font/google';
import { LeasesTable } from './LeasesTable';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });


export default async function LeasesPage() {
  const context = await requireSupplier();
  const tenantId = context.tenantId;

  const now = new Date();

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

  const [leases, total, activeCount, expiredTodayCount] = await prisma.$transaction([
    prisma.voiceAccessLease.findMany({
      where: {
        policy: {
          dataset: { tenantId },
        },
      },
      orderBy: { issuedAt: 'desc' },
      take: 50,
      include: {
        policy: {
          select: {
            policyId: true,
            dataset: {
              select: {
                datasetId: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.voiceAccessLease.count({
      where: {
        policy: {
          dataset: { tenantId },
        },
      },
    }),
    prisma.voiceAccessLease.count({
      where: {
        policy: {
          dataset: { tenantId },
        },
        status: 'ACTIVE',
      },
    }),
    prisma.voiceAccessLease.count({
      where: {
        policy: {
          dataset: { tenantId },
        },
        status: 'EXPIRED',
        expiresAt: {
          gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          lte: now,
        },
      },
    }),
  ]);

  const revokedCount = await prisma.voiceAccessLease.count({
    where: {
      policy: {
        dataset: { tenantId },
      },
      status: 'REVOKED',
    },
  });

  const serializedLeases = leases.map((lease) => ({
    ...lease,
    issuedAt: lease.issuedAt.toISOString(),
    expiresAt: lease.expiresAt.toISOString(),
    revokedAt: lease.revokedAt?.toISOString() || null,
  }));

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h1 className={`${heading.className} text-2xl font-semibold text-gray-900 tracking-tight`}>
                Lease Management
              </h1>
              <p className="text-sm text-gray-600">
                Monitor and control training data access leases
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <p className="text-[10px] text-gray-500 tracking-wider uppercase font-medium">Total Leases</p>
              <p className="text-2xl font-semibold text-gray-900 mt-2 tabular-nums">{total}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <p className="text-[10px] text-gray-500 tracking-wider uppercase font-medium">Active</p>
              <p className="text-2xl font-semibold text-gray-900 mt-2 tabular-nums">{activeCount}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <p className="text-[10px] text-gray-500 tracking-wider uppercase font-medium">Expired Today</p>
              <p className="text-2xl font-semibold text-gray-900 mt-2 tabular-nums">{expiredTodayCount}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <p className="text-[10px] text-gray-500 tracking-wider uppercase font-medium">Revoked</p>
              <p className="text-2xl font-semibold text-gray-900 mt-2 tabular-nums">{revokedCount}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-xs font-medium text-gray-700 mb-1">Lease Controls</h3>
            <p className="text-xs text-gray-600">
              Active leases grant real-time streaming access to your datasets. Revoke a lease to immediately terminate access.
              Leases automatically expire based on their TTL.
            </p>
          </div>

          {serializedLeases.length > 0 ? (
            <LeasesTable
              initialLeases={serializedLeases}
              initialTotal={total}
              tenantId={tenantId}
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">No leases yet</h3>
                <p className="text-sm text-gray-600 max-w-md">
                  Leases will appear here when AI labs request access to your datasets for training.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
