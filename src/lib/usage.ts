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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tokensUsedThisMonth: true,
      freeTokensLimit: true,
      lastTokenReset: true,
      totalTokensUsed: true,
      planTier: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if monthly reset is needed (30 days)
  const now = new Date();
  const daysSinceReset = (now.getTime() - user.lastTokenReset.getTime()) / (1000 * 60 * 60 * 24);
  
  let tokensUsedThisMonth = user.tokensUsedThisMonth;
  
  if (daysSinceReset >= 30) {
    // Reset monthly usage
    tokensUsedThisMonth = 0;
    await prisma.user.update({
      where: { id: userId },
      data: {
        tokensUsedThisMonth: 0,
        lastTokenReset: now,
      },
    });
  }

  // Check if adding this cost would exceed limit
  if (tokensUsedThisMonth + cost > user.freeTokensLimit) {
    const error = new Error('Token limit exceeded for your plan tier');
    (error as any).code = 'LIMIT_EXCEEDED';
    (error as any).usage = {
      used: tokensUsedThisMonth,
      limit: user.freeTokensLimit,
      tier: user.planTier,
    };
    throw error;
  }

  // Increment usage
  await prisma.user.update({
    where: { id: userId },
    data: {
      tokensUsedThisMonth: { increment: cost },
      totalTokensUsed: { increment: cost },
    },
  });
}

/**
 * Get current usage stats for a user
 */
export async function getUserUsage(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tokensUsedThisMonth: true,
      freeTokensLimit: true,
      totalTokensUsed: true,
      lastTokenReset: true,
      planTier: true,
      useCasesIncluded: true,
      retentionYears: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if reset is needed
  const now = new Date();
  const daysSinceReset = (now.getTime() - user.lastTokenReset.getTime()) / (1000 * 60 * 60 * 24);
  
  const tokensUsed = daysSinceReset >= 30 ? 0 : user.tokensUsedThisMonth;
  const percentage = user.freeTokensLimit > 0 
    ? Math.round((tokensUsed / user.freeTokensLimit) * 100) 
    : 0;

  return {
    tokensUsedThisMonth: tokensUsed,
    freeTokensLimit: user.freeTokensLimit,
    totalTokensUsed: user.totalTokensUsed,
    percentage,
    planTier: user.planTier,
    useCasesIncluded: user.useCasesIncluded,
    retentionYears: user.retentionYears,
    lastTokenReset: user.lastTokenReset,
    daysUntilReset: Math.max(0, 30 - Math.floor(daysSinceReset)),
  };
}
