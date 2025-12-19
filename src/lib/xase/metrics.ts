/**
 * XASE Metrics Library
 * Funções para cálculo e agregação de métricas
 */

import { prisma } from '@/lib/prisma'

export interface MetricsCalculationOptions {
  tenantId: string
  periodStart: Date
  periodEnd: Date
  modelId?: string
  policyId?: string
  decisionType?: string
}

export interface MetricsResult {
  totalDecisions: number
  aiDecisions: number
  humanInterventions: number
  overrideCount: number
  approvalCount: number
  rejectionCount: number
  overrideRate: number
  interventionRate: number
  approvalRate: number
  avgConfidence: number | null
  avgProcessingTimeMs: number | null
  metricsByModel: Record<string, any>
  metricsByPolicy: Record<string, any>
  topOverrideReasons: Array<{ reason: string; count: number }>
}

/**
 * Calcula métricas agregadas para um período
 */
export async function calculateMetrics(
  options: MetricsCalculationOptions
): Promise<MetricsResult> {
  const { tenantId, periodStart, periodEnd, modelId, policyId, decisionType } = options

  const whereClause: any = {
    tenantId,
    timestamp: {
      gte: periodStart,
      lte: periodEnd,
    },
  }
  if (modelId) whereClause.modelId = modelId
  if (policyId) whereClause.policyId = policyId
  if (decisionType) whereClause.decisionType = decisionType

  // Total de decisões
  const totalDecisions = await prisma.decisionRecord.count({ where: whereClause })

  // Decisões com intervenção
  const decisionsWithIntervention = await prisma.decisionRecord.count({
    where: { ...whereClause, hasHumanIntervention: true },
  })

  // Intervenções por ação
  const interventions = await prisma.humanIntervention.groupBy({
    by: ['action'],
    where: {
      tenantId,
      timestamp: { gte: periodStart, lte: periodEnd },
    },
    _count: true,
  })

  const overrideCount = interventions.find((i) => i.action === 'OVERRIDE')?._count || 0
  const approvalCount = interventions.find((i) => i.action === 'APPROVED')?._count || 0
  const rejectionCount = interventions.find((i) => i.action === 'REJECTED')?._count || 0

  // Confiança média
  const avgConfidenceResult = await prisma.decisionRecord.aggregate({
    where: whereClause,
    _avg: { confidence: true },
  })

  // Tempo de processamento
  const processingTimeResult = await prisma.decisionRecord.aggregate({
    where: whereClause,
    _avg: { processingTime: true },
  })

  // Top motivos de override
  const recentOverrides = await prisma.humanIntervention.findMany({
    where: {
      tenantId,
      action: 'OVERRIDE',
      timestamp: { gte: periodStart, lte: periodEnd },
    },
    select: { reason: true },
    take: 100,
  })

  const reasonCounts: Record<string, number> = {}
  recentOverrides.forEach((o) => {
    const reason = o.reason || 'No reason provided'
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
  })
  const topOverrideReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }))

  // Métricas por modelo
  const metricsByModel: Record<string, any> = {}
  if (!modelId) {
    const decisionsByModel = await prisma.decisionRecord.groupBy({
      by: ['modelId'],
      where: { ...whereClause, modelId: { not: null } },
      _count: true,
      _avg: { confidence: true },
    })

    for (const model of decisionsByModel) {
      if (!model.modelId) continue
      const modelOverrides = await prisma.humanIntervention.count({
        where: {
          tenantId,
          action: 'OVERRIDE',
          timestamp: { gte: periodStart, lte: periodEnd },
          record: { modelId: model.modelId },
        },
      })

      metricsByModel[model.modelId] = {
        decisions: model._count,
        overrides: modelOverrides,
        override_rate: model._count > 0 ? (modelOverrides / model._count) * 100 : 0,
        avg_confidence: model._avg.confidence,
      }
    }
  }

  // Métricas por política
  const metricsByPolicy: Record<string, any> = {}
  if (!policyId) {
    const decisionsByPolicy = await prisma.decisionRecord.groupBy({
      by: ['policyId'],
      where: { ...whereClause, policyId: { not: null } },
      _count: true,
    })

    for (const policy of decisionsByPolicy) {
      if (!policy.policyId) continue
      metricsByPolicy[policy.policyId] = {
        decisions: policy._count,
      }
    }
  }

  // Calcular taxas
  const aiDecisions = totalDecisions - decisionsWithIntervention
  const overrideRate = totalDecisions > 0 ? (overrideCount / totalDecisions) * 100 : 0
  const interventionRate =
    totalDecisions > 0 ? (decisionsWithIntervention / totalDecisions) * 100 : 0
  const approvalRate =
    decisionsWithIntervention > 0 ? (approvalCount / decisionsWithIntervention) * 100 : 0

  return {
    totalDecisions,
    aiDecisions,
    humanInterventions: decisionsWithIntervention,
    overrideCount,
    approvalCount,
    rejectionCount,
    overrideRate: Math.round(overrideRate * 100) / 100,
    interventionRate: Math.round(interventionRate * 100) / 100,
    approvalRate: Math.round(approvalRate * 100) / 100,
    avgConfidence: avgConfidenceResult._avg.confidence
      ? Math.round(avgConfidenceResult._avg.confidence * 1000) / 1000
      : null,
    avgProcessingTimeMs: processingTimeResult._avg.processingTime
      ? Math.round(processingTimeResult._avg.processingTime)
      : null,
    metricsByModel,
    metricsByPolicy,
    topOverrideReasons,
  }
}

/**
 * Cria snapshot de métricas para um período
 */
export async function createMetricsSnapshot(
  tenantId: string,
  snapshotType: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY',
  periodStart: Date,
  periodEnd: Date
) {
  const metrics = await calculateMetrics({ tenantId, periodStart, periodEnd })

  // Criar snapshot
  const snapshot = await prisma.metricsSnapshot.create({
    data: {
      tenantId,
      snapshotType,
      periodStart,
      periodEnd,
      totalDecisions: metrics.totalDecisions,
      aiDecisions: metrics.aiDecisions,
      humanInterventions: metrics.humanInterventions,
      overrideCount: metrics.overrideCount,
      approvalCount: metrics.approvalCount,
      rejectionCount: metrics.rejectionCount,
      overrideRate: metrics.overrideRate,
      interventionRate: metrics.interventionRate,
      approvalRate: metrics.approvalRate,
      avgConfidence: metrics.avgConfidence,
      avgProcessingTimeMs: metrics.avgProcessingTimeMs,
      metricsByModel: JSON.stringify(metrics.metricsByModel),
      metricsByPolicy: JSON.stringify(metrics.metricsByPolicy),
      topOverrideReasons: JSON.stringify(metrics.topOverrideReasons),
    },
  })

  return snapshot
}

/**
 * Detecta anomalias nas métricas
 */
export async function detectAnomalies(tenantId: string): Promise<Array<{
  type: string
  severity: string
  message: string
  metricName: string
  currentValue: number
  threshold: number
}>> {
  const anomalies: Array<any> = []
  
  // Período atual (últimas 24h)
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  
  // Período de referência (24h-48h atrás)
  const last48h = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  
  const currentMetrics = await calculateMetrics({
    tenantId,
    periodStart: last24h,
    periodEnd: now,
  })
  
  const referenceMetrics = await calculateMetrics({
    tenantId,
    periodStart: last48h,
    periodEnd: last24h,
  })

  // Detectar spike em override rate
  if (currentMetrics.overrideRate > referenceMetrics.overrideRate * 1.5 && currentMetrics.overrideRate > 10) {
    anomalies.push({
      type: 'HIGH_OVERRIDE_RATE',
      severity: currentMetrics.overrideRate > 30 ? 'CRITICAL' : 'WARNING',
      message: `Override rate increased from ${referenceMetrics.overrideRate.toFixed(1)}% to ${currentMetrics.overrideRate.toFixed(1)}%`,
      metricName: 'override_rate',
      currentValue: currentMetrics.overrideRate,
      threshold: referenceMetrics.overrideRate * 1.5,
    })
  }

  // Detectar queda em confiança
  if (
    currentMetrics.avgConfidence &&
    referenceMetrics.avgConfidence &&
    currentMetrics.avgConfidence < referenceMetrics.avgConfidence * 0.9
  ) {
    anomalies.push({
      type: 'LOW_CONFIDENCE',
      severity: currentMetrics.avgConfidence < 0.7 ? 'ERROR' : 'WARNING',
      message: `Average confidence dropped from ${referenceMetrics.avgConfidence.toFixed(3)} to ${currentMetrics.avgConfidence.toFixed(3)}`,
      metricName: 'avg_confidence',
      currentValue: currentMetrics.avgConfidence,
      threshold: referenceMetrics.avgConfidence * 0.9,
    })
  }

  return anomalies
}
