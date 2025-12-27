import { AppLayout } from '@/components/AppSidebar'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'

function periodToMs(period: string) {
  const map: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  }
  return map[period] ?? map['24h']
}

export default async function DashboardPage() {
  const period = '24h'
  const now = new Date()
  const startDate = new Date(now.getTime() - periodToMs(period))

  const tenantId = await getTenantId()

  // If no tenant, render empty state instead of redirecting to make error obvious
  if (!tenantId) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-[#121316]">
          <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Trust Dashboard</h1>
            <div className="text-sm text-white/60">No tenant linked to your session.</div>
          </div>
        </div>
      </AppLayout>
    )
  }

  const whereClause: any = {
    tenantId,
    timestamp: { gte: startDate, lte: now },
  }

  const [totalDecisions, decisionsWithIntervention, decisionsBySource, interventionsByAction, avgConfidenceAgg, processingTimeStats] = await Promise.all([
    prisma.decisionRecord.count({ where: whereClause }),
    prisma.decisionRecord.count({ where: { ...whereClause, hasHumanIntervention: true } }),
    prisma.decisionRecord.groupBy({ by: ['finalDecisionSource'], where: whereClause, _count: true }),
    prisma.humanIntervention.groupBy({ by: ['action'], where: { tenantId, timestamp: { gte: startDate, lte: now } }, _count: true }),
    prisma.decisionRecord.aggregate({ where: whereClause, _avg: { confidence: true } }),
    prisma.decisionRecord.aggregate({ where: whereClause, _avg: { processingTime: true } }),
  ])

  // Compute metrics (mutable to allow snapshot fallback)
  let totalDec = totalDecisions
  let humanInterv = decisionsWithIntervention
  let aiDecisions = totalDec - humanInterv
  let overrideCount = interventionsByAction.find((i) => i.action === 'OVERRIDE')?._count || 0
  let approvalCount = interventionsByAction.find((i) => i.action === 'APPROVED')?._count || 0
  let rejectionCount = interventionsByAction.find((i) => i.action === 'REJECTED')?._count || 0
  let overrideRate = totalDec > 0 ? (overrideCount / totalDec) * 100 : 0
  let interventionRate = totalDec > 0 ? (humanInterv / totalDec) * 100 : 0
  let approvalRate = humanInterv > 0 ? (approvalCount / humanInterv) * 100 : 0
  let avgConfidence = (avgConfidenceAgg._avg.confidence as number | null) ?? null
  let avgProcessingMs = processingTimeStats._avg.processingTime ? Math.round(processingTimeStats._avg.processingTime as number) : null

  // Top override reasons (last 100)
  let recentOverrides = await prisma.humanIntervention.findMany({
    where: { tenantId, action: 'OVERRIDE', timestamp: { gte: startDate, lte: now } },
    select: { reason: true },
    orderBy: { timestamp: 'desc' },
    take: 100,
  })
  let reasonCounts: Record<string, number> = {}
  for (const r of recentOverrides) {
    const key = r.reason || 'No reason provided'
    reasonCounts[key] = (reasonCounts[key] || 0) + 1
  }
  let topOverride = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Fallback: if no data in last 24h, use latest MetricsSnapshot
  if (totalDec === 0) {
    const snapshot = await prisma.metricsSnapshot.findFirst({
      where: { tenantId },
      orderBy: { periodEnd: 'desc' },
    })
    if (snapshot) {
      totalDec = snapshot.totalDecisions
      humanInterv = snapshot.humanInterventions
      aiDecisions = snapshot.aiDecisions
      overrideCount = snapshot.overrideCount
      approvalCount = snapshot.approvalCount
      rejectionCount = snapshot.rejectionCount
      overrideRate = snapshot.overrideRate ?? 0
      interventionRate = snapshot.interventionRate ?? 0
      approvalRate = snapshot.approvalRate ?? 0
      avgConfidence = snapshot.avgConfidence ?? null
      avgProcessingMs = snapshot.avgProcessingTimeMs ? Math.round(snapshot.avgProcessingTimeMs) : null

      // Top reasons from snapshot JSON
      try {
        const reasons = snapshot.topOverrideReasons ? JSON.parse(snapshot.topOverrideReasons) : []
        topOverride = Array.isArray(reasons)
          ? reasons.slice(0, 5).map((r: any) => [r.reason ?? 'No reason provided', r.count ?? 0])
          : []
      } catch {
        // ignore JSON parse fail
      }
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Trust Dashboard</h1>
            <p className="text-sm text-gray-400">AI decision trust and quality metrics (last 24h)</p>
          </div>

          {/* Main Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-sm font-medium text-white">Total Decisions</p>
              <p className="text-2xl font-bold text-white mt-2">{totalDec}</p>
              <p className="text-xs text-white/60">{aiDecisions} AI | {humanInterv} Human</p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-sm font-medium text-white">Override Rate</p>
              <p className="text-2xl font-bold text-white mt-2">{overrideRate.toFixed(1)}%</p>
              <p className="text-xs text-white/60">{overrideCount} overrides</p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-sm font-medium text-white">Avg Confidence</p>
              <p className="text-2xl font-bold text-white mt-2">
                {avgConfidence != null ? (avgConfidence * 100).toFixed(1) + '%' : 'N/A'}
              </p>
              <p className="text-xs text-white/60">Model confidence</p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-sm font-medium text-white">Approval Rate</p>
              <p className="text-2xl font-bold text-white mt-2">{approvalRate.toFixed(1)}%</p>
              <p className="text-xs text-white/60">{approvalCount} approvals</p>
            </div>
          </div>

          {/* Decisions by Source */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
            <p className="text-white font-medium mb-2">Decisions: AI vs Human</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">AI (no intervention)</span>
                <span className="text-sm text-white/60">
                  {aiDecisions} ({totalDec > 0 ? ((aiDecisions / totalDec) * 100).toFixed(1) : 0}%)
                </span>
              </div>
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${totalDec > 0 ? (aiDecisions / totalDec) * 100 : 0}%` }} />
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-sm font-medium text-white">Human Intervention</span>
                <span className="text-sm text-white/60">
                  {humanInterv} ({totalDec > 0 ? ((humanInterv / totalDec) * 100).toFixed(1) : 0}%)
                </span>
              </div>
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500" style={{ width: `${totalDec > 0 ? (humanInterv / totalDec) * 100 : 0}%` }} />
              </div>
            </div>
          </div>

          {/* Top Override Reasons */}
          {topOverride.length > 0 && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <p className="text-white font-medium mb-2">Top Override Reasons</p>
              <div className="space-y-2">
                {topOverride.map(([reason, count]) => (
                  <div className="flex items-center justify-between" key={reason}>
                    <span className="text-sm text-white">{reason}</span>
                    <span className="text-xs text-white/80">{count as number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
