/**
 * Policy Engine - EXECUTÁVEL E DETERMINÍSTICO
 * Enforcement real de políticas de acesso a datasets
 * 
 * FUNÇÃO PURA: dado um contexto e policy, decide ALLOW/DENY
 * SEM EFEITOS COLATERAIS: não modifica estado, apenas decide
 */

import { prisma } from '@/lib/prisma'

export interface PolicyValidationContext {
  policyId: string
  requestedHours: number
  clientTenantId: string
  userId?: string
  apiKeyId?: string
  ipAddress?: string
  userAgent?: string
  environment?: 'production' | 'staging' | 'development'
  action: 'BATCH_DOWNLOAD' | 'STREAM_ACCESS' | 'POLICY_CHECK'
}

export interface PolicyData {
  id: string
  policyId: string
  status: 'ACTIVE' | 'INACTIVE' | 'REVOKED' | 'EXPIRED'
  maxHours: number | null
  hoursConsumed: number
  maxDownloads: number | null
  downloadsCount: number
  expiresAt: Date | null
  canBatchDownload: boolean
  canStream: boolean
  allowedEnvironments: string[]
  pricePerHour: number | null
  currency: string
  clientTenantId: string
}

export interface PolicyDecision {
  allowed: boolean
  reason: string
  code: 'POLICY_NOT_FOUND' | 'POLICY_INACTIVE' | 'POLICY_EXPIRED' | 'HOURS_EXCEEDED' | 'DOWNLOADS_EXCEEDED' | 'ACTION_NOT_ALLOWED' | 'ENVIRONMENT_NOT_ALLOWED' | 'TENANT_MISMATCH' | 'EXECUTION_REQUIRED' | 'ALLOWED'
  policy?: PolicyData
  usage?: {
    hoursRemaining: number
    downloadsRemaining: number
    utilizationPercent: number
  }
}

/**
 * FUNÇÃO PURA: Decide se acesso é permitido
 * NÃO acessa banco, NÃO modifica estado
 * Entrada: contexto + policy data
 * Saída: decisão determinística
 */
export function evaluatePolicy(
  context: PolicyValidationContext,
  policy: PolicyData | null
): PolicyDecision {
  // 1. Policy existe?
  if (!policy) {
    return {
      allowed: false,
      reason: 'Policy not found',
      code: 'POLICY_NOT_FOUND'
    }
  }

  // 2. Policy ativa?
  if (policy.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: `Policy status is ${policy.status}`,
      code: 'POLICY_INACTIVE',
      policy
    }
  }

  // 3. Tenant correto?
  if (policy.clientTenantId !== context.clientTenantId) {
    return {
      allowed: false,
      reason: 'Policy does not belong to this tenant',
      code: 'TENANT_MISMATCH',
      policy
    }
  }

  // 4. Não expirada?
  const now = new Date()
  if (policy.expiresAt && policy.expiresAt < now) {
    return {
      allowed: false,
      reason: `Policy expired at ${policy.expiresAt.toISOString()}`,
      code: 'POLICY_EXPIRED',
      policy
    }
  }

  // 5. Ação permitida?
  if (context.action === 'BATCH_DOWNLOAD' && !policy.canBatchDownload) {
    return {
      allowed: false,
      reason: 'Batch download not allowed by policy',
      code: 'ACTION_NOT_ALLOWED',
      policy
    }
  }

  if (context.action === 'STREAM_ACCESS' && !policy.canStream) {
    return {
      allowed: false,
      reason: 'Stream access not allowed by policy',
      code: 'ACTION_NOT_ALLOWED',
      policy
    }
  }

  // 6. Ambiente permitido?
  if (context.environment && policy.allowedEnvironments.length > 0) {
    if (!policy.allowedEnvironments.includes(context.environment)) {
      return {
        allowed: false,
        reason: `Environment ${context.environment} not allowed`,
        code: 'ENVIRONMENT_NOT_ALLOWED',
        policy
      }
    }
  }

  // 7. Limite de horas não excedido?
  if (policy.maxHours !== null) {
    const projectedHours = policy.hoursConsumed + context.requestedHours
    if (projectedHours > policy.maxHours) {
      return {
        allowed: false,
        reason: `Hours limit exceeded: ${policy.hoursConsumed}/${policy.maxHours} used, requesting ${context.requestedHours} more`,
        code: 'HOURS_EXCEEDED',
        policy,
        usage: {
          hoursRemaining: Math.max(0, policy.maxHours - policy.hoursConsumed),
          downloadsRemaining: policy.maxDownloads ? Math.max(0, policy.maxDownloads - policy.downloadsCount) : Infinity,
          utilizationPercent: (policy.hoursConsumed / policy.maxHours) * 100
        }
      }
    }
  }

  // 8. Limite de downloads não excedido?
  if (policy.maxDownloads !== null && context.action === 'BATCH_DOWNLOAD') {
    const projectedDownloads = policy.downloadsCount + 1
    if (projectedDownloads > policy.maxDownloads) {
      return {
        allowed: false,
        reason: `Downloads limit exceeded: ${policy.downloadsCount}/${policy.maxDownloads} used`,
        code: 'DOWNLOADS_EXCEEDED',
        policy,
        usage: {
          hoursRemaining: policy.maxHours ? Math.max(0, policy.maxHours - policy.hoursConsumed) : Infinity,
          downloadsRemaining: Math.max(0, policy.maxDownloads - policy.downloadsCount),
          utilizationPercent: (policy.downloadsCount / policy.maxDownloads) * 100
        }
      }
    }
  }

  // ✅ TODAS AS VALIDAÇÕES PASSARAM
  return {
    allowed: true,
    reason: 'Access granted',
    code: 'ALLOWED',
    policy,
    usage: {
      hoursRemaining: policy.maxHours ? Math.max(0, policy.maxHours - policy.hoursConsumed) : Infinity,
      downloadsRemaining: policy.maxDownloads ? Math.max(0, policy.maxDownloads - policy.downloadsCount) : Infinity,
      utilizationPercent: policy.maxHours ? (policy.hoursConsumed / policy.maxHours) * 100 : 0
    }
  }
}

/**
 * ORQUESTRAÇÃO: Busca policy + executa função pura
 * Esta é a função que as APIs devem chamar
 */
export async function validatePolicy(
  ctx: PolicyValidationContext
): Promise<PolicyDecision> {
  try {
    // 0. Billing/offer gate: require an ACTIVE PolicyExecution linking this policy to an approved offer
    const activeExecution = await prisma.policyExecution.findFirst({
      where: {
        policyId: ctx.policyId,
        buyerTenantId: ctx.clientTenantId,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: { id: true, executionId: true },
    })

    if (!activeExecution) {
      return {
        allowed: false,
        reason: 'Active execution required: request access to the offer and obtain approval before using this policy',
        code: 'EXECUTION_REQUIRED',
      }
    }

    // Buscar policy do banco
    const policyRecord = await prisma.voiceAccessPolicy.findFirst({
      where: { policyId: ctx.policyId },
      select: {
        id: true,
        policyId: true,
        status: true,
        maxHours: true,
        hoursConsumed: true,
        maxDownloads: true,
        downloadsCount: true,
        expiresAt: true,
        canBatchDownload: true,
        canStream: true,
        clientTenantId: true,
      },
    })

    // Converter para PolicyData
    const policy: PolicyData | null = policyRecord ? {
      id: policyRecord.id,
      policyId: policyRecord.policyId,
      status: policyRecord.status as any,
      maxHours: policyRecord.maxHours,
      hoursConsumed: policyRecord.hoursConsumed,
      maxDownloads: policyRecord.maxDownloads,
      downloadsCount: policyRecord.downloadsCount,
      expiresAt: policyRecord.expiresAt,
      canBatchDownload: policyRecord.canBatchDownload,
      canStream: policyRecord.canStream,
      allowedEnvironments: [], // TODO: adicionar ao schema se necessário
      clientTenantId: policyRecord.clientTenantId,
    } : null

    // EXECUTAR FUNÇÃO PURA
    return evaluatePolicy(ctx, policy)
  } catch (error: any) {
    console.error('[PolicyEngine] Validation error:', error)
    return {
      allowed: false,
      reason: 'Internal validation error',
      code: 'POLICY_NOT_FOUND'
    }
  }
}

/**
 * Registra um acesso (permitido ou negado) no AccessLog
 */
export async function logAccess(
  ctx: PolicyValidationContext,
  outcome: 'GRANTED' | 'DENIED',
  datasetId: string,
  filesAccessed: number = 0,
  hoursAccessed: number = 0,
  errorMessage?: string,
  action: 'BATCH_DOWNLOAD' | 'POLICY_CHECK' | 'STREAM_ACCESS' = 'BATCH_DOWNLOAD'
): Promise<void> {
  try {
    await prisma.voiceAccessLog.create({
      data: {
        datasetId,
        policyId: ctx.policyId,
        clientTenantId: ctx.clientTenantId,
        userId: ctx.userId || null,
        apiKeyId: ctx.apiKeyId || null,
        action,
        filesAccessed,
        hoursAccessed,
        outcome,
        errorMessage: errorMessage || null,
        ipAddress: ctx.ipAddress || null,
        userAgent: ctx.userAgent || null,
      },
    })
  } catch (error: any) {
    console.error('[PolicyEngine] Failed to log access:', error)
    // Não falhar a request se log falhar
  }
}

/**
 * Atualiza consumo da policy após acesso bem-sucedido
 */
export async function updatePolicyConsumption(
  policyId: string,
  hoursConsumed: number,
  downloadsCount: number = 1
): Promise<void> {
  try {
    const policy = await prisma.voiceAccessPolicy.findFirst({
      where: { policyId },
      select: { id: true, hoursConsumed: true, downloadsCount: true },
    })

    if (!policy) return

    await prisma.voiceAccessPolicy.update({
      where: { id: policy.id },
      data: {
        hoursConsumed: policy.hoursConsumed + hoursConsumed,
        downloadsCount: policy.downloadsCount + downloadsCount,
        lastAccessAt: new Date(),
      },
    })
  } catch (error: any) {
    console.error('[PolicyEngine] Failed to update consumption:', error)
    // Não falhar a request se update falhar
  }
}
