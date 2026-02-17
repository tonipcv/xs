/**
 * CONSENT MANAGER - Real-time Consent Propagation
 * 
 * Implementa propagação de revogação de consentimento em <60s usando Redis Streams.
 * 
 * Fluxo:
 * 1. Usuário revoga consentimento via API
 * 2. Evento publicado no Redis Stream "consent:revocations"
 * 3. Subscribers (PEP, agentes federados) recebem e invalidam cache
 * 4. Próxima requisição é bloqueada
 */

import { getRedisClient } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { logAudit } from './audit'

export interface ConsentRevocationEvent {
  datasetId: string
  userId?: string
  tenantId: string
  reason?: string
  timestamp: string
  revokedBy: string
}

export interface ConsentStatus {
  status: 'VERIFIED_BY_XASE' | 'SELF_DECLARED' | 'PENDING' | 'REVOKED'
  version?: string
  hasProof: boolean
  lastUpdated: Date
}

export class ConsentManager {
  private static readonly STREAM_KEY = 'consent:revocations'
  private static readonly CACHE_PREFIX = 'consent:status:'
  private static readonly CACHE_TTL = 300 // 5 minutes

  /**
   * Revoga consentimento e propaga via Redis Streams
   */
  static async revokeConsent(params: {
    datasetId: string
    tenantId: string
    userId?: string
    reason?: string
    revokedBy: string
  }): Promise<{ success: boolean; propagatedAt: Date }> {
    const { datasetId, tenantId, userId, reason, revokedBy } = params
    const now = new Date()

    try {
      // 1. Atualizar status no banco e revogar leases ativos
      await prisma.$transaction(async (tx) => {
        // Buscar dataset ID interno
        const dataset = await tx.dataset.findFirst({
          where: { datasetId, tenantId },
          select: { id: true },
        })

        if (!dataset) {
          throw new Error(`Dataset ${datasetId} not found`)
        }

        // Atualizar dataset (usando string literal para evitar erro de enum)
        await tx.dataset.updateMany({
          where: { datasetId, tenantId },
          data: {
            consentStatus: 'REVOKED' as any,
            consentProofUri: null,
            consentProofHash: null,
          },
        })

        // Revogar todos os leases ativos para este dataset
        const revokedLeases = await tx.voiceAccessLease.updateMany({
          where: {
            datasetId: dataset.id,
            status: 'ACTIVE',
          },
          data: {
            status: 'REVOKED' as any,
            revokedAt: now,
            revokedReason: `Consent revoked: ${reason || 'User request'}`,
          },
        })

        console.log(`[ConsentManager] Revoked ${revokedLeases.count} active leases for dataset ${datasetId}`)

        // Audit log
        await tx.auditLog.create({
          data: {
            tenantId,
            action: 'CONSENT_REVOKED',
            resourceType: 'DATASET',
            resourceId: datasetId,
            metadata: JSON.stringify({ userId, reason, revokedBy, leasesRevoked: revokedLeases.count }),
            status: 'SUCCESS',
          },
        })
      })

      // 2. Publicar evento no Redis Stream
      const event: ConsentRevocationEvent = {
        datasetId,
        userId,
        tenantId,
        reason,
        timestamp: now.toISOString(),
        revokedBy,
      }

      const redis = await getRedisClient()
      await redis.xAdd(
        this.STREAM_KEY,
        '*', // auto-generate ID
        { payload: JSON.stringify(event) }
      )

      // 3. Invalidar cache
      await this.invalidateCache(datasetId)

      console.log(`[ConsentManager] Consent revoked for dataset ${datasetId}, propagated at ${now.toISOString()}`)

      return { success: true, propagatedAt: now }
    } catch (error: any) {
      console.error('[ConsentManager] Error revoking consent:', error)
      throw error
    }
  }

  /**
   * Verifica status de consentimento (com cache)
   */
  static async checkConsent(datasetId: string): Promise<ConsentStatus | null> {
    try {
      const redis = await getRedisClient()
      const cacheKey = `${this.CACHE_PREFIX}${datasetId}`

      // Tentar cache primeiro
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached) as ConsentStatus
      }

      // Buscar do banco
      const dataset = await prisma.dataset.findFirst({
        where: { datasetId },
        select: {
          consentStatus: true,
          consentVersion: true,
          consentProofHash: true,
          updatedAt: true,
        },
      })

      if (!dataset) return null

      const status: ConsentStatus = {
        status: (dataset.consentStatus as any) || 'PENDING',
        version: dataset.consentVersion || undefined,
        hasProof: !!dataset.consentProofHash,
        lastUpdated: dataset.updatedAt,
      }

      // Cachear por 5 minutos
      await redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(status))

      return status
    } catch (error: any) {
      console.error('[ConsentManager] Error checking consent:', error)
      return null
    }
  }

  /**
   * Invalida cache de consentimento
   */
  static async invalidateCache(datasetId: string): Promise<void> {
    try {
      const redis = await getRedisClient()
      const cacheKey = `${this.CACHE_PREFIX}${datasetId}`
      await redis.del(cacheKey)
    } catch (error: any) {
      console.error('[ConsentManager] Error invalidating cache:', error)
    }
  }

  /**
   * Subscribe to consent revocation events (para uso em workers)
   */
  static async subscribeToRevocations(
    callback: (event: ConsentRevocationEvent) => Promise<void>,
    consumerGroup: string = 'pep-enforcement',
    consumerName: string = 'pep-1'
  ): Promise<void> {
    const redis = await getRedisClient()

    // Criar consumer group se não existir
    try {
      await redis.xGroupCreate(this.STREAM_KEY, consumerGroup, '0', { MKSTREAM: true })
    } catch (error: any) {
      // Grupo já existe, ignorar
      if (!error.message.includes('BUSYGROUP')) {
        console.error('[ConsentManager] Error creating consumer group:', error)
      }
    }

    console.log(`[ConsentManager] Subscribing to ${this.STREAM_KEY} as ${consumerGroup}/${consumerName}`)

    // Loop de leitura
    while (true) {
      try {
        // Ler mensagens novas
        const messages = await redis.xReadGroup(
          consumerGroup,
          consumerName,
          [{ key: this.STREAM_KEY, id: '>' }],
          { COUNT: 10, BLOCK: 5000 } // Block por 5s
        )

        if (!messages || messages.length === 0) continue

        for (const stream of messages) {
          for (const message of stream.messages) {
            try {
              const payload = message.message.payload as string
              const event: ConsentRevocationEvent = JSON.parse(payload)

              // Processar evento
              await callback(event)

              // ACK mensagem
              await redis.xAck(this.STREAM_KEY, consumerGroup, message.id)
            } catch (error: any) {
              console.error('[ConsentManager] Error processing message:', error)
            }
          }
        }
      } catch (error: any) {
        console.error('[ConsentManager] Error reading stream:', error)
        await new Promise(resolve => setTimeout(resolve, 1000)) // Retry após 1s
      }
    }
  }

  /**
   * Atualiza consentimento (grant)
   */
  static async grantConsent(params: {
    datasetId: string
    tenantId: string
    status: 'VERIFIED_BY_XASE' | 'SELF_DECLARED'
    version: string
    proofUri?: string
    proofHash?: string
    grantedBy: string
  }): Promise<{ success: boolean }> {
    const { datasetId, tenantId, status, version, proofUri, proofHash, grantedBy } = params

    try {
      await prisma.$transaction(async (tx) => {
        await tx.dataset.updateMany({
          where: { datasetId, tenantId },
          data: {
            consentStatus: status,
            consentVersion: version,
            consentProofUri: proofUri || null,
            consentProofHash: proofHash || null,
          },
        })

        await tx.auditLog.create({
          data: {
            tenantId,
            action: 'CONSENT_GRANTED',
            resourceType: 'DATASET',
            resourceId: datasetId,
            metadata: JSON.stringify({ status, version, grantedBy }),
            status: 'SUCCESS',
          },
        })
      })

      // Invalidar cache
      await this.invalidateCache(datasetId)

      return { success: true }
    } catch (error: any) {
      console.error('[ConsentManager] Error granting consent:', error)
      throw error
    }
  }
}
