import { AppLayout } from '@/components/AppSidebar';
import Link from 'next/link';
import { Playfair_Display } from 'next/font/google';
import { requireAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const isSupplier = ctx.organizationType === 'SUPPLIER';
  // Resolve display name (prefer user.name, fallback to email)
  const userRecord = await prisma.user.findUnique({ where: { email: ctx.userEmail }, select: { name: true } }).catch(() => null);
  const displayName = userRecord?.name || ctx.userEmail;

  // Defensive lightweight metrics (safe defaults on failure)
  let metrics = { a: 0, b: 0, c: 0 } as { a: number; b: number; c: number };
  // Recent data (safe defaults)
  let recentLeases: any[] = [];
  let recentActivity: any[] = [];
  try {
    if (isSupplier) {
      // Supplier: datasets count, active policies, active leases
      const [ds, ledger, leases] = await Promise.all([
        prisma.dataset.count({ where: { tenantId: ctx.tenantId || undefined } }),
        prisma.accessLease.count({ where: { policy: { dataset: { tenantId: ctx.tenantId || undefined } }, status: 'ACTIVE' as any } }),
        prisma.creditLedger.count({ where: { tenantId: ctx.tenantId || undefined } }).catch(() => Promise.resolve(0)),
      ]);
      metrics = { a: ds, b: leases, c: ledger };

      // Supplier recent leases (latest 5 for datasets owned by this tenant)
      recentLeases = await prisma.accessLease
        .findMany({
          where: { policy: { dataset: { tenantId: ctx.tenantId || undefined } } },
          orderBy: { issuedAt: 'desc' },
          take: 5,
          select: { id: true, status: true, issuedAt: true, clientTenantId: true },
        })
        .catch(() => Promise.resolve([] as any[]));

      // Supplier recent activity: show latest 5 logs for datasets owned by this tenant (if available)
      recentActivity = await prisma.accessLog
        .findMany({
          where: { policy: { dataset: { tenantId: ctx.tenantId || undefined } } } as any,
          orderBy: { timestamp: 'desc' },
          take: 5,
          select: { id: true, timestamp: true },
        })
        .catch(() => Promise.resolve([] as any[]));
    } else {
      // Client: active leases, executions, policies available
      const [leases, logs] = await Promise.all([
        prisma.accessLease.count({ where: { clientTenantId: ctx.tenantId || undefined, status: 'ACTIVE' as any } }),
        prisma.accessLog.count({ where: { clientTenantId: ctx.tenantId || undefined } }).catch(() => Promise.resolve(0)),
      ]);
      metrics = { a: leases, b: logs, c: 0 };

      // Client recent leases (latest 5 for this tenant)
      recentLeases = await prisma.accessLease
        .findMany({
          where: { clientTenantId: ctx.tenantId || undefined },
          orderBy: { issuedAt: 'desc' },
          take: 5,
          select: { id: true, status: true, issuedAt: true, policyId: true },
        })
        .catch(() => Promise.resolve([] as any[]));

      // Client recent activity logs (latest 5)
      recentActivity = await prisma.accessLog
        .findMany({
          where: { clientTenantId: ctx.tenantId || undefined },
          orderBy: { timestamp: 'desc' },
          take: 5,
          select: { id: true, timestamp: true },
        })
        .catch(() => Promise.resolve([] as any[]));
    }
  } catch {
    // keep defaults on any failure
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1600px] mx-auto px-6 md:px-10 py-10 space-y-8">
          <div className="space-y-1">
            <h1 className={`${heading.className} text-2xl font-semibold text-gray-900`}>Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome, {displayName}</p>
          </div>

          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Your Role</p>
              <p className="text-sm font-medium text-gray-900 mt-1">{isSupplier ? 'SUPPLIER' : 'CLIENT'}</p>
            </div>
          </div>

          {/* Quick links */}
          {isSupplier ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
              <Link href="/app/profile" className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Profile</h3>
                <p className="text-xs text-gray-600">Account, 2FA and organization</p>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
              <Link href="/app/profile" className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Profile</h3>
                <p className="text-xs text-gray-600">Account, 2FA and preferences</p>
              </Link>
            </div>
          )}

          {/* Extra panels */}
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-6 xl:col-span-2">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Insights</h3>
              <p className="text-xs text-gray-600">
                Track activity and governance at a glance. Use the cards above to jump to datasets, marketplace
                and training. More detailed analytics will appear here as you interact with the platform.
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Shortcuts</h3>
              <ul className="text-xs text-gray-700 space-y-2 list-disc pl-5">
                {isSupplier ? (
                  <>
                    <li><Link className="underline hover:no-underline" href="/app/policies">Create a new policy</Link></li>
                    <li><Link className="underline hover:no-underline" href="/app/marketplace">Publish an access offer</Link></li>
                  </>
                ) : (
                  <>
                    <li><Link className="underline hover:no-underline" href="/app/marketplace">Browse access offers</Link></li>
                    <li><Link className="underline hover:no-underline" href="/app/leases">Review active leases</Link></li>
                  </>
                )}
                <li><Link className="underline hover:no-underline" href="/app/profile">Manage profile & 2FA</Link></li>
              </ul>
            </div>
          </div>

          {/* Recent data */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Recent Leases</h3>
              {recentLeases.length === 0 ? (
                <p className="text-xs text-gray-600">No recent leases.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-gray-600">
                      <tr>
                        <th className="py-2 pr-4">Lease</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Created</th>
                        <th className="py-2 pr-4">Ref</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-900">
                      {recentLeases.map((l) => (
                        <tr key={l.id} className="border-t border-gray-100">
                          <td className="py-2 pr-4">{String(l.id).slice(-8)}</td>
                          <td className="py-2 pr-4"><span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">{l.status}</span></td>
                          <td className="py-2 pr-4">{l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '-'}</td>
                          <td className="py-2 pr-4">{l.clientTenantId || l.policyId || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Recent Activity</h3>
              {recentActivity.length === 0 ? (
                <p className="text-xs text-gray-600">No recent activity.</p>
              ) : (
                <ul className="text-xs text-gray-800 space-y-2">
                  {recentActivity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between border-t first:border-t-0 border-gray-100 pt-2">
                      <span>Log {String(a.id).slice(-8)}</span>
                      <span className="text-gray-600">{a.timestamp ? new Date(a.timestamp).toLocaleString() : '-'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Onboarding checklist intentionally removed to avoid fictitious status indicators */}
        </div>
      </div>
    </AppLayout>
  );
}
