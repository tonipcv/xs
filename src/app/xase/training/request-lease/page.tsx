import { Metadata } from 'next';
import { requireClient } from '@/lib/rbac';
import { AppLayout } from '@/components/AppSidebar';
import { prisma } from '@/lib/prisma';
import { Playfair_Display } from 'next/font/google';
import { LeaseRequestWizard } from './LeaseRequestWizard';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });


export default async function RequestLeasePage() {
  const context = await requireClient();
  const tenantId = context.tenantId;

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

  const availablePolicies = await prisma.voiceAccessPolicy.findMany({
    where: {
      status: 'ACTIVE',
      canStream: true,
      dataset: {
        status: 'ACTIVE',
      },
    },
    include: {
      dataset: {
        select: {
          datasetId: true,
          name: true,
          primaryLanguage: true,
          totalDurationHours: true,
          description: true,
        },
      },
    },
    orderBy: {
      dataset: {
        name: 'asc',
      },
    },
  });

  const serializedPolicies = availablePolicies.map((policy) => ({
    ...policy,
    // pricePerHour not yet in schema
    createdAt: policy.createdAt.toISOString(),
    revokedAt: policy.revokedAt?.toISOString() || null,
    dataset: {
      ...policy.dataset,
      language: policy.dataset.primaryLanguage,
      totalDurationHours: policy.dataset.totalDurationHours || 0,
    },
  }));

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-2">
            <h1 className={`${heading.className} text-xl font-medium text-gray-900 tracking-tight`}>
              Request Training Lease
            </h1>
            <p className="text-xs text-gray-600">
              Get time-limited access to stream training data
            </p>
          </div>

          {serializedPolicies.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <LeaseRequestWizard
                policies={serializedPolicies}
                tenantId={tenantId}
              />
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">No datasets available</h3>
                <p className="text-sm text-gray-600 max-w-md">
                  There are currently no datasets with active streaming policies. Check back later or contact data holders directly.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
