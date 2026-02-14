// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { z } from 'zod'

/**
 * GET /api/v1/alerts
 * Sistema de alertas para dashboard
 * Substitui /api/xase/v1/alerts
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 1200, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const url = new URL(req.url)
    const QuerySchema = z.object({
      status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 })
    }
    
    const { status, severity, limit } = parsed.data
    const take = Math.min(limit ?? 10, 100)

    // Para MVP: retornar alertas baseados em condições do sistema
    const alerts: any[] = []

    // Alerta 1: Datasets com processamento falho
    const failedDatasets = await prisma.dataset.count({
      where: {
        tenantId: auth.tenantId,
        processingStatus: 'FAILED',
      },
    })

    if (failedDatasets > 0) {
      alerts.push({
        id: 'alert_failed_processing',
        type: 'PROCESSING_FAILED',
        severity: 'HIGH',
        status: 'OPEN',
        title: 'Datasets com processamento falho',
        message: `${failedDatasets} dataset(s) falharam no processamento`,
        count: failedDatasets,
        createdAt: new Date(),
      })
    }

    // Alerta 2: Policies expirando em breve (próximos 7 dias)
    const expiringPolicies = await prisma.voiceAccessPolicy.count({
      where: {
        dataset: { tenantId: auth.tenantId },
        status: 'ACTIVE',
        expiresAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    })

    if (expiringPolicies > 0) {
      alerts.push({
        id: 'alert_expiring_policies',
        type: 'POLICY_EXPIRING',
        severity: 'MEDIUM',
        status: 'OPEN',
        title: 'Políticas expirando em breve',
        message: `${expiringPolicies} política(s) expiram nos próximos 7 dias`,
        count: expiringPolicies,
        createdAt: new Date(),
      })
    }

    // Alerta 3: Policies próximas do limite de horas
    const nearLimitPolicies = await prisma.voiceAccessPolicy.findMany({
      where: {
        dataset: { tenantId: auth.tenantId },
        status: 'ACTIVE',
        maxHours: { not: null },
      },
      select: {
        id: true,
        maxHours: true,
        hoursConsumed: true,
      },
    })

    const policiesNearLimit = nearLimitPolicies.filter(p => {
      if (!p.maxHours) return false
      const utilizationPercent = (p.hoursConsumed / p.maxHours) * 100
      return utilizationPercent >= 80
    })

    if (policiesNearLimit.length > 0) {
      alerts.push({
        id: 'alert_quota_near_limit',
        type: 'QUOTA_WARNING',
        severity: 'MEDIUM',
        status: 'OPEN',
        title: 'Políticas próximas do limite',
        message: `${policiesNearLimit.length} política(s) com mais de 80% de uso`,
        count: policiesNearLimit.length,
        createdAt: new Date(),
      })
    }

    // Filtrar por status e severity se especificado
    let filteredAlerts = alerts
    if (status) {
      filteredAlerts = filteredAlerts.filter(a => a.status === status)
    }
    if (severity) {
      filteredAlerts = filteredAlerts.filter(a => a.severity === severity)
    }

    // Limitar quantidade
    filteredAlerts = filteredAlerts.slice(0, take)

    return NextResponse.json({ alerts: filteredAlerts })
  } catch (err: any) {
    console.error('[API] GET /api/v1/alerts error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
