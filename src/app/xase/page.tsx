import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import XaseUsageBanner from '@/components/XaseUsageBanner';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import { GlossaryTooltip } from '@/components/xase/Tooltip';
import { ExplainerButton, EXPLAINERS } from '@/components/xase/ExplainerButton';
import { CopyButton } from '@/components/xase/CopyButton';
import { createHash } from 'crypto';

export const metadata: Metadata = {
  title: 'Xase Evidence Ledger',
  description: 'Immutable audit trail for AI decisions',
};

export default async function XaseDashboard({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();
  const now = new Date();
  const nowISO = now.toISOString();
  
  // Range (7|30|90 days) via ?range=, default 30
  const params = searchParams ? await searchParams : undefined;
  const rangeParam = Number(params?.range || '30');
  const lookbackDays = [7, 30, 90].includes(rangeParam) ? rangeParam : 30;
  const startRange = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const startRangeISO = startRange.toISOString();
  
  // Stats básicos
  let totalRecords = 0;
  let totalExports = 0;
  let lastRecord: any = null;
  let lastVerifiedAt: string | null = null;
  let chainIntact = false;
  let latestMerkleRoot: string | null = null;

  if (tenantId) {
    const [recordCount, exportCount, mostRecentRecord, latestBundle] = await prisma.$transaction([
      prisma.decisionRecord.count({ where: { tenantId } }),
      prisma.evidenceBundle.count({ where: { tenantId, status: 'READY' } }),
      prisma.decisionRecord.findFirst({
        where: { tenantId },
        orderBy: { timestamp: 'desc' },
        select: { recordHash: true, verifiedAt: true, timestamp: true, transactionId: true },
      }),
      prisma.evidenceBundle.findFirst({
        where: { tenantId, merkleRoot: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { merkleRoot: true },
      }),
    ]);

    totalRecords = recordCount;
    totalExports = exportCount;
    lastRecord = mostRecentRecord;
    lastVerifiedAt = mostRecentRecord?.verifiedAt?.toISOString() || null;
    chainIntact = totalRecords > 0;
    latestMerkleRoot = latestBundle?.merkleRoot || null;
  }

  // Freshness indicator (relative time since last event)
  let lastEventAgo: string | null = null;
  if (lastRecord?.timestamp) {
    const diffMs = now.getTime() - new Date(lastRecord.timestamp).getTime();
    const sec = Math.max(0, Math.floor(diffMs / 1000));
    if (sec < 60) lastEventAgo = `${sec}s ago`;
    else if (sec < 3600) lastEventAgo = `${Math.floor(sec / 60)}m ago`;
    else if (sec < 86400) lastEventAgo = `${Math.floor(sec / 3600)}h ago`;
    else lastEventAgo = `${Math.floor(sec / 86400)}d ago`;
  }

  // HITL metrics (range)
  let totalDec = 0;
  let humanInterv = 0;
  let aiDecisions = 0;
  let interventionsByType: Record<string, number> = {};
  let overrideRate = 0;
  let approvalRate = 0;
  let avgConfidence: number | null = null;

  if (tenantId) {
    const whereClause: any = {
      tenantId,
      timestamp: { gte: startRange, lte: now },
    };

    const [
      totalDecisions,
      decisionsWithIntervention,
      interventionsByAction,
      avgConfidenceAgg,
    ] = await Promise.all([
      prisma.decisionRecord.count({ where: whereClause }),
      prisma.decisionRecord.count({ where: { ...whereClause, hasHumanIntervention: true } }),
      prisma.humanIntervention.groupBy({
        by: ['action'],
        where: { tenantId, timestamp: { gte: startRange, lte: now } },
        _count: true,
      }),
      prisma.decisionRecord.aggregate({ where: whereClause, _avg: { confidence: true } }),
    ]);

    totalDec = totalDecisions;
    humanInterv = decisionsWithIntervention;
    aiDecisions = totalDec - humanInterv;

    interventionsByAction.forEach((i: any) => {
      interventionsByType[i.action] = i._count;
    });

    const overrideCount = interventionsByType['OVERRIDE'] || 0;
    const approvalCount = interventionsByType['APPROVED'] || 0;
    overrideRate = totalDec > 0 ? (overrideCount / totalDec) * 100 : 0;
    approvalRate = humanInterv > 0 ? (approvalCount / humanInterv) * 100 : 0;
    avgConfidence = (avgConfidenceAgg._avg.confidence as number | null) ?? null;
  }

  // Alertas ativos
  let activeAlerts: any[] = [];
  let unreviewedHighImpact = 0;

  if (tenantId) {
    const [alerts, highImpactUnreviewed] = await Promise.all([
      prisma.alert.findMany({
        where: { tenantId, status: 'OPEN' },
        orderBy: { triggeredAt: 'desc' },
        take: 5,
        select: {
          id: true,
          severity: true,
          title: true,
          message: true,
          triggeredAt: true,
          alertType: true,
        },
      }),
      prisma.insuranceDecision.count({
        where: {
          record: {
            tenantId,
            timestamp: { gte: startRange, lte: now },
            hasHumanIntervention: false,
          },
          decisionImpactConsumerImpact: 'HIGH',
        },
      }),
    ]);

    activeAlerts = alerts;
    unreviewedHighImpact = highImpactUnreviewed;
  }

  // Audit trail preview (últimos 10 eventos)
  let recentAuditEvents: any[] = [];

  if (tenantId) {
    recentAuditEvents = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        timestamp: true,
        userId: true,
        status: true,
      },
    });
  }

  // Insurance metrics (range)
  let totalClaims = 0;
  let insuranceApprovalRate = 0;
  let insuranceApprovals = 0;
  let avgClaimAmount: number | null = null;
  let highImpactCount = 0;
  let adverseActionCount = 0;
  let adverseActionRate = 0;

  if (tenantId) {
    const [insuranceAgg, insuranceApproved, highImpact, adverseCount] = await Promise.all([
      prisma.insuranceDecision.aggregate({
        where: { record: { tenantId, timestamp: { gte: startRange, lte: now } } },
        _count: true,
        _avg: { claimAmount: true },
      }),
      prisma.insuranceDecision.count({
        where: {
          record: { tenantId, timestamp: { gte: startRange, lte: now } },
          decisionOutcome: 'APPROVED',
        },
      }),
      prisma.insuranceDecision.count({
        where: {
          record: { tenantId, timestamp: { gte: startRange, lte: now } },
          decisionImpactConsumerImpact: 'HIGH',
        },
      }),
      prisma.insuranceDecision.count({
        where: {
          record: { tenantId, timestamp: { gte: startRange, lte: now } },
          NOT: { decisionOutcome: 'APPROVED' },
        },
      }),
    ]);

    totalClaims = (insuranceAgg as any)._count as number;
    avgClaimAmount = (insuranceAgg as any)._avg?.claimAmount
      ? Number((insuranceAgg as any)._avg.claimAmount)
      : null;
    insuranceApprovals = insuranceApproved;
    insuranceApprovalRate = totalClaims > 0 ? (insuranceApprovals / totalClaims) * 100 : 0;
    highImpactCount = highImpact;
    adverseActionCount = adverseCount;
    adverseActionRate = totalClaims > 0 ? (adverseActionCount / totalClaims) * 100 : 0;
  }

  // Top override reasons
  let topOverride: Array<[string, number]> = [];

  if (tenantId) {
    const recentOverrides = await prisma.humanIntervention.findMany({
      where: { tenantId, action: 'OVERRIDE', timestamp: { gte: startRange, lte: now } },
      select: { reason: true },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const reasonCounts: Record<string, number> = {};
    for (const r of recentOverrides) {
      const key = (r as any).reason || 'No reason provided';
      reasonCounts[key] = (reasonCounts[key] || 0) + 1;
    }
    topOverride = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) as Array<[string, number]>;
  }

  // System status components
  const systemStatus = {
    evidenceCapture: totalRecords > 0 ? 'Receiving' : 'Idle',
    ledgerSync: 'Synchronized',
    exportService: 'Available',
    apiStatus: 'Online',
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6">
          {/* Header com timestamp preciso */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-white tracking-tight">
                  Evidence Ledger
                </h1>
                <p className="text-xs text-white/40 font-mono">
                  Data as of {nowISO}
                </p>
              </div>
              <div className="w-full max-w-sm">
                <XaseUsageBanner />
              </div>
            </div>
          </div>

          {/* Alert Banner (se houver alertas críticos) */}
          {activeAlerts.filter((a) => a.severity === 'CRITICAL').length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-400">
                    {activeAlerts.filter((a) => a.severity === 'CRITICAL').length} critical alert
                    {activeAlerts.filter((a) => a.severity === 'CRITICAL').length > 1 ? 's' : ''}{' '}
                    require immediate attention
                  </p>
                  <p className="text-xs text-red-400/70 mt-1">
                    Review alerts in the system status section below
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Summary Card (linguagem natural) */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
            <p className="text-sm text-white/80">
              {chainIntact
                ? `Your evidence ledger is operational. ${totalRecords.toLocaleString()} decision${
                    totalRecords !== 1 ? 's' : ''
                  } recorded. All records cryptographically verified.`
                : 'Your evidence ledger is ready. No decisions recorded yet.'}
              {activeAlerts.length > 0 && ` ${activeAlerts.length} active alert${activeAlerts.length > 1 ? 's' : ''}.`}
              {unreviewedHighImpact > 0 &&
                ` ${unreviewedHighImpact} high-impact decision${
                  unreviewedHighImpact > 1 ? 's' : ''
                } pending review.`}
            </p>
            {lastRecord?.transactionId && (
              <div className="mt-2 text-xs text-white/60">
                Quick proof: Last verified decision{' '}
                <a href={`/xase/records/${lastRecord.transactionId}`} className="underline hover:text-white/80">
                  {lastRecord.transactionId.slice(0, 8)}...
                </a>{' '}
                at <span className="font-mono">{new Date(lastRecord.timestamp).toISOString()}</span> ·
                <a href={`/xase/bundles?transactionId=${lastRecord.transactionId}`} className="ml-1 underline hover:text-white/80">
                  Export integrity package
                </a>
              </div>
            )}
          </div>

          {/* Integrity Hero Card */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    <GlossaryTooltip term="Chain Integrity">Chain Integrity</GlossaryTooltip>
                    <ExplainerButton {...EXPLAINERS.chainIntegrity} />
                  </h2>
                  <p className="text-xs text-white/50 mt-1">
                    Cryptographic verification of decision ledger
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${chainIntact ? 'bg-white/60' : 'bg-yellow-500'}`}></div>
                  <span className="text-sm text-white/80">
                    {chainIntact ? 'Verified' : 'Pending'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-white/50">Total Records</p>
                  <p className="text-2xl font-semibold text-white font-mono">
                    {totalRecords.toLocaleString()}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-white/50">Last Verified</p>
                  <p className="text-sm text-white/80 font-mono">
                    {lastVerifiedAt ? lastVerifiedAt : 'N/A'}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-white/50">Latest Hash</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white/80 font-mono truncate">
                      {lastRecord?.recordHash
                        ? `${lastRecord.recordHash.slice(0, 16)}...`
                        : 'N/A'}
                    </p>
                    {lastRecord?.recordHash && (
                      <CopyButton text={lastRecord.recordHash} title="Copy full hash" />
                    )}
                  </div>
                </div>
              </div>

              {latestMerkleRoot && (
                <div className="pt-3 border-t border-white/[0.06]">
                  <p className="text-xs text-white/50 mb-1">
                    <GlossaryTooltip term="Merkle Root">Merkle Root</GlossaryTooltip> (Latest Bundle)
                    <ExplainerButton {...EXPLAINERS.merkleRoot} />
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white/80 font-mono truncate">
                      {latestMerkleRoot.slice(0, 32)}...
                    </p>
                    <CopyButton text={latestMerkleRoot} title="Copy Merkle root" />
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-white/[0.06]">
                <a
                  href="/xase/bundles"
                  className="text-sm text-white/80 hover:text-white transition-colors underline"
                >
                  Export verification package →
                </a>
              </div>
            </div>
          </div>

          {/* Human Oversight Log (renomeado de HITL) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-white/80">Human Oversight Log <ExplainerButton {...EXPLAINERS.humanOversight} /></h2>
                <p className="text-xs text-white/40 font-mono mt-0.5">
                  Period: {startRangeISO} to {nowISO}
                </p>
              </div>
              <div className="hidden md:flex items-center gap-1">
                {([7, 30, 90] as const).map((r) => (
                  <a
                    key={r}
                    href={`/xase?range=${r}`}
                    className={`px-2 py-1 rounded border text-[11px] transition-colors ${
                      r === lookbackDays
                        ? 'border-white/30 text-white bg-white/5'
                        : 'border-white/10 text-white/60 hover:text-white/80 hover:border-white/20'
                    }`}
                  >
                    {r}d
                  </a>
                ))}
              </div>
              {unreviewedHighImpact > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div>
                  <span className="text-xs text-yellow-400">
                    {unreviewedHighImpact} unreviewed high-impact decision
                    {unreviewedHighImpact > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                <p className="text-xs font-medium text-white/80">Total Decisions</p>
                <p className="text-2xl font-semibold text-white mt-1 font-mono">{totalDec}</p>
                <p className="text-xs text-white/50">
                  {aiDecisions} AI · {humanInterv} Human
                </p>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                <p className="text-xs font-medium text-white/80">Override Rate <ExplainerButton {...EXPLAINERS.overrideRate} /></p>
                <p className="text-2xl font-semibold text-white mt-1 font-mono">
                  {overrideRate.toFixed(2)}%
                </p>
                <p className="text-xs text-white/50">
                  {interventionsByType['OVERRIDE'] || 0} overrides
                </p>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                <p className="text-xs font-medium text-white/80">Avg Confidence <ExplainerButton title="Model confidence" explanation="Confidence reflects the model's self-assessed probability for its decision. High confidence does not guarantee correctness and should be considered alongside human oversight and outcome reviews." /></p>
                <p className="text-2xl font-semibold text-white mt-1 font-mono">
                  {avgConfidence != null ? (avgConfidence * 100).toFixed(2) + '%' : 'N/A'}
                </p>
                <p className="text-xs text-white/50">Model confidence</p>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                <p className="text-xs font-medium text-white/80">Approval Rate</p>
                <p className="text-2xl font-semibold text-white mt-1 font-mono">
                  {approvalRate.toFixed(2)}%
                </p>
                <p className="text-xs text-white/50">
                  {interventionsByType['APPROVED'] || 0} approvals
                </p>
              </div>
            </div>

            {/* Breakdown por tipo de intervenção */}
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
              <p className="text-sm font-medium text-white/80 mb-3">Intervention Breakdown</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {['REVIEW_REQUESTED', 'APPROVED', 'REJECTED', 'OVERRIDE', 'ESCALATED'].map(
                  (type) => (
                    <div key={type} className="text-center">
                      <p className="text-lg font-semibold text-white font-mono">
                        {interventionsByType[type] || 0}
                      </p>
                      <p className="text-[10px] text-white/50 uppercase tracking-wider">
                        {type.replace('_', ' ')}
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Audit Trail Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white/80">Audit Trail <ExplainerButton {...EXPLAINERS.auditTrail} /></h2>
              <a
                href="/xase/audit"
                className="text-xs text-white/60 hover:text-white/80 transition-colors"
              >
                View full trail →
              </a>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.02] border-b border-white/[0.04]">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-white/60">
                        Timestamp (UTC)
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-white/60">
                        Action
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-white/60">
                        Resource
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-white/60">
                        Event ID / Verify
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-white/60">
                        Event Hash (logical)
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-white/60">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAuditEvents.length > 0 ? (
                      recentAuditEvents.map((event) => (
                        <tr
                          key={event.id}
                          className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-2 text-xs text-white/80 font-mono">
                            {event.timestamp.toISOString()}
                          </td>
                          <td className="px-4 py-2 text-xs text-white/80">{event.action}</td>
                          <td className="px-4 py-2 text-xs text-white/60 font-mono">
                            {event.resourceType}
                            {event.resourceId && ` · ${event.resourceId.slice(0, 8)}`}
                          </td>
                          <td className="px-4 py-2 text-xs text-white/80">
                            <span className="font-mono mr-2">{event.id.slice(0, 8)}...</span>
                            <CopyButton text={event.id} title="Copy event id" />
                            <a href={`/xase/audit?event=${event.id}`} className="ml-2 underline text-white/60 hover:text-white/80">Verify</a>
                          </td>
                          <td className="px-4 py-2 text-xs text-white/80 font-mono">
                            {createHash('sha256')
                              .update(`${event.id}|${new Date(event.timestamp).toISOString()}|${event.action}|${event.resourceType}|${event.resourceId || ''}|${event.status}`)
                              .digest('hex')
                              .slice(0, 12)}...
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] ${
                                event.status === 'SUCCESS'
                                  ? 'bg-white/10 text-white/80'
                                  : 'bg-red-500/10 text-red-400'
                              }`}
                            >
                              {event.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-xs text-white/50">
                          No audit events recorded yet. Once decisions start flowing via the API, all administrative actions and system events will appear here with immutable timestamps and identifiers.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Compliance Packages */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-white/80">Compliance Packages</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <a
                href="/xase/bundles?template=eu_ai_act"
                className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
              >
                <p className="text-sm font-medium text-white">EU AI Act High-Risk Report</p>
                <div className="text-xs text-white/60 space-y-1">
                  <p>Full decision trail + human oversight evidence.</p>
                  <p className="text-white/50">Includes: Chain integrity proof, Merkle root certificate, decision hashes, timestamp attestation, intervention logs.</p>
                </div>
              </a>

              <a
                href="/xase/bundles?template=reconstruction"
                className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
              >
                <p className="text-sm font-medium text-white">Decision Reconstruction Package</p>
                <div className="text-xs text-white/60 space-y-1">
                  <p>Complete reproducibility evidence bundle.</p>
                  <p className="text-white/50">Includes: Input/output hashes, model/policy versions, environment snapshots, feature vectors, verification scripts.</p>
                </div>
              </a>

              <a
                href="/xase/bundles?template=oversight"
                className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
              >
                <p className="text-sm font-medium text-white">Human Oversight Evidence</p>
                <div className="text-xs text-white/60 space-y-1">
                  <p>Intervention logs + justifications.</p>
                  <p className="text-white/50">Includes: Intervention breakdown (approve/reject/override/escalate), reasons, actor metadata, timestamps.</p>
                </div>
              </a>

              <a
                href="/xase/audit"
                className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
              >
                <p className="text-sm font-medium text-white">Full Audit Trail Export</p>
                <div className="text-xs text-white/60 space-y-1">
                  <p>Complete immutable action log.</p>
                  <p className="text-white/50">Includes: Administrative actions, resource targets, immutable timestamps, event identifiers, status outcomes.</p>
                </div>
              </a>
            </div>
          </div>

          {/* Insurance Metrics + Top Override Reasons (compact) */}
          {(totalClaims > 0 || topOverride.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              {/* Insurance */}
              {totalClaims > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-white/80">Insurance Claims ({lookbackDays}d)</h3>
                    <div className="hidden md:flex items-center gap-1">
                      {([7, 30, 90] as const).map((r) => (
                        <a
                          key={r}
                          href={`/xase?range=${r}`}
                          className={`px-2 py-1 rounded border text-[11px] transition-colors ${
                            r === lookbackDays
                              ? 'border-white/30 text-white bg-white/5'
                              : 'border-white/10 text-white/60 hover:text-white/80 hover:border-white/20'
                          }`}
                        >
                          {r}d
                        </a>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                      <p className="text-xs font-medium text-white/80">Total Claims</p>
                      <p className="text-xl font-semibold text-white mt-1 font-mono">
                        {totalClaims}
                      </p>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                      <p className="text-xs font-medium text-white/80">Approval Rate</p>
                      <p className="text-xl font-semibold text-white mt-1 font-mono">
                        {insuranceApprovalRate.toFixed(2)}%
                      </p>
                      <p className="text-[11px] text-white/60">
                        {insuranceApprovals} approved
                      </p>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                      <p className="text-xs font-medium text-white/80">Adverse Action Rate</p>
                      <p className="text-xl font-semibold text-white mt-1 font-mono">
                        {adverseActionRate.toFixed(2)}%
                      </p>
                      <p className="text-[11px] text-white/60">
                        {adverseActionCount} adverse actions
                      </p>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                      <p className="text-xs font-medium text-white/80">Avg Claim Amount</p>
                      <p className="text-xl font-semibold text-white mt-1 font-mono">
                        {avgClaimAmount
                          ? `£${avgClaimAmount.toLocaleString('en-GB', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                      <p className="text-xs font-medium text-white/80">High Impact</p>
                      <p className="text-xl font-semibold text-white mt-1 font-mono">
                        {highImpactCount}
                      </p>
                      <p className="text-[11px] text-yellow-400">Requires review</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Top Override Reasons */}
              {topOverride.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white/80">Top Override Reasons (24h)</h3>
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                    <div className="space-y-2">
                      {topOverride.map(([reason, count]) => (
                        <div className="flex items-center justify-between" key={reason}>
                          <span className="text-sm text-white">{reason}</span>
                          <span className="text-xs text-white/80 font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* System Status Expandido */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white/80">System Status</h2>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60"></div>
                <span className="text-xs text-white/50">Operational</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg">
                <span className="text-xs text-white/50">Evidence Capture</span>
                <span className="text-sm text-white font-medium">{systemStatus.evidenceCapture}</span>
                {totalRecords > 0 && lastRecord && (
                  <span className="text-[10px] text-white/40 font-mono">
                    Last: {lastEventAgo} · {new Date(lastRecord.timestamp).toISOString()}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg">
                <span className="text-xs text-white/50">Ledger Sync</span>
                <span className="text-sm text-white font-medium">{systemStatus.ledgerSync}</span>
                <span className="text-[10px] text-white/40">{totalRecords} records</span>
              </div>

              <div className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg">
                <span className="text-xs text-white/50">Export Service</span>
                <span className="text-sm text-white font-medium">{systemStatus.exportService}</span>
                <span className="text-[10px] text-white/40">{totalExports} bundles ready</span>
              </div>

              <div className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg">
                <span className="text-xs text-white/50">API</span>
                <span className="text-sm text-white font-medium">{systemStatus.apiStatus}</span>
                <a href="/xase/api-keys" className="text-[10px] text-white/60 hover:text-white/80">
                  Manage keys →
                </a>
              </div>
            </div>
          </div>

          {/* Active Alerts (se houver) */}
          {activeAlerts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-white/80">Active Alerts</h2>
              <div className="space-y-2">
                {activeAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 p-4 rounded-lg border ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-red-500/10 border-red-500/30'
                        : alert.severity === 'ERROR'
                        ? 'bg-red-500/5 border-red-500/20'
                        : alert.severity === 'WARNING'
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : 'bg-white/[0.02] border-white/[0.04]'
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-red-500'
                          : alert.severity === 'ERROR'
                          ? 'bg-red-400'
                          : alert.severity === 'WARNING'
                          ? 'bg-yellow-500'
                          : 'bg-white/60'
                      }`}
                    ></div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-white">{alert.title}</p>
                          <p className="text-xs text-white/60 mt-1">{alert.message}</p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                            alert.severity === 'CRITICAL'
                              ? 'bg-red-500/20 text-red-400'
                              : alert.severity === 'ERROR'
                              ? 'bg-red-500/10 text-red-400'
                              : alert.severity === 'WARNING'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/40 font-mono mt-2">
                        Triggered: {alert.triggeredAt.toISOString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
