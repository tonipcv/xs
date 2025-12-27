/*
Inspect detailed data for a user email: tenant linkage, recent decisions, checkpoints, alerts, and latest metrics snapshot.

Usage:
  EMAIL="xppsalvador@gmail.com" node scripts/inspect_tenant_details.js
  node scripts/inspect_tenant_details.js xppsalvador@gmail.com
*/

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || process.env.EMAIL;
  if (!email) {
    console.error('Please provide EMAIL env var or first arg (email).');
    process.exit(1);
  }

  console.log(`== Inspecting data for email: ${email} ==`);

  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, tenantId: true, name: true },
  });
  console.log('\nUser:', user);

  if (!user) {
    console.log('User not found.');
    return;
  }

  if (!user.tenantId) {
    console.log('User has no tenantId linked.');
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { id: true, email: true, name: true, status: true, plan: true, createdAt: true },
  });
  console.log('\nTenant:', tenant);

  // Counts
  const [recordsCount, checkpointsCount, exportsCount] = await Promise.all([
    prisma.decisionRecord.count({ where: { tenantId: user.tenantId } }),
    prisma.checkpointRecord.count({ where: { tenantId: user.tenantId } }),
    prisma.auditLog.count({ where: { tenantId: user.tenantId, action: 'EXPORT_CREATED' } }),
  ]);
  console.log('\nCounts:', { recordsCount, checkpointsCount, exportsCount });

  // Recent decisions
  const recentDecisions = await prisma.decisionRecord.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { timestamp: 'desc' },
    take: 10,
    select: {
      id: true,
      transactionId: true,
      decisionType: true,
      modelId: true,
      confidence: true,
      hasHumanIntervention: true,
      finalDecisionSource: true,
      timestamp: true,
    },
  });
  console.log('\nRecent decisions (10):');
  for (const d of recentDecisions) console.log(d);

  // Recent checkpoints
  const recentCheckpoints = await prisma.checkpointRecord.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { timestamp: 'desc' },
    take: 5,
    select: { id: true, checkpointId: true, checkpointNumber: true, recordCount: true, isVerified: true, timestamp: true },
  });
  console.log('\nRecent checkpoints (5):');
  for (const c of recentCheckpoints) console.log(c);

  // Recent alerts
  const recentAlerts = await prisma.alert.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { triggeredAt: 'desc' },
    take: 5,
    select: { id: true, alertType: true, severity: true, status: true, title: true, triggeredAt: true },
  });
  console.log('\nRecent alerts (5):');
  for (const a of recentAlerts) console.log(a);

  // Latest Metrics Snapshot
  const latestSnapshot = await prisma.metricsSnapshot.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { periodEnd: 'desc' },
  });

  if (latestSnapshot) {
    console.log('\nLatest MetricsSnapshot:');
    const out = {
      id: latestSnapshot.id,
      snapshotType: latestSnapshot.snapshotType,
      periodStart: latestSnapshot.periodStart,
      periodEnd: latestSnapshot.periodEnd,
      totalDecisions: latestSnapshot.totalDecisions,
      aiDecisions: latestSnapshot.aiDecisions,
      humanInterventions: latestSnapshot.humanInterventions,
      overrideCount: latestSnapshot.overrideCount,
      approvalCount: latestSnapshot.approvalCount,
      rejectionCount: latestSnapshot.rejectionCount,
      overrideRate: latestSnapshot.overrideRate,
      interventionRate: latestSnapshot.interventionRate,
      approvalRate: latestSnapshot.approvalRate,
      avgConfidence: latestSnapshot.avgConfidence,
      avgProcessingTimeMs: latestSnapshot.avgProcessingTimeMs,
    };
    console.log(out);
  } else {
    console.log('\nNo MetricsSnapshot found for this tenant.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
