import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { Playfair_Display } from 'next/font/google';
import Link from 'next/link';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });


export default async function PoliciesPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();

  let policies: any[] = [];
  if (tenantId) {
    policies = await prisma.accessPolicy.findMany({
      where: {
        OR: [
          { dataset: { tenantId } },
          { clientTenantId: tenantId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        dataset: {
          select: {
            datasetId: true,
            name: true,
            tenantId: true,
          },
        },
        clientTenant: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>
                Access Policies
              </h1>
              <p className="text-sm text-gray-600 tabular-nums">
                {policies.length} polic{policies.length !== 1 ? 'ies' : 'y'} total
              </p>
            </div>
            <div>
              <Link
                href="/app/policies/new"
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm text-white transition-colors inline-block"
              >
                + Create Policy
              </Link>
            </div>
          </div>

          {/* Policies Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Dataset</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Client</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Purpose</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Max Hours</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Consumed</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Price/Hour</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Expires</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.length > 0 ? (
                    policies.map((policy) => {
                      const isOwner = policy.dataset.tenantId === tenantId;
                      return (
                        <tr
                          key={policy.id}
                          className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-2 text-xs text-gray-900">
                            <Link
                              href={`/app/datasets/${policy.dataset.datasetId}`}
                              className="hover:text-gray-900 underline"
                            >
                              {policy.dataset.name}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600">
                            {policy.clientTenant.name}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <span className={`px-2 py-0.5 rounded border border-gray-200 text-[10px] text-gray-600`}>{policy.status}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 max-w-[200px] truncate">
                            {policy.usagePurpose}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 tabular-nums">
                            {policy.maxHours || '∞'}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 tabular-nums">
                            {policy.hoursConsumed.toFixed(2)}h
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 tabular-nums">
                            ${policy.pricePerHour?.toString() || '0'}/{policy.currency}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 tabular-nums">
                            {policy.expiresAt
                              ? new Date(policy.expiresAt).toLocaleDateString()
                              : 'Never'}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <div className="flex items-center gap-3">
                              <Link
                                href={`/app/policies/${policy.policyId}/test`}
                                className="text-gray-700 hover:text-gray-900 underline"
                              >
                                Test Access
                              </Link>
                              {isOwner && policy.status === 'ACTIVE' && (
                                <button className="text-gray-600 hover:text-gray-800 text-xs">
                                  Revoke
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-xs text-gray-500">
                        No policies yet. <button className="underline hover:text-gray-800">Create your first policy</button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Active Policies</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">
                {policies.filter((p) => p.status === 'ACTIVE').length}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Total Hours Granted</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">
                {policies
                  .filter((p) => p.status === 'ACTIVE')
                  .reduce((sum, p) => sum + (p.maxHours || 0), 0)
                  .toFixed(2)}
                h
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Total Hours Consumed</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">
                {policies.reduce((sum, p) => sum + p.hoursConsumed, 0).toFixed(2)}h
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
