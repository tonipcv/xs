import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { RecordDetails } from '@/components/xase/RecordDetails';

export const metadata: Metadata = {
  title: 'Xase',
  description: 'Decision record details and evidence',
};

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();
  const { id } = await params;
  const transactionId = id;

  if (!tenantId) {
    redirect('/xase');
  }

  // Buscar record
  const recordRaw = await prisma.decisionRecord.findFirst({
    where: {
      transactionId,
      tenantId,
    },
    include: {
      tenant: {
        select: {
          name: true,
          companyName: true,
        },
      },
      insuranceDecision: true,
    },
  });

  if (!recordRaw) {
    redirect('/xase/records');
  }

  // Buscar snapshots se existirem IDs
  const snapshotIds = [
    recordRaw.externalDataSnapshotId,
    recordRaw.businessRulesSnapshotId,
    recordRaw.environmentSnapshotId,
    recordRaw.featureVectorSnapshotId,
  ].filter(Boolean) as string[];

  const snapshots = snapshotIds.length > 0
    ? await prisma.evidenceSnapshot.findMany({
        where: {
          id: { in: snapshotIds },
        },
        select: {
          id: true,
          type: true,
          payloadHash: true,
          payloadSize: true,
          capturedAt: true,
          compressed: true,
        },
      })
    : [];

  // Buscar bundles
  const bundlesRaw = await prisma.evidenceBundle.findMany({
    where: {
      transactionId,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Derivar lastAccess via AuditLog (BUNDLE_DOWNLOADED por bundleId)
  const bundleIds = bundlesRaw.map((b) => b.bundleId);
  let lastAccessMap = new Map<string, Date | null>();
  if (bundleIds.length > 0) {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'BUNDLE_DOWNLOADED',
        resourceType: 'EVIDENCE_BUNDLE',
        resourceId: { in: bundleIds },
      },
      orderBy: { timestamp: 'desc' },
    });
    for (const id of bundleIds) {
      const l = logs.find((log) => log.resourceId === id);
      lastAccessMap.set(id, l ? l.timestamp : null);
    }
  }

  // Serialize record to plain object
  const recAny: any = recordRaw;
  // confidence
  let confidence: number | null = null;
  if (recAny.confidence != null) {
    try {
      const v: any = recAny.confidence;
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

  // claimAmount
  const idc = recAny.insuranceDecision;
  let claimAmount: number | null = null;
  if (idc && idc.claimAmount != null) {
    try {
      const v: any = idc.claimAmount;
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

  const record = {
    ...recAny,
    confidence,
    timestamp: recAny.timestamp instanceof Date ? recAny.timestamp.toISOString() : recAny.timestamp,
    insuranceDecision: idc
      ? {
          ...idc,
          claimAmount,
        }
      : null,
  };

  // Serialize bundles and add lastAccess
  const bundles = bundlesRaw.map((b) => ({
    id: b.id,
    bundleId: b.bundleId,
    status: b.status,
    recordCount: b.recordCount,
    purpose: b.purpose,
    createdBy: b.createdBy,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : (b as any).createdAt,
    completedAt: b.completedAt instanceof Date ? b.completedAt.toISOString() : (b as any).completedAt,
    expiresAt: b.expiresAt instanceof Date ? b.expiresAt.toISOString() : (b as any).expiresAt,
    pdfReportUrl: b.pdfReportUrl,
    legalFormat: b.legalFormat,
    bundleManifestHash: b.bundleManifestHash,
    bundleSize: ((): number | null => {
      const v: any = (b as any).bundleSize;
      if (v == null) return null;
      try {
        if (typeof v === 'object' && typeof v.toNumber === 'function') {
          const n = v.toNumber();
          return Number.isFinite(n) ? n : null;
        }
        const n = Number(typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : v);
        return Number.isFinite(n) ? n : null;
      } catch { return null; }
    })(),
    lastAccess: lastAccessMap.get(b.bundleId) || null,
    transactionId: b.transactionId,
    includesPayloads: (b as any).includesPayloads ?? null,
  }));

  // Checkpoints were removed from the schema; keep placeholder as null for UI compatibility
  const checkpoint = null;

  return (
    <AppLayout>
      <RecordDetails
        record={record}
        bundles={bundles}
        checkpoint={checkpoint}
        snapshots={snapshots}
      />
    </AppLayout>
  );
}
