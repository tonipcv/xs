import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { RecordsTable } from './RecordsTable';

export const metadata: Metadata = {
  title: 'Xase Records',
  description: 'Decision ledger with enterprise-grade filtering and export',
};

export default async function RecordsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();
  
  if (!tenantId) {
  return (
      <AppLayout>
        <div className="min-h-screen bg-[#121316]">
          <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">Records</h1>
              <p className="text-sm text-white/50">No tenant found</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const [recordsRaw, total] = await prisma.$transaction([
    prisma.decisionRecord.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: {
        id: true,
        transactionId: true,
        policyId: true,
        confidence: true,
        isVerified: true,
        timestamp: true,
        recordHash: true,
        insuranceDecision: {
          select: {
            claimNumber: true,
            claimType: true,
            claimAmount: true,
            policyNumber: true,
            decisionOutcome: true,
            decisionImpactConsumerImpact: true,
          },
        },
      },
    }),
    prisma.decisionRecord.count({ where: { tenantId } }),
  ]);

  // Serialize Decimal fields for client component safety (plain objects)
  const records = recordsRaw.map((r: any) => {
    // confidence
    let confidence: number | null = null;
    if (r.confidence != null) {
      try {
        const v: any = r.confidence;
        if (typeof v === 'object' && typeof v.toNumber === 'function') {
          const n = v.toNumber();
          confidence = Number.isFinite(n) ? n : null;
        } else {
          const n = Number(typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : v);
          confidence = Number.isFinite(n) ? n : null;
        }
      } catch {
        confidence = null;
      }
    }

    // insuranceDecision.claimAmount
    const src = r.insuranceDecision;
    let claimAmount: number | null = null;
    if (src && src.claimAmount != null) {
      try {
        const v: any = src.claimAmount;
        if (typeof v === 'object' && typeof v.toNumber === 'function') {
          const n = v.toNumber();
          claimAmount = Number.isFinite(n) ? n : null;
        } else {
          const n = Number(typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : v);
          claimAmount = Number.isFinite(n) ? n : null;
        }
      } catch {
        claimAmount = null;
      }
    }

    return {
      ...r,
      confidence,
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
      insuranceDecision: src
        ? {
            ...src,
            claimAmount,
          }
        : null,
    };
  });

  // Ensure props are fully plain for client component
  const safeRecords = JSON.parse(JSON.stringify(records));

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              Decision Risk Inbox
            </h1>
            <p className="text-sm text-white/50">
              {total.toLocaleString()} decision{total !== 1 ? 's' : ''} · Monitoring for legal exposure
            </p>
          </div>

          {safeRecords.length > 0 ? (
            <RecordsTable
              initialRecords={safeRecords}
              initialTotal={total}
              tenantId={tenantId}
            />
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
