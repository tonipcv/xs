import { Metadata } from 'next';
import { requireSupplier } from '@/lib/rbac';
import { AppLayout } from '@/components/AppSidebar';
import { prisma } from '@/lib/prisma';
import { Playfair_Display } from 'next/font/google';
import Link from 'next/link';
import { VoiceOnboardingSection } from '@/components/xase/VoiceOnboardingSection';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });


export default async function VoiceDashboard() {
  const context = await requireSupplier();
  const tenantId = context.tenantId;

  // Stats via API de métricas (inline para server component)
  let totalDatasets = 0;
  let totalHoursProvided = 0;
  let hoursConsumed = 0;
  let revenue = 0;
  let activeClients = 0;
  let activeLeases = 0;
  let trainingJobsToday = 0;

  if (tenantId) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calcular métricas inline (mesma lógica da API)
    totalDatasets = await prisma.dataset.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    const datasetsAgg = await prisma.dataset.aggregate({
      where: { tenantId, status: 'ACTIVE' },
      _sum: { totalDurationHours: true },
    });
    totalHoursProvided = datasetsAgg._sum?.totalDurationHours || 0;

    const policiesAgg = await prisma.voiceAccessPolicy.aggregate({
      where: {
        dataset: { tenantId },
        status: 'ACTIVE',
      },
      _sum: { hoursConsumed: true },
    });
    hoursConsumed = policiesAgg._sum?.hoursConsumed || 0;

    const accessLogs = await prisma.voiceAccessLog.findMany({
      where: {
        dataset: { tenantId },
        outcome: 'GRANTED',
      },
      select: {
        hoursAccessed: true,
        policyId: true,
        requestId: true,
        timestamp: true,
      },
    });
    
    const policyIds = [...new Set(accessLogs.map(l => l.policyId))];
    // Pricing moved to AccessOffer. Find executions for these policies and get offer pricing.
    const executionsForPolicies = policyIds.length > 0
      ? await prisma.policyExecution.findMany({
          where: { policyId: { in: policyIds } },
          select: {
            policyId: true,
            offer: { select: { pricePerHour: true, currency: true } },
          },
        })
      : [];
    const priceMap = new Map<string, number>(
      executionsForPolicies
        .filter(e => e.offer?.pricePerHour != null)
        .map(e => [e.policyId, Number(e.offer!.pricePerHour)])
    );

    revenue = accessLogs.reduce((sum, log) => {
      const price = priceMap.get(log.policyId) || 0;
      return sum + (log.hoursAccessed * price);
    }, 0);

    const activePolicies = await prisma.voiceAccessPolicy.findMany({
      where: {
        dataset: { tenantId },
        status: 'ACTIVE',
      },
      select: { clientTenantId: true },
      distinct: ['clientTenantId'],
    });
    activeClients = activePolicies.length;

    // Active leases count
    activeLeases = await prisma.voiceAccessLease.count({
      where: {
        policy: {
          dataset: { tenantId },
        },
        status: 'ACTIVE',
      },
    });

    // Training jobs today (unique requestIds from today's streaming logs)
    const jobsToday = accessLogs.filter(log => 
      log.requestId && log.timestamp >= startOfToday
    );
    const uniqueJobIds = new Set(jobsToday.map(log => log.requestId));
    trainingJobsToday = uniqueJobIds.size;
  }

  // Datasets recentes
  let recentDatasets: any[] = [];
  if (tenantId) {
    recentDatasets = await prisma.dataset.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        datasetId: true,
        name: true,
        primaryLanguage: true,
        status: true,
        processingStatus: true,
        totalDurationHours: true,
        numRecordings: true,
        createdAt: true,
      },
    });
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Onboarding: show if not completed */}
          <VoiceOnboardingSection />
          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>
                  Dashboard
                </h1>
                <p className="text-sm text-gray-500">Manage voice datasets, policies, and access control</p>
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-700 leading-relaxed">
              {totalDatasets > 0
                ? `You have ${totalDatasets} dataset${totalDatasets !== 1 ? 's' : ''} with ${totalHoursProvided.toFixed(2)} hours of voice data. ${activeClients} active client${activeClients !== 1 ? 's' : 'client'}.`
                : 'No datasets yet. Create your first voice dataset to get started.'}
              {hoursConsumed > 0 && ` ${hoursConsumed.toFixed(2)} hours consumed.`}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Total Datasets</p>
              <p className="text-2xl font-medium text-gray-900 mt-1 tabular-nums">{totalDatasets}</p>
              <Link href="/xase/ai-holder/datasets" className="text-xs text-gray-600 hover:text-gray-800 mt-2 inline-block">
                View all →
              </Link>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Active Leases</p>
              <p className="text-2xl font-medium text-gray-900 mt-1 tabular-nums">{activeLeases}</p>
              <Link href="/xase/ai-holder/leases" className="text-xs text-gray-600 hover:text-gray-800 mt-2 inline-block">
                Manage leases →
              </Link>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Training Jobs Today</p>
              <p className="text-2xl font-medium text-gray-900 mt-1 tabular-nums">{trainingJobsToday}</p>
              <p className="text-xs text-gray-500">Unique streaming jobs</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Active Clients</p>
              <p className="text-2xl font-medium text-gray-900 mt-1 tabular-nums">{activeClients}</p>
              <Link href="/xase/ai-holder/policies" className="text-xs text-gray-600 hover:text-gray-800 mt-2 inline-block">
                View policies →
              </Link>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Hours Consumed</p>
              <p className="text-2xl font-medium text-gray-900 mt-1 tabular-nums">
                {hoursConsumed.toFixed(2)}h
              </p>
              <p className="text-xs text-gray-500">of {totalHoursProvided.toFixed(2)}h total</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Revenue</p>
              <p className="text-2xl font-medium text-gray-900 mt-1 tabular-nums">
                ${revenue.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500">Total earned</p>
            </div>
          </div>

          {/* Recent Datasets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`${heading.className} text-base font-semibold text-gray-900`}>
                Recent Datasets
              </h2>
              <Link
                href="/xase/ai-holder/datasets"
                className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                View all →
              </Link>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Name</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Language</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Duration</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Recordings</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDatasets.length > 0 ? (
                      recentDatasets.map((ds) => (
                        <tr
                          key={ds.datasetId}
                          className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-2 text-xs text-gray-800">
                            <Link
                              href={`/xase/ai-holder/datasets/${ds.datasetId}`}
                              className="hover:text-gray-900 underline"
                            >
                              {ds.name}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 font-mono">{ds.primaryLanguage}</td>
                          <td className="px-4 py-2 text-xs">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700`}
                            >
                              {ds.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 font-mono">
                            {ds.totalDurationHours?.toFixed(2) || '0.00'}h
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 font-mono">
                            {ds.numRecordings || 0}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 font-mono">
                            {new Date(ds.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-xs text-gray-500">
                          No datasets yet.{' '}
                          <Link href="/xase/ai-holder/datasets" className="underline hover:text-gray-800">
                            Create your first dataset
                          </Link>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid gap-3 md:grid-cols-3">
            <Link
              href="/xase/ai-holder/datasets"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-medium text-gray-900 mb-1">Create Dataset</h3>
              <p className="text-xs text-gray-600">Upload and manage voice data</p>
            </Link>

            <Link
              href="/xase/ai-holder/policies"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-medium text-gray-900 mb-1">Manage Policies</h3>
              <p className="text-xs text-gray-600">Control dataset access</p>
            </Link>

            <Link
              href="/xase/ai-holder/access-logs"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-medium text-gray-900 mb-1">View Access Logs</h3>
              <p className="text-xs text-gray-600">Monitor data usage</p>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
