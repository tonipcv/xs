// @ts-nocheck
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { Playfair_Display } from 'next/font/google';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

export const metadata: Metadata = {
  title: 'Credit Ledger',
  description: 'Voice data credit ledger and billing',
};

export default async function LedgerPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();

  let ledgerEntries: any[] = [];
  let currentBalance = 0;
  let totalDebits = 0;
  let totalCredits = 0;

  if (tenantId) {
    ledgerEntries = await prisma.creditLedger.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const balanceAgg = await prisma.creditLedger.aggregate({
      where: { tenantId },
      _sum: { amount: true },
    });

    const debitsAgg = await prisma.creditLedger.aggregate({
      where: { tenantId, amount: { lt: 0 } },
      _sum: { amount: true },
    });

    const creditsAgg = await prisma.creditLedger.aggregate({
      where: { tenantId, amount: { gte: 0 } },
      _sum: { amount: true },
    });

    currentBalance = Number(balanceAgg._sum.amount || 0);
    totalDebits = Math.abs(Number(debitsAgg._sum.amount || 0));
    totalCredits = Number(creditsAgg._sum.amount || 0);
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
                  Credit Ledger
                </h1>
                <p className="text-sm text-gray-500 font-mono">
                  Append-only financial ledger for voice data usage
                </p>
              </div>
            </div>
          </div>

          {/* Balance Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className={`${heading.className} text-xl font-semibold text-gray-900 tracking-tight`}>
                    Current Balance
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    Real-time balance calculated from all ledger entries
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">Balance</p>
                  <p className={`text-3xl font-semibold font-mono text-gray-900`}>
                    ${currentBalance.toFixed(2)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-gray-600">Total Credits</p>
                  <p className="text-2xl font-semibold text-gray-900 font-mono">
                    ${totalCredits.toFixed(2)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-gray-600">Total Debits</p>
                  <p className="text-2xl font-semibold text-gray-900 font-mono">
                    ${totalDebits.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Ledger Entries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`${heading.className} text-base font-semibold text-gray-900`}>
                Ledger Entries
              </h2>
              <p className="text-xs text-gray-500">Showing last 50 entries</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">
                        Timestamp (UTC)
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">
                        Event Type
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">
                        Description
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-600">
                        Amount
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-600">
                        Balance After
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.length > 0 ? (
                      ledgerEntries.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-2 text-xs text-gray-900 font-mono">
                            {new Date(entry.createdAt).toISOString()}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-gray-50 border border-gray-200">
                              {entry.eventType}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 max-w-[300px] truncate">
                            {entry.description || 'N/A'}
                          </td>
                          <td className={`px-4 py-2 text-xs text-right font-mono text-gray-900`}>
                            {Number(entry.amount) >= 0 ? '+' : ''}${Number(entry.amount).toFixed(4)}
                          </td>
                          <td className="px-4 py-2 text-xs text-right text-gray-600 font-mono">
                            ${Number(entry.balanceAfter).toFixed(4)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-xs text-gray-500">
                          No ledger entries yet. Financial transactions will appear here as voice data
                          is accessed.
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
              The credit ledger is an append-only log of all financial transactions related to voice
              data usage. Each entry is immutable and includes the balance after the transaction,
              ensuring complete auditability and transparency.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
