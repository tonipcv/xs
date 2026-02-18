/**
 * ACCESS ENFORCEMENT MIDDLEWARE
 * Middleware obrigatório que intercepta TODAS as rotas de acesso a dados
 * NENHUM download/stream pode bypassar este enforcement
 */

import { NextRequest } from 'next/server'
import { validatePolicy, logAccess, updatePolicyConsumption, PolicyValidationContext } from './policy-engine'
import { prisma } from '@/lib/prisma'
import { logAudit } from './audit'

export interface AccessRequest {
  datasetId: string
  policyId: string
  requestedHours: number
  clientTenantId: string
  apiKeyId?: string
  userId?: string
  ipAddress?: string
  userAgent?: string
  action: 'BATCH_DOWNLOAD' | 'STREAM_ACCESS' | 'POLICY_CHECK'
}

export interface AccessResult {
  granted: boolean
  reason: string
  code: string
  hoursConsumed?: number
  cost?: number
  currency?: string
  usage?: {
    hoursRemaining: number
    downloadsRemaining: number
    utilizationPercent: number
  }
}

/**
 * ENFORCEMENT OBRIGATÓRIO
 * Esta função DEVE ser chamada antes de qualquer acesso a dados
 * Retorna decisão + executa efeitos colaterais (log, billing, consumo)
 */
export async function enforceAccess(request: AccessRequest): Promise<AccessResult> {
  const context: PolicyValidationContext = {
    policyId: request.policyId,
    requestedHours: request.requestedHours,
    clientTenantId: request.clientTenantId,
    userId: request.userId,
    apiKeyId: request.apiKeyId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    environment: process.env.NODE_ENV as any || 'development',
    action: request.action,
  }

  // 1. VALIDAR DATASET EXISTE E ESTÁ ATIVO
  const dataset = await prisma.dataset.findFirst({
    where: { 
      datasetId: request.datasetId,
      status: 'ACTIVE' // OBRIGATÓRIO: apenas datasets ativos
    },
    select: { 
      id: true, 
      datasetId: true,
      totalDurationHours: true,
      status: true,
      processingStatus: true,
    },
  })

  if (!dataset) {
    // Cannot log to voiceAccessLog without valid dataset FK
    // Log to audit log instead
    await logAudit({
      tenantId: context.clientTenantId,
      action: 'ACCESS_DENIED',
      resourceType: 'DATASET',
      resourceId: request.datasetId,
      metadata: JSON.stringify({ reason: 'Dataset not found or not active', policyId: context.policyId }),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      status: 'DENIED',
      errorMessage: 'Dataset not found or not active'
    })
    return {
      granted: false,
      reason: 'Dataset not found or not active',
      code: 'DATASET_NOT_FOUND'
    }
  }

  // 2. DATASET DEVE ESTAR PROCESSADO
  if (dataset.processingStatus !== 'COMPLETED') {
    await logAccess(context, 'DENIED', dataset.id, 0, 0, 'Dataset processing not completed')
    return {
      granted: false,
      reason: 'Dataset processing not completed',
      code: 'DATASET_NOT_READY'
    }
  }

  // 3. EXECUTAR POLICY ENGINE (FUNÇÃO PURA)
  const decision = await validatePolicy(context)

  // 4. SE NEGADO: LOG E RETORNO
  if (!decision.allowed) {
    await logAccess(context, 'DENIED', dataset.id, 0, 0, decision.reason)
    const usageSafe = decision.usage
      ? {
          hoursRemaining: Number(decision.usage.hoursRemaining ?? 0),
          downloadsRemaining: Number(decision.usage.downloadsRemaining ?? 0),
          utilizationPercent: Number(decision.usage.utilizationPercent ?? 0),
        }
      : undefined
    return {
      granted: false,
      reason: decision.reason || 'Access denied',
      code: decision.code || 'DENIED',
      usage: usageSafe,
    }
  }

  // 5. SE PERMITIDO: EXECUTAR EFEITOS COLATERAIS ATOMICAMENTE
  const policy = decision.policy
  const hoursToConsume = request.requestedHours

  // Se não houver snapshot de policy no decision, registrar acesso e retornar sucesso básico
  if (!policy) {
    await logAccess(context, 'GRANTED', dataset.id, 0, hoursToConsume)
    return {
      granted: true,
      reason: 'Access granted',
      code: 'ALLOWED',
      hoursConsumed: hoursToConsume,
    }
  }

  const pricePerHour = typeof policy.pricePerHour === 'number' ? policy.pricePerHour : 0
  const currency = policy.currency || 'USD'
  const cost = pricePerHour > 0 ? hoursToConsume * pricePerHour : 0

  try {
    // Se não possuir ID interno da policy, não é possível criar logs vinculados; retornar sucesso básico
    if (!policy.id) {
      await logAccess(context, 'GRANTED', dataset.id, 0, hoursToConsume)
      return {
        granted: true,
        reason: 'Access granted',
        code: 'ALLOWED',
        hoursConsumed: hoursToConsume,
        cost,
        currency,
      }
    }
    const policyIdInternal: string = policy.id as string

    await prisma.$transaction(async (tx) => {
      // A. Atualizar consumo da policy
      await tx.accessPolicy.update({
        where: { id: policy.id },
        data: {
          hoursConsumed: policy.hoursConsumed + hoursToConsume,
          downloadsCount: request.action === 'BATCH_DOWNLOAD' 
            ? policy.downloadsCount + 1 
            : policy.downloadsCount,
          lastAccessAt: new Date(),
        },
      })

      // B. Registrar no ledger (se há custo)
      if (cost > 0) {
        const currentBalanceAgg = await tx.creditLedger.aggregate({
          _sum: { amount: true },
          where: { tenantId: request.clientTenantId },
        })
        const currentBalance = Number(currentBalanceAgg._sum?.amount || 0)
        const newBalance = currentBalance - cost

        await tx.creditLedger.create({
          data: {
            tenantId: request.clientTenantId,
            amount: -cost,
            balanceAfter: newBalance,
            eventType: 'USAGE_DEBIT',
            description: `Dataset ${request.datasetId} access: ${hoursToConsume}h @ ${pricePerHour}/${currency}`,
            metadata: {
              datasetId: request.datasetId,
              policyId: request.policyId,
              hoursAccessed: hoursToConsume,
              action: request.action,
            } as any,
          },
        })
      }

      // C. Log de acesso (imutável)
      await tx.accessLog.create({
        data: {
          datasetId: dataset.id,
          policyId: policyIdInternal,
          clientTenantId: request.clientTenantId,
          userId: request.userId || null,
          apiKeyId: request.apiKeyId || null,
          action: request.action,
          filesAccessed: request.action === 'BATCH_DOWNLOAD' ? 1 : 0,
          hoursAccessed: hoursToConsume,
          outcome: 'GRANTED',
          ipAddress: request.ipAddress || null,
          userAgent: request.userAgent || null,
        },
      })
    })

    // 6. RETORNO DE SUCESSO
    const usageSafe = decision.usage
      ? {
          hoursRemaining: Number(decision.usage.hoursRemaining ?? 0),
          downloadsRemaining: Number(decision.usage.downloadsRemaining ?? 0),
          utilizationPercent: Number(decision.usage.utilizationPercent ?? 0),
        }
      : undefined
    return {
      granted: true,
      reason: 'Access granted',
      code: 'ALLOWED',
      hoursConsumed: hoursToConsume,
      cost,
      currency,
      usage: usageSafe,
    }
  } catch (error: any) {
    console.error('[AccessEnforcement] Transaction failed:', error)
    
    // Log de erro
    await logAccess(context, 'DENIED', dataset.id, 0, 0, 'Transaction failed')
    
    return {
      granted: false,
      reason: 'Internal error during access enforcement',
      code: 'ENFORCEMENT_ERROR'
    }
  }
}

/**
 * Helper para extrair contexto de uma NextRequest
 */
export function extractRequestContext(req: NextRequest, additionalData: {
  clientTenantId: string
  apiKeyId?: string
  userId?: string
}): Pick<AccessRequest, 'ipAddress' | 'userAgent' | 'clientTenantId' | 'apiKeyId' | 'userId'> {
  return {
    ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
    clientTenantId: additionalData.clientTenantId,
    apiKeyId: additionalData.apiKeyId,
    userId: additionalData.userId,
  }
}
