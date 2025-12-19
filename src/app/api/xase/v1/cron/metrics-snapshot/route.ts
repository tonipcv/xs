import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createMetricsSnapshot, detectAnomalies } from '@/lib/xase/metrics'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/xase/v1/cron/metrics-snapshot
 * Cron job para criar snapshots de métricas e detectar anomalias
 * 
 * Deve ser chamado periodicamente (ex: a cada hora via Vercel Cron ou similar)
 * 
 * Headers:
 * - Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: Request) {
  try {
    // Validar secret do cron
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || 'dev_secret'
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    // Buscar todos os tenants ativos
    const tenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    })

    const results: Array<{
      tenant_id: string
      tenant_name: string
      snapshot_id?: string
      anomalies_detected?: number
      alerts_created?: number
      error?: string
    }> = []

    for (const tenant of tenants) {
      try {
        // Criar snapshot horário
        const snapshot = await createMetricsSnapshot(
          tenant.id,
          'HOURLY',
          oneHourAgo,
          now
        )

        // Detectar anomalias
        const anomalies = await detectAnomalies(tenant.id)

        // Criar alertas para anomalias detectadas
        for (const anomaly of anomalies) {
          // Verificar se já existe alerta similar aberto (evitar spam)
          const existingAlert = await prisma.alert.findFirst({
            where: {
              tenantId: tenant.id,
              alertType: anomaly.type,
              status: 'OPEN',
              triggeredAt: {
                gte: new Date(now.getTime() - 60 * 60 * 1000), // Última hora
              },
            },
          })

          if (!existingAlert) {
            await prisma.alert.create({
              data: {
                tenantId: tenant.id,
                alertType: anomaly.type,
                severity: anomaly.severity,
                status: 'OPEN',
                title: `${anomaly.type.replace(/_/g, ' ')} Detected`,
                message: anomaly.message,
                metricName: anomaly.metricName,
                metricValue: anomaly.currentValue,
                thresholdValue: anomaly.threshold,
                details: JSON.stringify({
                  detection_time: now.toISOString(),
                  period: 'last_24h',
                }),
                recommendations: JSON.stringify([
                  'Review recent model changes',
                  'Check data quality',
                  'Investigate human interventions',
                ]),
              },
            })
          }
        }

        results.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          snapshot_id: snapshot.id,
          anomalies_detected: anomalies.length,
          alerts_created: anomalies.filter(
            (a) => !results.find((r) => r.tenant_id === tenant.id)
          ).length,
        })
      } catch (error: any) {
        console.error(`[Metrics Snapshot] Error for tenant ${tenant.id}:`, error.message)
        results.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          error: error.message,
        })
      }
    }

    return NextResponse.json({
      message: 'Metrics snapshots created successfully',
      timestamp: now.toISOString(),
      tenants_processed: tenants.length,
      results,
    })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown')
    console.error('[Metrics Snapshot Cron] Error:', message)
    return NextResponse.json({ error: 'CRON_ERROR', message }, { status: 500 })
  }
}
