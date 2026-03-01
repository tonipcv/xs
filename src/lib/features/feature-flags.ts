/**
 * Feature Flags System
 * Dynamic feature toggling for gradual rollouts and A/B testing
 */

import { PrismaClient } from '@prisma/client';
import { cacheGet, cacheSet, CacheTTL } from '@/lib/cache/redis-cache';

const prisma = new PrismaClient();

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  rolloutPercentage?: number;
  enabledFor?: {
    tenants?: string[];
    users?: string[];
    roles?: string[];
  };
  metadata?: Record<string, any>;
}

/**
 * Check if a feature is enabled for a specific context
 */
export async function isFeatureEnabled(
  featureName: string,
  context: {
    tenantId?: string;
    userId?: string;
    userRole?: string;
  }
): Promise<boolean> {
  try {
    // Check cache first
    const cacheKey = `feature:${featureName}`;
    const cached = await cacheGet<FeatureFlag>(cacheKey);
    
    let flag: FeatureFlag | null = cached;

    if (!flag) {
      // Load from database (stored in audit log for now)
      const flagData = await prisma.auditLog.findFirst({
        where: {
          action: 'FEATURE_FLAG_CREATED',
          resourceId: featureName,
        },
        select: {
          metadata: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      if (flagData?.metadata) {
        flag = JSON.parse(flagData.metadata);
        await cacheSet(cacheKey, flag, { ttl: CacheTTL.MEDIUM });
      }
    }

    if (!flag) {
      // Feature not found, default to disabled
      return false;
    }

    // Check if globally disabled
    if (!flag.enabled) {
      return false;
    }

    // Check tenant-specific enablement
    if (flag.enabledFor?.tenants && context.tenantId) {
      if (flag.enabledFor.tenants.includes(context.tenantId)) {
        return true;
      }
    }

    // Check user-specific enablement
    if (flag.enabledFor?.users && context.userId) {
      if (flag.enabledFor.users.includes(context.userId)) {
        return true;
      }
    }

    // Check role-specific enablement
    if (flag.enabledFor?.roles && context.userRole) {
      if (flag.enabledFor.roles.includes(context.userRole)) {
        return true;
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined) {
      const hash = hashString(context.tenantId || context.userId || '');
      const percentage = (hash % 100) + 1;
      return percentage <= flag.rolloutPercentage;
    }

    // If no specific rules, use global enabled flag
    return flag.enabled;
  } catch (error) {
    console.error('Error checking feature flag:', error);
    // Fail open - return false if error
    return false;
  }
}

/**
 * Create or update a feature flag
 */
export async function setFeatureFlag(flag: FeatureFlag): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: 'FEATURE_FLAG_CREATED',
        resourceType: 'feature_flag',
        resourceId: flag.name,
        metadata: JSON.stringify(flag),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    // Invalidate cache
    const cacheKey = `feature:${flag.name}`;
    await cacheSet(cacheKey, flag, { ttl: CacheTTL.MEDIUM });

    console.log(`Feature flag set: ${flag.name} = ${flag.enabled}`);
  } catch (error) {
    console.error('Error setting feature flag:', error);
    throw error;
  }
}

/**
 * Get all feature flags
 */
export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
  try {
    const flags = await prisma.auditLog.findMany({
      where: {
        action: 'FEATURE_FLAG_CREATED',
      },
      select: {
        resourceId: true,
        metadata: true,
        timestamp: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Group by resourceId and take latest
    const latestFlags = new Map<string, FeatureFlag>();
    
    for (const flag of flags) {
      if (!latestFlags.has(flag.resourceId) && flag.metadata) {
        try {
          latestFlags.set(flag.resourceId, JSON.parse(flag.metadata));
        } catch {
          // Skip invalid JSON
        }
      }
    }

    return Array.from(latestFlags.values());
  } catch (error) {
    console.error('Error getting feature flags:', error);
    return [];
  }
}

/**
 * Delete a feature flag
 */
export async function deleteFeatureFlag(featureName: string): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: 'FEATURE_FLAG_DELETED',
        resourceType: 'feature_flag',
        resourceId: featureName,
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    // Invalidate cache
    const cacheKey = `feature:${featureName}`;
    await cacheSet(cacheKey, null, { ttl: 1 });

    console.log(`Feature flag deleted: ${featureName}`);
  } catch (error) {
    console.error('Error deleting feature flag:', error);
    throw error;
  }
}

/**
 * Predefined feature flags
 */
export const Features = {
  // New features
  ADVANCED_ANALYTICS: 'advanced_analytics',
  REAL_TIME_NOTIFICATIONS: 'real_time_notifications',
  AI_RECOMMENDATIONS: 'ai_recommendations',
  MULTI_REGION_SUPPORT: 'multi_region_support',
  
  // Experimental features
  BETA_DASHBOARD: 'beta_dashboard',
  NEW_SEARCH_ENGINE: 'new_search_engine',
  ENHANCED_CACHING: 'enhanced_caching',
  
  // Rollout features
  WEBHOOK_V2: 'webhook_v2',
  COMPLIANCE_AUTOMATION: 'compliance_automation',
  
  // A/B testing
  NEW_PRICING_PAGE: 'new_pricing_page',
  IMPROVED_ONBOARDING: 'improved_onboarding',
};

/**
 * Initialize default feature flags
 */
export async function initializeDefaultFlags(): Promise<void> {
  const defaultFlags: FeatureFlag[] = [
    {
      name: Features.ADVANCED_ANALYTICS,
      enabled: true,
      description: 'Advanced analytics and reporting',
      rolloutPercentage: 100,
    },
    {
      name: Features.REAL_TIME_NOTIFICATIONS,
      enabled: true,
      description: 'Real-time notification system',
      rolloutPercentage: 100,
    },
    {
      name: Features.AI_RECOMMENDATIONS,
      enabled: false,
      description: 'AI-powered recommendations',
      rolloutPercentage: 0,
    },
    {
      name: Features.BETA_DASHBOARD,
      enabled: true,
      description: 'New beta dashboard UI',
      rolloutPercentage: 25,
    },
    {
      name: Features.NEW_SEARCH_ENGINE,
      enabled: true,
      description: 'Enhanced search with filters',
      rolloutPercentage: 50,
    },
  ];

  for (const flag of defaultFlags) {
    await setFeatureFlag(flag);
  }

  console.log('Default feature flags initialized');
}

/**
 * Simple hash function for consistent rollout
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Feature flag middleware helper
 */
export async function requireFeature(
  featureName: string,
  context: {
    tenantId?: string;
    userId?: string;
    userRole?: string;
  }
): Promise<boolean> {
  const enabled = await isFeatureEnabled(featureName, context);
  
  if (!enabled) {
    console.log(`Feature ${featureName} is not enabled for context:`, context);
  }
  
  return enabled;
}

/**
 * Get feature flag status for user
 */
export async function getUserFeatureFlags(
  tenantId: string,
  userId: string,
  userRole: string
): Promise<Record<string, boolean>> {
  const flags = await getAllFeatureFlags();
  const context = { tenantId, userId, userRole };
  
  const result: Record<string, boolean> = {};
  
  for (const flag of flags) {
    result[flag.name] = await isFeatureEnabled(flag.name, context);
  }
  
  return result;
}
