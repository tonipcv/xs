// @ts-nocheck
/**
 * CLICKHOUSE CLIENT
 * ClickHouse Client for XASE
 * Handles immutable audit trail storage with cryptographic verification
 */

import { createClient, ClickHouseClient as CHClient } from '@clickhouse/client'
import { generateHMAC } from './crypto'
import { getKMSProvider } from './kms'

let client: CHClient | null = null

export function getClickHouseClient(): CHClient {
  if (!client) {
    const url = process.env.CLICKHOUSE_URL || 'http://localhost:8123'
    const username = process.env.CLICKHOUSE_USER || 'xase'
    const password = process.env.CLICKHOUSE_PASSWORD || 'xase_dev_password'
    const database = process.env.CLICKHOUSE_DATABASE || 'xase_audit'

    client = createClient({
      url,
      username,
      password,
      database,
      request_timeout: 30000,
      compression: {
        request: true,
        response: true,
      },
    })

    console.log(`[ClickHouse] Connected to ${url}/${database}`)
  }

  return client
}

export interface AuditEvent {
  event_id: string
  tenant_id: string
  event_type: string
  resource_type: string
  resource_id: string
  actor_id: string
  actor_type: string
  action: string
  outcome: string
  ip_address: string
  user_agent: string
  metadata: string
  event_timestamp: Date
}

export interface PolicyDecisionEvent {
  decision_id: string
  tenant_id: string
  policy_id: string
  dataset_id: string
  principal: string
  purpose: string
  environment: string
  decision: string
  reasons: string[]
  latency_ms: number
  event_timestamp: Date
}

export interface DataAccessEvent {
  access_id: string
  tenant_id: string
  dataset_id: string
  policy_id: string
  lease_id: string
  action: string
  files_accessed: number
  bytes_transferred: number
  hours_accessed: number
  outcome: string
  event_timestamp: Date
}

export interface ConsentEvent {
  event_id: string
  tenant_id: string
  dataset_id: string
  user_id: string
  consent_status: string
  consent_version: string
  reason: string
  changed_by: string
  event_timestamp: Date
}

/**
 * Hash chaining manager per tenant
 */
class ChainManager {
  private chains: Map<string, { lastHash: string; index: number }> = new Map()
  private readonly CHECKPOINT_INTERVAL = 10000 // Every 10K events

  async getLastHash(tenantId: string, tableName: string): Promise<{ hash: string; index: number }> {
    const key = `${tenantId}:${tableName}`
    
    if (this.chains.has(key)) {
      return this.chains.get(key)!
    }

    // Fetch from ClickHouse
    const client = getClickHouseClient()
    const result = await client.query({
      query: `
        SELECT event_hash, chain_index
        FROM ${tableName}
        WHERE tenant_id = {tenant_id:String}
        ORDER BY chain_index DESC
        LIMIT 1
      `,
      query_params: { tenant_id: tenantId },
      format: 'JSONEachRow',
    })

    const rows = await result.json<{ event_hash: string; chain_index: string }>()
    
    if (rows.length > 0) {
      const lastHash = rows[0].event_hash
      const index = parseInt(rows[0].chain_index, 10)
      this.chains.set(key, { lastHash, index })
      return { hash: lastHash, index }
    }

    // Genesis hash
    const genesisHash = generateHMAC(`genesis:${tenantId}:${tableName}`, process.env.XASE_HMAC_SECRET || 'dev-secret')
    this.chains.set(key, { lastHash: genesisHash, index: 0 })
    return { hash: genesisHash, index: 0 }
  }

  updateChain(tenantId: string, tableName: string, hash: string, index: number) {
    const key = `${tenantId}:${tableName}`
    this.chains.set(key, { lastHash: hash, index })
  }

  shouldCheckpoint(index: number): boolean {
    return index > 0 && index % this.CHECKPOINT_INTERVAL === 0
  }
}

const chainManager = new ChainManager()

/**
 * Insert audit event with hash chaining
 */
export async function insertAuditEvent(event: AuditEvent): Promise<void> {
  const client = getClickHouseClient()
  const tableName = 'audit_events'

  // Get last hash and index
  const { hash: previousHash, index: previousIndex } = await chainManager.getLastHash(event.tenant_id, tableName)
  const chainIndex = previousIndex + 1

  // Compute event hash (HMAC of event data + previous hash)
  const eventData = JSON.stringify({
    ...event,
    previous_hash: previousHash,
    chain_index: chainIndex,
  })
  const eventHash = generateHMAC(eventData, process.env.XASE_HMAC_SECRET || 'dev-secret')

  // Check if checkpoint needed
  let checkpointSignature = ''
  let checkpointIndex = 0
  if (chainManager.shouldCheckpoint(chainIndex)) {
    const kms = getKMSProvider()
    checkpointSignature = await kms.sign(eventHash)
    checkpointIndex = chainIndex

    // Store checkpoint
    await client.insert({
      table: 'kms_checkpoints',
      values: [{
        checkpoint_id: `ckpt_${event.tenant_id}_${chainIndex}`,
        tenant_id: event.tenant_id,
        table_name: tableName,
        chain_index: chainIndex,
        event_count: chainIndex,
        last_event_hash: eventHash,
        signature: checkpointSignature,
        kms_key_id: process.env.KMS_KEY_ID || 'mock',
      }],
      format: 'JSONEachRow',
    })
  }

  // Insert event
  await client.insert({
    table: tableName,
    values: [{
      ...event,
      event_hash: eventHash,
      previous_hash: previousHash,
      chain_index: chainIndex,
      checkpoint_signature: checkpointSignature,
      checkpoint_index: checkpointIndex,
    }],
    format: 'JSONEachRow',
  })

  // Update chain
  chainManager.updateChain(event.tenant_id, tableName, eventHash, chainIndex)
}

/**
 * Insert policy decision event with hash chaining
 */
export async function insertPolicyDecision(event: PolicyDecisionEvent): Promise<void> {
  const client = getClickHouseClient()
  const tableName = 'policy_decisions'

  const { hash: previousHash, index: previousIndex } = await chainManager.getLastHash(event.tenant_id, tableName)
  const chainIndex = previousIndex + 1

  const eventData = JSON.stringify({ ...event, previous_hash: previousHash, chain_index: chainIndex })
  const eventHash = generateHMAC(eventData, process.env.XASE_HMAC_SECRET || 'dev-secret')

  await client.insert({
    table: tableName,
    values: [{
      ...event,
      event_hash: eventHash,
      previous_hash: previousHash,
      chain_index: chainIndex,
    }],
    format: 'JSONEachRow',
  })

  chainManager.updateChain(event.tenant_id, tableName, eventHash, chainIndex)
}

/**
 * Insert data access event with hash chaining
 */
export async function insertDataAccessEvent(event: DataAccessEvent): Promise<void> {
  const client = getClickHouseClient()
  const tableName = 'data_access_events'

  const { hash: previousHash, index: previousIndex } = await chainManager.getLastHash(event.tenant_id, tableName)
  const chainIndex = previousIndex + 1

  const eventData = JSON.stringify({ ...event, previous_hash: previousHash, chain_index: chainIndex })
  const eventHash = generateHMAC(eventData, process.env.XASE_HMAC_SECRET || 'dev-secret')

  await client.insert({
    table: tableName,
    values: [{
      ...event,
      event_hash: eventHash,
      previous_hash: previousHash,
      chain_index: chainIndex,
    }],
    format: 'JSONEachRow',
  })

  chainManager.updateChain(event.tenant_id, tableName, eventHash, chainIndex)
}

/**
 * Insert consent event with hash chaining
 */
export async function insertConsentEvent(event: ConsentEvent): Promise<void> {
  const client = getClickHouseClient()
  const tableName = 'consent_events'

  const { hash: previousHash, index: previousIndex } = await chainManager.getLastHash(event.tenant_id, tableName)
  const chainIndex = previousIndex + 1

  const eventData = JSON.stringify({ ...event, previous_hash: previousHash, chain_index: chainIndex })
  const eventHash = generateHMAC(eventData, process.env.XASE_HMAC_SECRET || 'dev-secret')

  await client.insert({
    table: tableName,
    values: [{
      ...event,
      event_hash: eventHash,
      previous_hash: previousHash,
      chain_index: chainIndex,
    }],
    format: 'JSONEachRow',
  })

  chainManager.updateChain(event.tenant_id, tableName, eventHash, chainIndex)
}

/**
 * Verify chain integrity for a tenant
 */
export async function verifyChainIntegrity(
  tenantId: string,
  tableName: string,
  fromIndex: number = 0,
  toIndex?: number
): Promise<{ valid: boolean; errors: string[] }> {
  const client = getClickHouseClient()
  const errors: string[] = []

  const query = toIndex
    ? `SELECT * FROM ${tableName} WHERE tenant_id = {tenant_id:String} AND chain_index >= {from:UInt64} AND chain_index <= {to:UInt64} ORDER BY chain_index`
    : `SELECT * FROM ${tableName} WHERE tenant_id = {tenant_id:String} AND chain_index >= {from:UInt64} ORDER BY chain_index`

  const result = await client.query({
    query,
    query_params: { tenant_id: tenantId, from: fromIndex, to: toIndex || 0 },
    format: 'JSONEachRow',
  })

  const events = await result.json<any>()

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const { event_hash, previous_hash, chain_index, ...eventData } = event

    // Recompute hash
    const recomputedData = JSON.stringify({ ...eventData, previous_hash, chain_index })
    const recomputedHash = generateHMAC(recomputedData, process.env.XASE_HMAC_SECRET || 'dev-secret')

    if (recomputedHash !== event_hash) {
      errors.push(`Chain broken at index ${chain_index}: hash mismatch`)
    }

    // Verify chain linkage
    if (i > 0) {
      const prevEvent = events[i - 1]
      if (previous_hash !== prevEvent.event_hash) {
        errors.push(`Chain broken at index ${chain_index}: previous_hash mismatch`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Query audit events
 */
export async function queryAuditEvents(params: {
  tenantId: string
  eventType?: string
  resourceType?: string
  fromDate?: Date
  toDate?: Date
  limit?: number
}): Promise<any[]> {
  const client = getClickHouseClient()
  
  let whereClause = `tenant_id = {tenant_id:String}`
  const queryParams: any = { tenant_id: params.tenantId }

  if (params.eventType) {
    whereClause += ` AND event_type = {event_type:String}`
    queryParams.event_type = params.eventType
  }

  if (params.resourceType) {
    whereClause += ` AND resource_type = {resource_type:String}`
    queryParams.resource_type = params.resourceType
  }

  if (params.fromDate) {
    whereClause += ` AND event_timestamp >= {from_date:DateTime64(3)}`
    queryParams.from_date = params.fromDate.toISOString()
  }

  if (params.toDate) {
    whereClause += ` AND event_timestamp <= {to_date:DateTime64(3)}`
    queryParams.to_date = params.toDate.toISOString()
  }

  const limit = params.limit || 100

  const result = await client.query({
    query: `
      SELECT *
      FROM audit_events
      WHERE ${whereClause}
      ORDER BY event_timestamp DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { ...queryParams, limit },
    format: 'JSONEachRow',
  })

  return await result.json()
}
