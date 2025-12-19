import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, hasPermission } from '@/lib/xase/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/xase/v1/metrics
 * Retorna métricas agregadas do tenant
 * 
 * Query params:
 * - period: "1h", "24h", "7d", "30d", "90d" (default: "24h")
 * - model_id: filtrar por modelo específico
 * - policy_id: filtrar por política específica
 * - decision_type: filtrar por tipo de decisão
 */
export async function GET(request: NextRequest) {
  try {
    // Auth: API Key OU sessão autenticada (fallback)
    const auth = await validateApiKey(request)
    let tenantId: string | null = null
    let viaApiKey = false

    if (auth.valid) {
      tenantId = auth.tenantId!
      viaApiKey = true
      // API Key precisa ter permissão de leitura/verify
      if (!hasPermission(auth, 'verify')) {
        return NextResponse.json(
          { error: 'API key does not have verify permission', code: 'FORBIDDEN' },
          { status: 403 }
        )
      }
    } else {
      // Fallback: sessão autenticada
      tenantId = await getTenantId()
      if (!tenantId) {
        return NextResponse.json({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }, { status: 401 })
      }
    }

    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || '24h'
    const modelId = searchParams.get('model_id')
    const policyId = searchParams.get('policy_id')
    const decisionType = searchParams.get('decision_type')

    // Calcular período de tempo
    const now = new Date()
    const periodMap: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
    }
    const periodMs = periodMap[period] || periodMap['24h']
    const startDate = new Date(now.getTime() - periodMs)

    // Filtros
    const whereClause: any = {
      tenantId: tenantId!,
      timestamp: {
        gte: startDate,
        lte: now,
      },
    }
    if (modelId) whereClause.modelId = modelId
    if (policyId) whereClause.policyId = policyId
    if (decisionType) whereClause.decisionType = decisionType

    // Query: Total de decisões
    const totalDecisions = await prisma.decisionRecord.count({
      where: whereClause,
    })

    // Query: Decisões com intervenção humana
    const decisionsWithIntervention = await prisma.decisionRecord.count({
      where: {
        ...whereClause,
        hasHumanIntervention: true,
      },
    })

    // Query: Decisões por fonte final
    const decisionsBySource = await prisma.decisionRecord.groupBy({
      by: ['finalDecisionSource'],
      where: whereClause,
      _count: true,
    })

    // Query: Intervenções por ação
    const interventionsByAction = await prisma.humanIntervention.groupBy({
      by: ['action'],
      where: {
        tenantId: tenantId!,
        timestamp: {
          gte: startDate,
          lte: now,
        },
      },
      _count: true,
    })

    // Query: Confiança média
    const avgConfidence = await prisma.decisionRecord.aggregate({
      where: whereClause,
      _avg: {
        confidence: true,
      },
    })

    // Query: Tempo de processamento
    const processingTimeStats = await prisma.decisionRecord.aggregate({
      where: whereClause,
      _avg: {
        processingTime: true,
      },
    })

    // Query: Top motivos de override (últimos 100 overrides)
    const recentOverrides = await prisma.humanIntervention.findMany({
      where: {
        tenantId: tenantId!,
        action: 'OVERRIDE',
        timestamp: {
          gte: startDate,
          lte: now,
        },
      },
      select: {
        reason: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 100,
    })

    // Agregar motivos
    const reasonCounts: Record<string, number> = {}
    recentOverrides.forEach((o) => {
      const reason = o.reason || 'No reason provided'
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
    })
    const topOverrideReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }))

    // Calcular taxas
    const aiDecisions = totalDecisions - decisionsWithIntervention
    const overrideCount =
      interventionsByAction.find((i) => i.action === 'OVERRIDE')?._count || 0
    const approvalCount =
      interventionsByAction.find((i) => i.action === 'APPROVED')?._count || 0
    const rejectionCount =
      interventionsByAction.find((i) => i.action === 'REJECTED')?._count || 0

    const overrideRate = totalDecisions > 0 ? (overrideCount / totalDecisions) * 100 : 0
    const interventionRate =
      totalDecisions > 0 ? (decisionsWithIntervention / totalDecisions) * 100 : 0
    const approvalRate =
      decisionsWithIntervention > 0
        ? (approvalCount / decisionsWithIntervention) * 100
        : 0

    // Métricas por modelo
    const metricsByModel: Record<string, any> = {}
    if (!modelId) {
      const decisionsByModel = await prisma.decisionRecord.groupBy({
        by: ['modelId'],
        where: {
          ...whereClause,
          modelId: { not: null },
        },
        _count: true,
        _avg: {
          confidence: true,
        },
      })

      for (const model of decisionsByModel) {
        if (!model.modelId) continue
        const modelOverrides = await prisma.humanIntervention.count({
          where: {
            tenantId: tenantId!,
            action: 'OVERRIDE',
            timestamp: {
              gte: startDate,
              lte: now,
            },
            record: {
              modelId: model.modelId,
            },
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

    // Resposta
    const response = {
      period,
      period_start: startDate.toISOString(),
      period_end: now.toISOString(),
      filters: {
        model_id: modelId || null,
        policy_id: policyId || null,
        decision_type: decisionType || null,
      },
      summary: {
        total_decisions: totalDecisions,
        ai_decisions: aiDecisions,
        human_interventions: decisionsWithIntervention,
        override_count: overrideCount,
        approval_count: approvalCount,
        rejection_count: rejectionCount,
      },
      rates: {
        override_rate: Math.round(overrideRate * 100) / 100,
        intervention_rate: Math.round(interventionRate * 100) / 100,
        approval_rate: Math.round(approvalRate * 100) / 100,
      },
      performance: {
        avg_confidence: avgConfidence._avg.confidence
          ? Math.round(avgConfidence._avg.confidence * 1000) / 1000
          : null,
        avg_processing_time_ms: processingTimeStats._avg.processingTime
          ? Math.round(processingTimeStats._avg.processingTime)
          : null,
      },
      decisions_by_source: decisionsBySource.map((d) => ({
        source: d.finalDecisionSource,
        count: d._count,
      })),
      interventions_by_action: interventionsByAction.map((i) => ({
        action: i.action,
        count: i._count,
      })),
      top_override_reasons: topOverrideReasons,
      metrics_by_model: metricsByModel,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown')
    console.error('[Metrics API] Error:', message)
    return NextResponse.json({ error: 'METRICS_ERROR', message }, { status: 500 })
  }
}
