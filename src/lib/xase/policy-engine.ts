// Minimal stub to satisfy imports while core policy engine is not part of current schema
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

export type PolicyValidationContext = any;

export async function validatePolicy(_ctx: PolicyValidationContext): Promise<PolicyDecision> {
  // Allow by default in the current MVP until policy engine is restored
  return { allowed: true };
}

export async function updatePolicyConsumption(_ctx: any): Promise<void> {
  // No-op in current MVP
  return;
}

export async function logAccess(
  _ctx: any,
  _result?: 'GRANTED' | 'DENIED',
  _datasetInternalId?: string,
  _bytes?: number,
  _hours?: number,
  _deniedReason?: string,
  _action?: string
): Promise<void> {
  // No-op log; integrate with AuditLog when ready
  return;
}
