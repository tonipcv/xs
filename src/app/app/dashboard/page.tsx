import { AppLayout } from '@/components/AppSidebar';
import Link from 'next/link';
import { Playfair_Display } from 'next/font/google';
import { requireAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const isSupplier = ctx.organizationType === 'SUPPLIER';

  // Defensive lightweight metrics (safe defaults on failure)
  let metrics = { a: 0, b: 0, c: 0 } as { a: number; b: number; c: number };
  try {
    if (isSupplier) {
      // Supplier: datasets count, active policies, active leases
      const [ds, ledger, leases] = await Promise.all([
        prisma.dataset.count({ where: { tenantId: ctx.tenantId || undefined } }),
        prisma.voiceAccessLease.count({ where: { policy: { dataset: { tenantId: ctx.tenantId || undefined } }, status: 'ACTIVE' as any } }),
        prisma.creditLedger.count({ where: { tenantId: ctx.tenantId || undefined } }).catch(() => Promise.resolve(0)),
      ]);
      metrics = { a: ds, b: leases, c: ledger };
    } else {
      // Client: active leases, executions, policies available
      const [leases, logs] = await Promise.all([
        prisma.voiceAccessLease.count({ where: { clientTenantId: ctx.tenantId || undefined, status: 'ACTIVE' as any } }),
        prisma.voiceAccessLog.count({ where: { clientTenantId: ctx.tenantId || undefined } }).catch(() => Promise.resolve(0)),
      ]);
      metrics = { a: leases, b: logs, c: 0 };
    }
  } catch {
    // keep defaults on any failure
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-8 py-10 space-y-8">
          <div className="space-y-1">
            <h1 className={`${heading.className} text-2xl font-semibold text-gray-900`}>{isSupplier ? 'Data Holder Dashboard' : 'AI Lab Dashboard'}</h1>
            <p className="text-sm text-gray-600">{isSupplier ? 'Manage datasets, policies and governed access revenue.' : 'Discover offers, train models and manage leases.'}</p>
          </div>

          {/* KPI cards */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">{isSupplier ? 'Datasets' : 'Active Leases'}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{metrics.a}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">{isSupplier ? 'Active Leases' : 'Activity Logs'}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{metrics.b}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">{isSupplier ? 'Ledger Entries' : 'Available Policies'}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{metrics.c}</p>
            </div>
          </div>

          {/* Quick links */}
          {isSupplier ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Link href="/app/datasets" className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Datasets</h3>
                <p className="text-xs text-gray-600">Manage and explore your datasets</p>
              </Link>
              <Link href="/app/policies" className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Policies</h3>
                <p className="text-xs text-gray-600">Control access to your data</p>
              </Link>
              <Link href="/app/marketplace" className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Marketplace</h3>
                <p className="text-xs text-gray-600">Publish and browse access offers</p>
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <Link href="/app/marketplace" className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Marketplace</h3>
                <p className="text-xs text-gray-600">Find governed access offers</p>
              </Link>
              <Link href="/app/training" className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Training</h3>
                <p className="text-xs text-gray-600">Run lab experiments</p>
              </Link>
              <Link href="/app/leases" className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Leases</h3>
                <p className="text-xs text-gray-600">Manage your active access</p>
              </Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
