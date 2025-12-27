/*
Backfill MetricsSnapshot when recent period has no data.

Usage examples:
  # All tenants
  node scripts/backfill_metrics_snapshot.js

  # Specific tenantId
  TENANT_ID="cmj7jxr4p0000gt543l2k1lfi" node scripts/backfill_metrics_snapshot.js

  # Specific tenant email
  TENANT_EMAIL="xppsalvador@gmail.com" node scripts/backfill_metrics_snapshot.js

Notes:
- If there are no decisions in the last 24h for a tenant, we will:
  1) Try to clone the most recent MetricsSnapshot values into a new 24h snapshot window.
  2) If no snapshot exists, aggregate from historical DecisionRecord/HumanIntervention to synthesize a snapshot for the last 24h window.
*/

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function periodWindowMs(period) {
  const map = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };
  return map[period] ?? map['24h'];
}

async function aggregateWindow(tenantId, startDate, endDate) {
  const whereClause = { tenantId, timestamp: { gte: startDate, lte: endDate } };

  const [totalDecisions, decisionsWithIntervention, interventionsByAction, avgConfidenceAgg, processingTimeAgg, decisionsByModel] = await Promise.all([
    prisma.decisionRecord.count({ where: whereClause }),
    prisma.decisionRecord.count({ where: { ...whereClause, hasHumanIntervention: true } }),
    prisma.humanIntervention.groupBy({ by: ['action'], where: { tenantId, timestamp: { gte: startDate, lte: endDate } }, _count: true }),
    prisma.decisionRecord.aggregate({ where: whereClause, _avg: { confidence: true } }),
    prisma.decisionRecord.aggregate({ where: whereClause, _avg: { processingTime: true } }),
    prisma.decisionRecord.groupBy({ by: ['modelId'], where: { ...whereClause, modelId: { not: null } }, _count: true, _avg: { confidence: true } }),
  ]);

  const aiDecisions = totalDecisions - decisionsWithIntervention;
  const overrideCount = interventionsByAction.find(i => i.action === 'OVERRIDE')?._count || 0;
  const approvalCount = interventionsByAction.find(i => i.action === 'APPROVED')?._count || 0;
  const rejectionCount = interventionsByAction.find(i => i.action === 'REJECTED')?._count || 0;
  const overrideRate = totalDecisions > 0 ? (overrideCount / totalDecisions) * 100 : 0;
  const interventionRate = totalDecisions > 0 ? (decisionsWithIntervention / totalDecisions) * 100 : 0;
  const approvalRate = decisionsWithIntervention > 0 ? (approvalCount / decisionsWithIntervention) * 100 : 0;

  // Top override reasons (last 100 in window)
  const recentOverrides = await prisma.humanIntervention.findMany({
    where: { tenantId, action: 'OVERRIDE', timestamp: { gte: startDate, lte: endDate } },
    select: { reason: true },
    orderBy: { timestamp: 'desc' },
    take: 100,
  });
  const reasonCounts = {};
  for (const r of recentOverrides) {
    const key = r.reason || 'No reason provided';
    reasonCounts[key] = (reasonCounts[key] || 0) + 1;
  }
  const topOverrideReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  // Metrics by model
  const metricsByModel = {};
  for (const m of decisionsByModel) {
    if (!m.modelId) continue;
    const modelOverrides = await prisma.humanIntervention.count({
      where: {
        tenantId,
        action: 'OVERRIDE',
        timestamp: { gte: startDate, lte: endDate },
        record: { modelId: m.modelId },
      },
    });
    metricsByModel[m.modelId] = {
      decisions: m._count,
      overrides: modelOverrides,
      override_rate: m._count > 0 ? (modelOverrides / m._count) * 100 : 0,
      avg_confidence: m._avg.confidence,
    };
  }

  return {
    totalDecisions,
    aiDecisions,
    humanInterventions: decisionsWithIntervention,
    overrideCount,
    approvalCount,
    rejectionCount,
    overrideRate,
    interventionRate,
    approvalRate,
    avgConfidence: avgConfidenceAgg._avg.confidence ?? null,
    avgProcessingTimeMs: processingTimeAgg._avg.processingTime ? Math.round(processingTimeAgg._avg.processingTime) : null,
    topOverrideReasons,
    metricsByModel,
  };
}

async function backfillTenant(tenant) {
  const now = new Date();
  const windowMs = periodWindowMs('24h');
  const startDate = new Date(now.getTime() - windowMs);

  const recentCount = await prisma.decisionRecord.count({ where: { tenantId: tenant.id, timestamp: { gte: startDate, lte: now } } });

  if (recentCount > 0) {
    console.log(`Tenant ${tenant.id}: has ${recentCount} decisions in last 24h. Skipping backfill.`);
    return;
  }

  // Try latest snapshot clone first
  const latestSnapshot = await prisma.metricsSnapshot.findFirst({ where: { tenantId: tenant.id }, orderBy: { periodEnd: 'desc' } });

  if (latestSnapshot) {
    await prisma.metricsSnapshot.create({
      data: {
        tenantId: tenant.id,
        snapshotType: 'rolling-24h',
        periodStart: startDate,
        periodEnd: now,
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
        metricsByModel: latestSnapshot.metricsByModel,
        topOverrideReasons: latestSnapshot.topOverrideReasons,
      },
    });
    console.log(`Tenant ${tenant.id}: Backfilled snapshot by cloning latest snapshot.`);
    return;
  }

  // If no snapshot, aggregate from historical data (last 90d)
  const ninetyDaysMs = periodWindowMs('90d');
  const histStart = new Date(now.getTime() - ninetyDaysMs);
  const agg = await aggregateWindow(tenant.id, histStart, now);

  await prisma.metricsSnapshot.create({
    data: {
      tenantId: tenant.id,
      snapshotType: 'rolling-24h',
      periodStart: startDate,
      periodEnd: now,
      totalDecisions: agg.totalDecisions,
      aiDecisions: agg.aiDecisions,
      humanInterventions: agg.humanInterventions,
      overrideCount: agg.overrideCount,
      approvalCount: agg.approvalCount,
      rejectionCount: agg.rejectionCount,
      overrideRate: agg.overrideRate,
      interventionRate: agg.interventionRate,
      approvalRate: agg.approvalRate,
      avgConfidence: agg.avgConfidence,
      avgProcessingTimeMs: agg.avgProcessingTimeMs,
      metricsByModel: JSON.stringify(agg.metricsByModel),
      topOverrideReasons: JSON.stringify(agg.topOverrideReasons),
    },
  });
  console.log(`Tenant ${tenant.id}: Backfilled snapshot from historical aggregates.`);
}

async function main() {
  const tenantIdEnv = process.env.TENANT_ID || null;
  const tenantEmailEnv = process.env.TENANT_EMAIL || null;

  let tenants = [];
  if (tenantIdEnv) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantIdEnv }, select: { id: true, email: true, name: true } });
    if (t) tenants = [t];
  } else if (tenantEmailEnv) {
    const t = await prisma.tenant.findFirst({ where: { email: tenantEmailEnv }, select: { id: true, email: true, name: true } });
    if (t) tenants = [t];
  } else {
    tenants = await prisma.tenant.findMany({ select: { id: true, email: true, name: true } });
  }

  if (!tenants.length) {
    console.log('No tenants matched. Provide TENANT_ID or TENANT_EMAIL to target a specific tenant.');
    return;
  }

  console.log('Tenants to process:', tenants);
  for (const t of tenants) {
    try {
      await backfillTenant(t);
    } catch (e) {
      console.error(`Error backfilling tenant ${t.id}:`, e);
    }
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
