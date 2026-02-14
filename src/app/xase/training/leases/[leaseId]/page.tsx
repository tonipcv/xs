// @ts-nocheck
import { AppLayout } from '@/components/AppSidebar';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/rbac';
import Link from 'next/link';

export default async function LeaseDetailPage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const context = await requireClient();
  const tenantId = context.tenantId;

  if (!tenantId) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-[1200px] mx-auto px-8 py-8">
            <p className="text-gray-600">No tenant found</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const lease = await prisma.voiceAccessLease.findFirst({
    where: { leaseId, clientTenantId: tenantId },
    include: {
      policy: {
        select: {
          policyId: true,
          usagePurpose: true,
          expiresAt: true,
          dataset: {
            select: { datasetId: true, name: true, primaryLanguage: true },
          },
        },
      },
    },
  });

  if (!lease) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-[1200px] mx-auto px-8 py-8">
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <h1 className="text-lg font-semibold text-gray-900">Lease not found</h1>
              <p className="text-sm text-gray-600 mt-1">This lease either does not exist or you do not have access.</p>
              <Link href="/xase/training" className="inline-block mt-4 text-sm text-gray-700 underline">Back to Training</Link>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Lease {lease.leaseId}</h1>
            <p className="text-sm text-gray-600">Details and actions</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Status</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{lease.status}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Issued</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{new Date(lease.issuedAt).toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Expires</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{new Date(lease.expiresAt).toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Policy</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-800">
              <div>
                <span className="text-gray-600">Policy ID: </span>
                <span className="font-mono">{lease.policy.policyId}</span>
              </div>
              <div>
                <span className="text-gray-600">Usage Purpose: </span>
                <span>{lease.policy.usagePurpose}</span>
              </div>
              <div>
                <span className="text-gray-600">Policy Expires: </span>
                <span>{lease.policy.expiresAt ? new Date(lease.policy.expiresAt).toLocaleString() : '—'}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Dataset</h2>
            <div className="text-sm text-gray-800">
              <p className="font-medium">{lease.policy.dataset.name}</p>
              <p className="text-xs text-gray-600">{lease.policy.dataset.primaryLanguage}</p>
              <Link href={`/xase/voice/datasets/${lease.policy.dataset.datasetId}`} className="inline-block mt-2 text-sm text-gray-700 underline">
                View dataset
              </Link>
            </div>
          </div>

          <div>
            <Link href="/xase/training" className="text-sm text-gray-700 underline">Back to Training</Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
