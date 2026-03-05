/**
 * CONSENT SUBSCRIBER WORKER
 * 
 * Worker que consome eventos de revogação de consentimento do Redis Stream
 * e invalida cache em tempo real (<60s).
 * 
 * Uso: node dist/workers/consent-subscriber.js
 */

import { ConsentManager } from '../lib/xase/consent-manager'
import { getClickHouseClient } from '../lib/xase/clickhouse-client'

const CONSUMER_GROUP = 'pep-enforcement'
const CONSUMER_NAME = `pep-worker-${process.pid}`
const consentManager = new ConsentManager()
const clickhouse = getClickHouseClient()

type ConsentRevocationEvent = {
  datasetId: string
  tenantId: string
  userId?: string
  revokedBy?: string
  reason?: string
  timestamp: number
}

async function handleRevocation(event: ConsentRevocationEvent): Promise<void> {
  const startTime = Date.now()
  
  try {
    console.log(`[ConsentWorker] Processing revocation for dataset ${event.datasetId}`)
    
    // 1. Invalidar cache local
    if (typeof (consentManager as any).invalidateCache === 'function') {
      await (consentManager as any).invalidateCache(event.datasetId)
    }

    // 2. Registrar no ClickHouse para auditoria
    await clickhouse
      .insert('consent_events', [
        {
          event_id: `consent_${event.datasetId}_${Date.now()}`,
          tenant_id: event.tenantId,
          dataset_id: event.datasetId,
          user_id: event.userId || 'system',
          consent_status: 'REVOKED',
          consent_version: '',
          reason: event.reason || 'User revoked consent',
          changed_by: event.revokedBy,
          event_timestamp: new Date(event.timestamp),
        },
      ])
      .catch(err => {
        console.error('[ConsentWorker] Failed to log to ClickHouse:', err)
        // Não falhar o processamento se ClickHouse estiver indisponível
      })
    
    const latency = Date.now() - startTime
    console.log(`[ConsentWorker] Revocation processed in ${latency}ms`)
    
    // Alertar se latência > 30s
    if (latency > 30000) {
      console.warn(`[ConsentWorker] HIGH LATENCY: ${latency}ms for dataset ${event.datasetId}`)
    }
  } catch (error: any) {
    console.error('[ConsentWorker] Error processing revocation:', error)
    throw error // Re-throw para retry
  }
}

async function main() {
  console.log(`[ConsentWorker] Starting consent subscriber worker`)
  console.log(`[ConsentWorker] Consumer: ${CONSUMER_GROUP}/${CONSUMER_NAME}`)
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[ConsentWorker] Received SIGINT, shutting down...')
    process.exit(0)
  })
  
  process.on('SIGTERM', () => {
    console.log('[ConsentWorker] Received SIGTERM, shutting down...')
    process.exit(0)
  })
  
  // Subscribe to revocation events
  if (typeof (consentManager as any).subscribeToRevocations === 'function') {
    await (consentManager as any).subscribeToRevocations(
      handleRevocation,
      CONSUMER_GROUP,
      CONSUMER_NAME
    )
    return
  }

  console.warn('[ConsentWorker] Consent manager subscription not available; worker idle.')
}

// Start worker
main().catch((error) => {
  console.error('[ConsentWorker] Fatal error:', error)
  process.exit(1)
})
