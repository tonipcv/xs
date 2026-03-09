import { prisma } from '@/lib/prisma';

// Stub for backward compatibility after Sprint 1 cleanup
export class PolicyEngine {
  async evaluatePolicy(policyId: string, context: unknown) {
    console.warn('Policy evaluation stubbed');
    return { allowed: true, reason: 'stub', code: 'POLICY_ALLOWED' };
  }

  async applyRewriteRules(data: unknown, rules: unknown[]) {
    console.warn('Rewrite rules stubbed');
    return data;
  }
}

export const policyEngine = new PolicyEngine();

export async function validatePolicy(params: { 
  policyId?: string;
  datasetId?: string; 
  clientTenantId?: string;
  leaseId?: string;
  requestedHours?: number;
  action?: string;
}) {
  let policy;
  
  // If leaseId provided, fetch lease and extract policy
  if (params.leaseId) {
    const lease = await prisma.accessLease.findUnique({
      where: { leaseId: params.leaseId },
      include: { policy: true },
    });
    
    if (!lease) {
      return {
        allowed: false,
        code: 'LEASE_NOT_FOUND',
        reason: 'Lease not found',
      };
    }
    
    if (lease.status !== 'ACTIVE') {
      return {
        allowed: false,
        code: 'LEASE_INACTIVE',
        reason: `Lease is ${lease.status.toLowerCase()}`,
      };
    }
    
    if (lease.deletedAt) {
      return {
        allowed: false,
        code: 'LEASE_DELETED',
        reason: 'Lease has been deleted',
      };
    }
    
    if (lease.expiresAt && new Date() > lease.expiresAt) {
      return {
        allowed: false,
        code: 'LEASE_EXPIRED',
        reason: 'Lease has expired',
      };
    }
    
    policy = lease.policy;
    
    if (!policy) {
      return {
        allowed: false,
        code: 'POLICY_NOT_FOUND',
        reason: 'Policy not found for lease',
      };
    }
  } else if (params.policyId) {
    // If policyId provided, fetch specific policy
    policy = await prisma.accessPolicy.findUnique({
      where: { policyId: params.policyId },
    });
    
    if (!policy) {
      return {
        allowed: false,
        code: 'POLICY_NOT_FOUND',
        reason: 'Policy not found',
      };
    }
  } else if (params.datasetId && params.clientTenantId) {
    // Query for active policies by dataset and tenant
    const policies = await prisma.accessPolicy.findMany({
      where: {
        datasetId: params.datasetId,
        clientTenantId: params.clientTenantId,
        status: 'ACTIVE',
      },
    });

    if (policies.length === 0) {
      return {
        allowed: false,
        code: 'NO_POLICY',
        reason: 'No active policy found for this dataset',
      };
    }
    
    policy = policies[0];
  } else {
    return {
      allowed: false,
      code: 'INVALID_PARAMS',
      reason: 'Either policyId, leaseId, or both datasetId and clientTenantId are required',
    };
  }

  // Check if policy is expired
  if (policy.expiresAt && new Date() > policy.expiresAt) {
    return {
      allowed: false,
      code: 'POLICY_EXPIRED',
      reason: 'Policy has expired',
    };
  }

  // Check quotas
  const hoursRemaining = (policy.maxHours || 0) - (policy.hoursConsumed || 0);
  const downloadsRemaining = (policy.maxDownloads || 0) - (policy.downloadsCount || 0);

  // Check if hours quota exhausted
  if (policy.maxHours && policy.hoursConsumed && policy.hoursConsumed >= policy.maxHours) {
    return {
      allowed: false,
      code: 'QUOTA_EXCEEDED',
      reason: 'Hours quota exhausted',
    };
  }

  // Check if downloads quota exhausted
  if (policy.maxDownloads && policy.downloadsCount && policy.downloadsCount >= policy.maxDownloads) {
    return {
      allowed: false,
      code: 'QUOTA_EXCEEDED',
      reason: 'Downloads quota exhausted',
    };
  }

  // Check if requested hours exceed remaining quota
  if (params.requestedHours && params.requestedHours > hoursRemaining) {
    return {
      allowed: false,
      code: 'QUOTA_INSUFFICIENT',
      reason: `Requested hours (${params.requestedHours}) exceed remaining quota (${hoursRemaining})`,
    };
  }

  // Check action permissions
  if (params.action === 'STREAM_ACCESS' && policy.canStream === false) {
    return {
      allowed: false,
      code: 'ACTION_FORBIDDEN',
      reason: 'Streaming not allowed by policy',
    };
  }

  if (params.action === 'BATCH_DOWNLOAD' && policy.canBatchDownload === false) {
    return {
      allowed: false,
      code: 'ACTION_FORBIDDEN',
      reason: 'Batch download not allowed by policy',
    };
  }

  // All checks passed
  return {
    allowed: true,
    code: 'POLICY_ALLOWED',
    reason: 'Access granted',
    policy: {
      policyId: policy.policyId,
      hoursRemaining,
      downloadsRemaining,
    },
    usage: {
      hoursRemaining,
      downloadsRemaining,
      utilizationPercent: policy.maxHours 
        ? ((policy.hoursConsumed || 0) / policy.maxHours) * 100 
        : 0,
    },
  };
}

export async function updatePolicyConsumption(params: { policyId: string; hoursConsumed?: number; downloadsCount?: number }) {
  const data: any = {
    lastAccessAt: new Date(),
  };
  
  if (params.hoursConsumed) {
    data.hoursConsumed = { increment: params.hoursConsumed };
  }
  
  if (params.downloadsCount) {
    data.downloadsCount = { increment: params.downloadsCount };
  }
  
  return prisma.accessPolicy.update({
    where: { policyId: params.policyId },
    data,
  });
}

export async function logAccess(params: { datasetId: string; policyId: string; clientTenantId: string; action: string; filesAccessed?: number; hoursAccessed?: number; ipAddress?: string }, outcome: string, errorMessage?: string) {
  return prisma.accessLog.create({
    data: {
      datasetId: params.datasetId,
      policyId: params.policyId,
      clientTenantId: params.clientTenantId,
      action: params.action as any,
      filesAccessed: params.filesAccessed,
      hoursAccessed: params.hoursAccessed,
      ipAddress: params.ipAddress,
      outcome: outcome as any,
      errorMessage,
    },
  });
}
