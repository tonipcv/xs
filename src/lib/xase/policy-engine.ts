import { prisma } from '@/lib/prisma'

export type PolicyDecision = {
  allowed: boolean;
  reason?: string;
  code?: string;
  usage?: {
    hoursRemaining?: number | null
    downloadsRemaining?: number | null
    utilizationPercent?: number | null
  }
  policy?: {
    id?: string
    policyId: string
    status: string
    maxHours: number | null
    hoursConsumed: number
    maxDownloads: number | null
    downloadsCount: number
    expiresAt: Date | null
    pricePerHour?: number
    currency?: string
  }
};

export type PolicyValidationContext = {
  leaseId?: string
  policyId?: string
  datasetId?: string
  clientTenantId?: string
  action?: 'BATCH_DOWNLOAD' | 'STREAM_ACCESS' | 'METADATA_VIEW'
  requestedHours?: number
  requestedDownloads?: number
};

/**
 * REAL POLICY ENFORCEMENT
 * Validates lease expiration, policy limits, and permissions
 */
export async function validatePolicy(ctx: PolicyValidationContext): Promise<PolicyDecision> {
  try {
    // 1. Validate lease if provided
    if (ctx.leaseId) {
      const lease = await prisma.accessLease.findUnique({
        where: { leaseId: ctx.leaseId },
        include: {
          policy: true,
          dataset: true
        }
      })

      if (!lease) {
        return {
          allowed: false,
          reason: 'Lease not found',
          code: 'LEASE_NOT_FOUND'
        }
      }

      // Check lease expiration
      const now = new Date()
      if (lease.expiresAt < now) {
        return {
          allowed: false,
          reason: 'Lease has expired',
          code: 'LEASE_EXPIRED'
        }
      }

      // Check lease status
      if (lease.status !== 'ACTIVE') {
        return {
          allowed: false,
          reason: `Lease is ${lease.status.toLowerCase()}`,
          code: 'LEASE_INACTIVE'
        }
      }

      // Check soft delete
      if (lease.deletedAt) {
        return {
          allowed: false,
          reason: 'Lease has been deleted',
          code: 'LEASE_DELETED'
        }
      }

      // Validate policy from lease
      const policy = lease.policy
      const policyCheck = await validatePolicyLimits(policy, ctx)
      if (!policyCheck.allowed) {
        return policyCheck
      }

      return {
        allowed: true,
        policy: {
          id: policy.id,
          policyId: policy.policyId,
          status: policy.status,
          maxHours: policy.maxHours,
          hoursConsumed: policy.hoursConsumed,
          maxDownloads: policy.maxDownloads,
          downloadsCount: policy.downloadsCount,
          expiresAt: policy.expiresAt
        },
        usage: {
          hoursRemaining: policy.maxHours ? policy.maxHours - policy.hoursConsumed : null,
          downloadsRemaining: policy.maxDownloads ? policy.maxDownloads - policy.downloadsCount : null,
          utilizationPercent: policy.maxHours ? (policy.hoursConsumed / policy.maxHours) * 100 : null
        }
      }
    }

    // 2. Validate policy directly if provided
    if (ctx.policyId) {
      const policy = await prisma.accessPolicy.findUnique({
        where: { policyId: ctx.policyId }
      })

      if (!policy) {
        return {
          allowed: false,
          reason: 'Policy not found',
          code: 'POLICY_NOT_FOUND'
        }
      }

      return await validatePolicyLimits(policy, ctx)
    }

    // 3. Validate dataset access if provided
    if (ctx.datasetId && ctx.clientTenantId) {
      const policies = await prisma.accessPolicy.findMany({
        where: {
          datasetId: ctx.datasetId,
          clientTenantId: ctx.clientTenantId,
          status: 'ACTIVE'
        }
      })

      if (policies.length === 0) {
        return {
          allowed: false,
          reason: 'No active policy found for this dataset',
          code: 'NO_POLICY'
        }
      }

      // Use first active policy
      return await validatePolicyLimits(policies[0], ctx)
    }

    // No validation context provided - deny by default
    return {
      allowed: false,
      reason: 'Insufficient validation context',
      code: 'INVALID_CONTEXT'
    }
  } catch (error) {
    console.error('[PolicyEngine] Validation error:', error)
    return {
      allowed: false,
      reason: 'Policy validation failed',
      code: 'VALIDATION_ERROR'
    }
  }
}

/**
 * Validate policy limits and permissions
 */
async function validatePolicyLimits(
  policy: any,
  ctx: PolicyValidationContext
): Promise<PolicyDecision> {
  const now = new Date()

  // Check policy status
  if (policy.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: `Policy is ${policy.status.toLowerCase()}`,
      code: 'POLICY_INACTIVE'
    }
  }

  // Check policy expiration
  if (policy.expiresAt && policy.expiresAt < now) {
    return {
      allowed: false,
      reason: 'Policy has expired',
      code: 'POLICY_EXPIRED'
    }
  }

  // Check hours limit
  if (policy.maxHours !== null) {
    const hoursRemaining = policy.maxHours - policy.hoursConsumed
    if (hoursRemaining <= 0) {
      return {
        allowed: false,
        reason: 'Hours quota exhausted',
        code: 'QUOTA_EXCEEDED'
      }
    }
    if (ctx.requestedHours && ctx.requestedHours > hoursRemaining) {
      return {
        allowed: false,
        reason: `Requested hours (${ctx.requestedHours}) exceeds remaining quota (${hoursRemaining})`,
        code: 'QUOTA_INSUFFICIENT'
      }
    }
  }

  // Check downloads limit
  if (policy.maxDownloads !== null) {
    const downloadsRemaining = policy.maxDownloads - policy.downloadsCount
    if (downloadsRemaining <= 0) {
      return {
        allowed: false,
        reason: 'Downloads quota exhausted',
        code: 'QUOTA_EXCEEDED'
      }
    }
    if (ctx.requestedDownloads && ctx.requestedDownloads > downloadsRemaining) {
      return {
        allowed: false,
        reason: `Requested downloads (${ctx.requestedDownloads}) exceeds remaining quota (${downloadsRemaining})`,
        code: 'QUOTA_INSUFFICIENT'
      }
    }
  }

  // Check action permissions
  if (ctx.action === 'STREAM_ACCESS' && !policy.canStream) {
    return {
      allowed: false,
      reason: 'Streaming not allowed by policy',
      code: 'ACTION_FORBIDDEN'
    }
  }

  if (ctx.action === 'BATCH_DOWNLOAD' && !policy.canBatchDownload) {
    return {
      allowed: false,
      reason: 'Batch download not allowed by policy',
      code: 'ACTION_FORBIDDEN'
    }
  }

  return {
    allowed: true,
    policy: {
      id: policy.id,
      policyId: policy.policyId,
      status: policy.status,
      maxHours: policy.maxHours,
      hoursConsumed: policy.hoursConsumed,
      maxDownloads: policy.maxDownloads,
      downloadsCount: policy.downloadsCount,
      expiresAt: policy.expiresAt
    },
    usage: {
      hoursRemaining: policy.maxHours ? policy.maxHours - policy.hoursConsumed : null,
      downloadsRemaining: policy.maxDownloads ? policy.maxDownloads - policy.downloadsCount : null,
      utilizationPercent: policy.maxHours ? (policy.hoursConsumed / policy.maxHours) * 100 : null
    }
  }
}

/**
 * Update policy consumption after successful access
 */
export async function updatePolicyConsumption(ctx: {
  policyId: string
  hoursConsumed?: number
  downloadsCount?: number
}): Promise<void> {
  try {
    const updates: any = {
      lastAccessAt: new Date()
    }

    if (ctx.hoursConsumed) {
      updates.hoursConsumed = {
        increment: ctx.hoursConsumed
      }
    }

    if (ctx.downloadsCount) {
      updates.downloadsCount = {
        increment: ctx.downloadsCount
      }
    }

    await prisma.accessPolicy.update({
      where: { policyId: ctx.policyId },
      data: updates
    })
  } catch (error) {
    console.error('[PolicyEngine] Failed to update consumption:', error)
    throw error
  }
}

/**
 * Log access attempt to audit log
 */
export async function logAccess(
  ctx: {
    datasetId: string
    policyId: string
    clientTenantId: string
    userId?: string
    apiKeyId?: string
    action: 'BATCH_DOWNLOAD' | 'STREAM_ACCESS' | 'METADATA_VIEW'
    filesAccessed?: number
    hoursAccessed?: number
    bytesTransferred?: bigint
    ipAddress?: string
    userAgent?: string
    requestId?: string
  },
  result: 'GRANTED' | 'DENIED',
  deniedReason?: string
): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        datasetId: ctx.datasetId,
        policyId: ctx.policyId,
        clientTenantId: ctx.clientTenantId,
        userId: ctx.userId,
        apiKeyId: ctx.apiKeyId,
        action: ctx.action,
        filesAccessed: ctx.filesAccessed || 0,
        hoursAccessed: ctx.hoursAccessed || 0,
        bytesTransferred: ctx.bytesTransferred,
        outcome: result,
        errorMessage: deniedReason,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId
      }
    })
  } catch (error) {
    console.error('[PolicyEngine] Failed to log access:', error)
    // Don't throw - logging failure shouldn't block access
  }
}
