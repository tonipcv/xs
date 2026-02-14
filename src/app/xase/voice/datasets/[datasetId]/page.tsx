// @ts-nocheck
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { Playfair_Display } from 'next/font/google';
import Link from 'next/link';
import { CopyButton } from '@/components/xase/CopyButton';
import { DatasetNameEditor } from '@/components/xase/DatasetNameEditor';
import { PublishAccessOfferLink } from '@/components/xase/PublishAccessOfferLink';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });


export default async function DatasetDetailPage({ params }: { params: Promise<{ datasetId: string }> }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();
  const { datasetId } = await params;

  if (!tenantId) {
    redirect('/login');
  }

  // Fetch dataset by public ID (not gated by tenant here)
  const dataset = await prisma.dataset.findFirst({
    where: { datasetId },
    select: {
      id: true,
      tenantId: true,
      datasetId: true,
      name: true,
      description: true,
      primaryLanguage: true,
      version: true,
      consentStatus: true,
      status: true,
      processingStatus: true,
      totalDurationHours: true,
      numRecordings: true,
      primarySampleRate: true,
      primaryCodec: true,
      primaryChannelCount: true,
      totalSizeBytes: true,
      createdAt: true,
      publishedAt: true,
    },
  });

  // Determine access: owner or client with active policy/execution
  let isOwner = false;
  let hasClientAccess = false;
  if (dataset) {
    isOwner = dataset.tenantId === tenantId;
    if (!isOwner && tenantId) {
      const exec = await prisma.policyExecution.findFirst({
        where: {
          buyerTenantId: tenantId,
          policy: { is: { datasetId: dataset.id } },
          deletedAt: null,
          revokedAt: null,
          completedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      hasClientAccess = Boolean(exec);
    }
  }

  // Helper to format bytes
  function formatBytes(bytes?: bigint | number | null): string {
    const n = Number(bytes || 0)
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
    return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  // Active cloud integrations for this tenant (to drive 'Connect Data' action)
  const activeIntegrations = await prisma.cloudIntegration.findMany({
    where: { tenantId, status: 'ACTIVE' },
    select: { id: true, name: true, provider: true },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch current data sources for this dataset
  const sourcesRaw = await prisma.dataSource.findMany({
    where: { datasetId: dataset?.id },
    select: {
      id: true,
      cloudIntegrationId: true,
      name: true,
      storageLocation: true,
      numRecordings: true,
      durationHours: true,
      sizeBytes: true,
      cloudIntegration: { select: { name: true, provider: true, status: true } },
    },
    orderBy: { addedAt: 'desc' },
  });

  // Deduplicate by (cloudIntegrationId, storageLocation), keep the newest
  const _seen = new Set<string>();
  const sources = sourcesRaw.filter((s) => {
    const key = `${s.cloudIntegrationId}::${s.storageLocation}`;
    if (_seen.has(key)) return false;
    _seen.add(key);
    return true;
  });

  if (!dataset) {
    notFound();
  }

  // Policies relacionadas
  const policies = await prisma.voiceAccessPolicy.findMany({
    where: { datasetId: dataset.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      clientTenant: {
        select: { name: true, id: true },
      },
    },
  });

  // Access logs recentes
  const accessLogs = await prisma.voiceAccessLog.findMany({
    where: { datasetId: dataset.id },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <Link
                  href="/xase/voice/datasets"
                  className="text-gray-600 hover:text-gray-800 text-sm"
                >
                  ← Datasets
                </Link>
              </div>
              <DatasetNameEditor datasetId={dataset.datasetId} initialName={dataset.name} />
              <p className="text-sm text-gray-500 font-mono">ID: {dataset.datasetId}</p>
            </div>
            <div className="flex gap-2">
              {isOwner && (
                <>
                  <PublishAccessOfferLink
                    datasetId={dataset.datasetId}
                    datasetName={dataset.name}
                    datasetLanguage={dataset.primaryLanguage || 'en-US'}
                    datasetJurisdiction="US"
                  />
                  {dataset.status === 'DRAFT' && dataset.processingStatus === 'COMPLETED' && (
                    <button className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm transition-colors">
                      Publish Dataset
                    </button>
                  )}
                  {activeIntegrations.length > 0 ? (
                    <Link
                      href={`/xase/voice/datasets/browse?integrationId=${activeIntegrations[0].id}&datasetId=${dataset.datasetId}`}
                      className="rounded-full border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 h-9 px-4 py-2 text-sm transition-colors"
                    >
                      Connect Data
                    </Link>
                  ) : (
                    <Link
                      href={`/xase/data-holder/connectors`}
                      className="rounded-full border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 h-9 px-4 py-2 text-sm transition-colors"
                    >
                      Connect Data
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Compact Summary */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <span className="px-2 py-0.5 rounded border border-gray-200 text-[11px] text-gray-700">{dataset.status}</span>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-xs text-gray-600">Recordings</span>
            <span className="text-sm font-mono text-gray-900">{dataset.numRecordings || 0}</span>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-xs text-gray-600">Duration</span>
            <span className="text-sm font-mono text-gray-900">{Number(dataset.totalDurationHours || 0).toFixed(2)}h</span>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-xs text-gray-600">Total Size</span>
            <span className="text-sm font-mono text-gray-900">{formatBytes(dataset.totalSizeBytes || 0)}</span>
          </div>

          {/* Dataset Details */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className={`${heading.className} text-xl font-semibold text-gray-900 tracking-tight mb-4`}>
              Dataset Information
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">Language</p>
                <p className="text-sm text-gray-900 font-mono">{dataset.primaryLanguage}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-gray-500 mb-1">Total Size</p>
                <p className="text-sm text-gray-900 font-mono">{formatBytes(dataset.totalSizeBytes || 0)}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-900">{dataset.description || 'No description'}</p>
              </div>
            </div>
          </div>

          {/* Data Sources (visible only to owner) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`${heading.className} text-base font-semibold text-gray-900`}>
                Data Sources
              </h2>
              {isOwner && activeIntegrations.length > 0 ? (
                <Link
                  href={`/xase/voice/datasets/browse?integrationId=${activeIntegrations[0].id}`}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Connect Data
                </Link>
              ) : isOwner ? (
                <Link
                  href={`/xase/data-holder/connectors`}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Setup Integration
                </Link>
              ) : null}
            </div>

            {isOwner && (
              <div className="bg-white border border-gray-200 rounded-xl">
                {sources.length === 0 ? (
                  <div className="p-6 text-sm text-gray-600">No data sources yet.</div>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {sources.map((s) => (
                      <li key={s.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{s.name || s.storageLocation}</div>
                            <div className="text-xs text-gray-600 mt-1">
                              {s.cloudIntegration?.provider} • {s.cloudIntegration?.name}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 font-mono break-all">
                              {s.storageLocation}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-600">Files: {s.numRecordings || 0}</div>
                            <div className="text-xs text-gray-600">Size: {formatBytes(s.sizeBytes || 0)}</div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
