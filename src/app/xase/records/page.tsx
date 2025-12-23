import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Xase',
  description: 'Decision ledger',
};

export default async function RecordsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();
  
  let records: any[] = [];
  let total = 0;

  if (tenantId) {
    [records, total] = await Promise.all([
      prisma.decisionRecord.findMany({
        where: { tenantId },
        orderBy: { timestamp: 'desc' },
        take: 20,
        select: {
          id: true,
          transactionId: true,
          policyId: true,
          decisionType: true,
          confidence: true,
          isVerified: true,
          timestamp: true,
        },
      }),
      prisma.decisionRecord.count({ where: { tenantId } }),
    ]);
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#1c1d20]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">
                Records
              </h1>
              <p className="text-sm text-white/50">
                {total} decision{total !== 1 ? 's' : ''} in ledger
              </p>
            </div>
          </div>

          {records.length > 0 ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">TRANSACTION ID</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">POLICY</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">TYPE</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">CONFIDENCE</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">TIMESTAMP</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">STATUS</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-sm text-white font-mono">{record.transactionId.substring(0, 16)}...</td>
                      <td className="px-6 py-4 text-sm text-white/80">{record.policyId || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-white/80">{record.decisionType || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-white/80">{record.confidence ? (record.confidence * 100).toFixed(1) + '%' : 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-white/80">
                        {new Date(record.timestamp).toLocaleString('en-US', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded ${record.isVerified ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                          {record.isVerified ? 'Verified' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={`/xase/records/${record.transactionId}`}
                          className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white transition-colors"
                        >
                          View Details
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">No records yet</h3>
                  <p className="text-sm text-white/50 max-w-md">Start sending decisions via the API</p>
                </div>
                <a href="https://xase.ai/docs" className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm font-medium rounded-md transition-colors mt-4">
                  View docs
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
