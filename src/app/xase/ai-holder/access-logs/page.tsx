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


export default async function AccessLogsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();

  let accessLogs: any[] = [];
  let totalAccess = 0;
  let totalHoursAccessed = 0;
  let totalFilesAccessed = 0;

  if (tenantId) {
    accessLogs = await prisma.voiceAccessLog.findMany({
      where: {
        OR: [
          { dataset: { tenantId } },
          { clientTenantId: tenantId },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
      include: {
        dataset: {
          select: {
            datasetId: true,
            name: true,
          },
        },
      },
    });

    const stats = await prisma.voiceAccessLog.aggregate({
      where: {
        OR: [
          { dataset: { tenantId } },
          { clientTenantId: tenantId },
        ],
      },
      _count: true,
      _sum: {
        hoursAccessed: true,
        filesAccessed: true,
      },
    });

    totalAccess = stats._count;
    totalHoursAccessed = Number(stats._sum.hoursAccessed || 0);
    totalFilesAccessed = stats._sum.filesAccessed || 0;
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>
                  Voice Access Logs
                </h1>
                <p className="text-sm text-gray-500 font-mono">
                  Immutable audit trail of all voice data access
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Total Access Events</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{totalAccess}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Total Hours Accessed</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">
                {totalHoursAccessed.toFixed(2)}h
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-600">Total Files Accessed</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 font-mono">
                {totalFilesAccessed}
              </p>
            </div>
          </div>

          {/* Access Logs Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`${heading.className} text-base font-semibold text-gray-900`}>
                Recent Access Events
              </h2>
              <p className="text-xs text-gray-500">Showing last 50 events</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">
                        Timestamp (UTC)
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Dataset</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Action</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Files</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Hours</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Outcome</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">IP Address</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Request ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLogs.length > 0 ? (
                      accessLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-2 text-xs text-gray-900 font-mono">
                            {new Date(log.timestamp).toISOString()}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-900">
                            <Link
                              href={`/xase/voice/datasets/${log.dataset.datasetId}`}
                              className="hover:text-gray-900 underline"
                            >
                              {log.dataset.name}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600">{log.action}</td>
                          <td className="px-4 py-2 text-xs text-gray-600 font-mono">
                            {log.filesAccessed}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 font-mono">
                            {log.hoursAccessed.toFixed(2)}h
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <span className="px-2 py-0.5 rounded border border-gray-200 text-[10px] text-gray-600">{log.outcome}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 font-mono">
                            {log.ipAddress || 'N/A'}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 font-mono">
                            {log.requestId ? `${log.requestId.slice(0, 8)}...` : 'N/A'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-xs text-gray-500">
                          No access logs yet. Access events will appear here once datasets are accessed
                          via the API.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-700 leading-relaxed">
              All voice data access is logged immutably with timestamps, IP addresses, and request
              identifiers. These logs provide a complete audit trail for compliance and governance
              purposes.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
