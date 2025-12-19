import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { RecordDetails } from '@/components/xase/RecordDetails';

export const metadata: Metadata = {
  title: 'XASE AI - Record Details',
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
  const record = await prisma.decisionRecord.findFirst({
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
    },
  });

  if (!record) {
    redirect('/xase/records');
  }

  // Buscar bundles
  const bundles = await prisma.evidenceBundle.findMany({
    where: {
      transactionId,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Derivar lastAccess via AuditLog (BUNDLE_DOWNLOADED por bundleId)
  const bundleIds = bundles.map((b) => b.bundleId);
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

  const bundlesWithLastAccess = bundles.map((b) => ({
    ...b,
    lastAccess: lastAccessMap.get(b.bundleId) || null,
  }));

  // Buscar checkpoint mais próximo
  const checkpoint = await prisma.checkpointRecord.findFirst({
    where: {
      tenantId,
      timestamp: {
        lte: record.timestamp,
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  return (
    <AppLayout>
      <RecordDetails
        record={record}
        bundles={bundlesWithLastAccess}
        checkpoint={checkpoint}
      />
    </AppLayout>
  );
}
