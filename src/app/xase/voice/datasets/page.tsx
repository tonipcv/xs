import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { Playfair_Display } from 'next/font/google';
import Link from 'next/link';
import { Database, Cloud, ArrowRight } from 'lucide-react';
import { DatasetCard } from '@/components/xase/DatasetCard';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

function providerToSlug(provider: string): string {
  switch (provider) {
    case 'AWS_S3':
      return 'aws-s3';
    case 'GCS':
      return 'gcs';
    case 'AZURE_BLOB':
      return 'azure-blob';
    case 'SNOWFLAKE':
      return 'snowflake';
    case 'BIGQUERY':
      return 'bigquery';
    default:
      return provider.toLowerCase();
  }
}


export default async function DatasetsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();

  let datasets: any[] = [];
  let integrations: any[] = [];
  let activeIntegrations: any[] = [];
  if (tenantId) {
    datasets = await prisma.dataset.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        datasetId: true,
        name: true,
        description: true,
        primaryLanguage: true,
        status: true,
        processingStatus: true,
        totalDurationHours: true,
        numRecordings: true,
        consentStatus: true,
        createdAt: true,
        publishedAt: true,
      },
    });

    integrations = await prisma.cloudIntegration.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        provider: true,
        status: true,
        createdAt: true,
      },
    });
    activeIntegrations = integrations.filter((i) => i.status === 'ACTIVE');
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="space-y-1">
            <h1 className={`${heading.className} text-2xl font-semibold text-gray-900 tracking-tight`}>
              Datasets
            </h1>
          </div>

          {/* Removed step-by-step section for a cleaner, enterprise feel */}

          {/* Quick actions (subtle links) */}
          <div className="flex items-center gap-3 text-sm">
            <Link href="/xase/data-holder/connectors" className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline">Manage integrations</Link>
            <span className="text-gray-300">•</span>
            <Link href="/xase/voice/datasets/new" className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline">Connect dataset</Link>
          </div>

          {/* Active Integrations */}
          {integrations.filter((i) => i.status === 'ACTIVE').length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium text-gray-500 tracking-wide uppercase">Connected integrations</h2>
                <Link href="/xase/data-holder/connectors" className="text-xs text-gray-500 hover:text-gray-800">Manage</Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {integrations.filter((i) => i.status === 'ACTIVE').map((intg) => (
                  <div key={intg.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{intg.name || intg.provider}</div>
                        <div className="text-[11px] text-gray-600 mt-0.5">{intg.provider}</div>
                      </div>
                      <span className="ml-2 px-2 py-0.5 rounded border border-gray-200 text-[10px] text-gray-600 whitespace-nowrap">
                        {intg.status}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                      <Link href={`/xase/voice/datasets/browse?integrationId=${intg.id}`} className="text-xs text-gray-700 hover:text-gray-900 underline">
                        Browse
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connected Datasets */}
          {datasets.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium text-gray-500 tracking-wide uppercase">Connected datasets</h2>
                <span className="text-xs text-gray-400">{datasets.length} connected</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {datasets.map((ds) => (
                  <DatasetCard key={ds.datasetId} ds={ds} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
}
