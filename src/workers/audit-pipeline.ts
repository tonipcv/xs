// @ts-nocheck
/**
 * AUDIT PIPELINE WORKER
 * 
 * Pipeline que sincroniza audit logs do PostgreSQL para ClickHouse
 * com hash chaining HMAC.
 * 
 * Uso: node dist/workers/audit-pipeline.js
 */

import { prisma } from '../lib/prisma'
import { insertAuditEvent, insertDataAccessEvent, insertPolicyDecision } from '../lib/xase/clickhouse-client'
import { getClickHouseClient } from '@/lib/xase/clickhouse-client'

const BATCH_SIZE = 1000
const POLL_INTERVAL_MS = 10000 // 10 segundos

interface SyncStats {
  totalSynced: number
  lastSyncAt: Date
  errors: number
}

const stats: SyncStats = {
  totalSynced: 0,
  lastSyncAt: new Date(),
  errors: 0,
}

async function syncAuditLogs(): Promise<number> {
  try {
    // Buscar logs não sincronizados
    const logs = await prisma.auditLog.findMany({
      where: {
        // Adicionar campo syncedToClickHouse se não existir
        // Por enquanto, usar timestamp
      },
      take: BATCH_SIZE,
      orderBy: { timestamp: 'asc' },
    })

    if (logs.length === 0) {
      return 0
    }

    console.log(`[AuditPipeline] Syncing ${logs.length} audit logs...`)

    let synced = 0
    for (const log of logs) {
      try {
        await insertAuditEvent({
          event_id: log.id,
          tenant_id: log.tenantId,
          event_type: 'AUDIT',
          resource_type: log.resourceType,
          resource_id: log.resourceId || 'unknown',
          actor_id: log.userId || 'system',
          actor_type: 'USER',
          action: log.action,
          outcome: log.status,
          ip_address: log.ipAddress || 'unknown',
          user_agent: log.userAgent || 'unknown',
          metadata: log.metadata || '{}',
          event_timestamp: log.timestamp,
        })

        synced++
      } catch (error: any) {
        console.error(`[AuditPipeline] Failed to sync log ${log.id}:`, error.message)
        stats.errors++
      }
    }

    stats.totalSynced += synced
    stats.lastSyncAt = new Date()

    console.log(`[AuditPipeline] Synced ${synced}/${logs.length} logs (total: ${stats.totalSynced}, errors: ${stats.errors})`)

    return synced
  } catch (error: any) {
    console.error('[AuditPipeline] Error syncing audit logs:', error)
    stats.errors++
    return 0
  }
}

async function syncAccessLogs(): Promise<number> {
  try {
    const logs = await prisma.voiceAccessLog.findMany({
      take: BATCH_SIZE,
      orderBy: { timestamp: 'asc' },
      include: {
        dataset: { select: { datasetId: true } },
        policy: { select: { policyId: true } },
      },
    })

    if (logs.length === 0) {
      return 0
    }

    console.log(`[AuditPipeline] Syncing ${logs.length} access logs...`)

    let synced = 0
    for (const log of logs) {
      try {
        await insertDataAccessEvent({
          access_id: log.id,
          tenant_id: log.clientTenantId,
          dataset_id: log.dataset.datasetId,
          policy_id: log.policy.policyId,
          lease_id: '', // Adicionar se disponível
          action: log.action,
          files_accessed: log.filesAccessed || 0,
          bytes_transferred: Number(log.bytesTransferred || 0),
          hours_accessed: log.hoursAccessed || 0,
          outcome: log.outcome,
          event_timestamp: log.timestamp,
        })

        synced++
      } catch (error: any) {
        console.error(`[AuditPipeline] Failed to sync access log ${log.id}:`, error.message)
        stats.errors++
      }
    }

    stats.totalSynced += synced

    console.log(`[AuditPipeline] Synced ${synced}/${logs.length} access logs`)

    return synced
  } catch (error: any) {
    console.error('[AuditPipeline] Error syncing access logs:', error)
    stats.errors++
    return 0
  }
}

async function runPipeline() {
  console.log('[AuditPipeline] Running sync cycle...')
  
  const [auditSynced, accessSynced] = await Promise.all([
    syncAuditLogs(),
    syncAccessLogs(),
  ])

  const total = auditSynced + accessSynced
  
  if (total > 0) {
    console.log(`[AuditPipeline] Sync cycle complete: ${total} events synced`)
  }
}

async function main() {
  console.log('[AuditPipeline] Starting audit pipeline worker')
  console.log(`[AuditPipeline] Batch size: ${BATCH_SIZE}, Poll interval: ${POLL_INTERVAL_MS}ms`)

  // Graceful shutdown
  let isShuttingDown = false

  process.on('SIGINT', () => {
    console.log('[AuditPipeline] Received SIGINT, shutting down...')
    isShuttingDown = true
  })

  process.on('SIGTERM', () => {
    console.log('[AuditPipeline] Received SIGTERM, shutting down...')
    isShuttingDown = true
  })

  // Run initial sync
  await runPipeline()

  // Schedule periodic sync
  const interval = setInterval(async () => {
    if (isShuttingDown) {
      clearInterval(interval)
      console.log('[AuditPipeline] Shutdown complete')
      process.exit(0)
      return
    }

    await runPipeline()
  }, POLL_INTERVAL_MS)

  // Keep process alive
  process.on('beforeExit', () => {
    if (!isShuttingDown) {
      console.log('[AuditPipeline] Process exiting unexpectedly')
    }
  })
}

// Start worker
main().catch((error) => {
  console.error('[AuditPipeline] Fatal error:', error)
  process.exit(1)
})
