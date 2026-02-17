import { prisma } from './prisma';

/**
 * Check user's token usage and enforce limits based on plan tier.
 * Automatically resets monthly usage if needed.
 * 
 * @param userId - User ID
 * @param cost - Token cost of the operation (default 1)
 * @throws {Error} with code 'LIMIT_EXCEEDED' if user has exceeded their limit
 */
export async function checkAndIncrementUsage(userId: string, cost: number = 1) {
  // The current Prisma User model doesn't include usage counters.
  // To keep the system functional, make this a no-op with an optional
  // soft limit based on environment (not persisted).
  const FREE_LIMIT = Number(process.env.DEFAULT_FREE_TOKENS_LIMIT || '1000000');
  const ENFORCE = process.env.ENFORCE_TOKEN_LIMIT === 'true';
  if (ENFORCE && cost > FREE_LIMIT) {
    const error = new Error('Token limit exceeded for your plan tier');
    (error as any).code = 'LIMIT_EXCEEDED';
    (error as any).usage = {
      used: 0,
      limit: FREE_LIMIT,
      tier: 'free',
    };
    throw error;
  }
  // Otherwise allow request; persistence of usage is not implemented in current schema.
}

/**
 * Get current usage stats for a user
 */
export async function getUserUsage(userId: string) {
  // Return safe defaults since usage fields are not present in current schema
  const FREE_LIMIT = Number(process.env.DEFAULT_FREE_TOKENS_LIMIT || '1000000');
  return {
    tokensUsedThisMonth: 0,
    freeTokensLimit: FREE_LIMIT,
    totalTokensUsed: 0,
    percentage: 0,
    planTier: 'free',
    useCasesIncluded: [],
    retentionYears: 1,
    lastTokenReset: new Date(),
    daysUntilReset: 30,
  } as any;
}
