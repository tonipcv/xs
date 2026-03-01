/**
 * Feature Flags System
 * Dynamic feature toggling for gradual rollouts
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetUsers?: string[];
  targetTenants?: string[];
  conditions?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type FeatureFlagName =
  | 'auto_renew_leases'
  | 'real_time_notifications'
  | 'anomaly_detection'
  | 'evidence_bundles'
  | 'compliance_reports'
  | 'billing_reports'
  | 'member_invitations'
  | 'multi_region'
  | 'advanced_analytics'
  | 'ai_recommendations'
  | 'custom_roles'
  | 'api_v2'
  | 'mobile_app'
  | 'edge_caching';

/**
 * Check if feature is enabled for user/tenant
 */
export async function isFeatureEnabled(
  featureName: FeatureFlagName,
  userId?: string,
  tenantId?: string
): Promise<boolean> {
  // Check cache first
  const cacheKey = `feature:${featureName}:${userId || 'global'}:${tenantId || 'global'}`;
  const cached = await redis.get(cacheKey);
  
  if (cached !== null) {
    return cached === 'true';
  }

  // Get feature flag
  const flag = await getFeatureFlag(featureName);
  
  if (!flag) {
    return false; // Feature doesn't exist
  }

  if (!flag.enabled) {
    await redis.setex(cacheKey, 300, 'false'); // Cache for 5 minutes
    return false;
  }

  // Check target users
  if (userId && flag.targetUsers && flag.targetUsers.length > 0) {
    const isTargeted = flag.targetUsers.includes(userId);
    await redis.setex(cacheKey, 300, isTargeted ? 'true' : 'false');
    return isTargeted;
  }

  // Check target tenants
  if (tenantId && flag.targetTenants && flag.targetTenants.length > 0) {
    const isTargeted = flag.targetTenants.includes(tenantId);
    await redis.setex(cacheKey, 300, isTargeted ? 'true' : 'false');
    return isTargeted;
  }

  // Check rollout percentage
  if (flag.rolloutPercentage < 100) {
    const hash = hashString(userId || tenantId || 'global');
    const bucket = hash % 100;
    const enabled = bucket < flag.rolloutPercentage;
    await redis.setex(cacheKey, 300, enabled ? 'true' : 'false');
    return enabled;
  }

  // Feature is fully enabled
  await redis.setex(cacheKey, 300, 'true');
  return true;
}

/**
 * Get feature flag
 */
async function getFeatureFlag(name: FeatureFlagName): Promise<FeatureFlag | null> {
  const cacheKey = `feature:config:${name}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch from database
  const flag = await prisma.auditLog.findFirst({
    where: {
      resourceType: 'feature_flag',
      resourceId: name,
      action: 'FEATURE_FLAG_UPDATED',
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  if (!flag) {
    return null;
  }

  const featureFlag = JSON.parse(flag.metadata as string) as FeatureFlag;
  await redis.setex(cacheKey, 600, JSON.stringify(featureFlag)); // Cache for 10 minutes
  
  return featureFlag;
}

/**
 * Create or update feature flag
 */
export async function setFeatureFlag(flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): Promise<FeatureFlag> {
  const now = new Date();
  
  const fullFlag: FeatureFlag = {
    ...flag,
    createdAt: now,
    updatedAt: now,
  };

  // Store in database
  await prisma.auditLog.create({
    data: {
      action: 'FEATURE_FLAG_UPDATED',
      resourceType: 'feature_flag',
      resourceId: flag.name,
      metadata: JSON.stringify(fullFlag),
      status: 'SUCCESS',
      timestamp: now,
    },
  });

  // Invalidate cache
  await redis.del(`feature:config:${flag.name}`);
  
  // Clear all user/tenant caches for this feature
  const pattern = `feature:${flag.name}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  return fullFlag;
}

/**
 * List all feature flags
 */
export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  const flags = await prisma.auditLog.findMany({
    where: {
      resourceType: 'feature_flag',
      action: 'FEATURE_FLAG_UPDATED',
    },
    orderBy: {
      timestamp: 'desc',
    },
    distinct: ['resourceId'],
  });

  return flags.map(f => JSON.parse(f.metadata as string) as FeatureFlag);
}

/**
 * Delete feature flag
 */
export async function deleteFeatureFlag(name: FeatureFlagName): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: 'FEATURE_FLAG_DELETED',
      resourceType: 'feature_flag',
      resourceId: name,
      metadata: JSON.stringify({ name }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Invalidate cache
  await redis.del(`feature:config:${name}`);
  
  const pattern = `feature:${name}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Hash string to number (for consistent bucketing)
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Initialize default feature flags
 */
export async function initializeDefaultFlags(): Promise<void> {
  const defaultFlags: Array<Omit<FeatureFlag, 'createdAt' | 'updatedAt'>> = [
    {
      id: 'auto_renew_leases',
      name: 'auto_renew_leases',
      description: 'Enable automatic lease renewal',
      enabled: true,
      rolloutPercentage: 100,
    },
    {
      id: 'real_time_notifications',
      name: 'real_time_notifications',
      description: 'Enable real-time WebSocket notifications',
      enabled: true,
      rolloutPercentage: 100,
    },
    {
      id: 'anomaly_detection',
      name: 'anomaly_detection',
      description: 'Enable security anomaly detection',
      enabled: true,
      rolloutPercentage: 100,
    },
    {
      id: 'evidence_bundles',
      name: 'evidence_bundles',
      description: 'Enable evidence bundle generation with S3/KMS',
      enabled: true,
      rolloutPercentage: 50, // Gradual rollout
    },
    {
      id: 'compliance_reports',
      name: 'compliance_reports',
      description: 'Enable compliance report generation',
      enabled: true,
      rolloutPercentage: 100,
    },
    {
      id: 'billing_reports',
      name: 'billing_reports',
      description: 'Enable billing report generation',
      enabled: true,
      rolloutPercentage: 100,
    },
    {
      id: 'member_invitations',
      name: 'member_invitations',
      description: 'Enable team member invitations',
      enabled: true,
      rolloutPercentage: 100,
    },
    {
      id: 'multi_region',
      name: 'multi_region',
      description: 'Enable multi-region deployment',
      enabled: false,
      rolloutPercentage: 0, // Not ready yet
    },
    {
      id: 'advanced_analytics',
      name: 'advanced_analytics',
      description: 'Enable advanced analytics features',
      enabled: true,
      rolloutPercentage: 25, // Limited rollout
    },
    {
      id: 'ai_recommendations',
      name: 'ai_recommendations',
      description: 'Enable AI-powered recommendations',
      enabled: false,
      rolloutPercentage: 0, // Beta feature
    },
    {
      id: 'custom_roles',
      name: 'custom_roles',
      description: 'Enable custom RBAC roles',
      enabled: true,
      rolloutPercentage: 100,
    },
    {
      id: 'api_v2',
      name: 'api_v2',
      description: 'Enable API v2 endpoints',
      enabled: false,
      rolloutPercentage: 0, // Future version
    },
    {
      id: 'mobile_app',
      name: 'mobile_app',
      description: 'Enable mobile app features',
      enabled: false,
      rolloutPercentage: 0, // Not implemented
    },
    {
      id: 'edge_caching',
      name: 'edge_caching',
      description: 'Enable edge caching with CDN',
      enabled: false,
      rolloutPercentage: 0, // Infrastructure not ready
    },
  ];

  for (const flag of defaultFlags) {
    await setFeatureFlag(flag);
  }

  console.log('Initialized default feature flags');
}

/**
 * Get feature flag statistics
 */
export async function getFeatureFlagStats(name: FeatureFlagName): Promise<{
  totalChecks: number;
  enabledCount: number;
  disabledCount: number;
  enabledPercentage: number;
}> {
  // Get from audit logs
  const checks = await prisma.auditLog.findMany({
    where: {
      action: 'FEATURE_FLAG_CHECKED',
      resourceId: name,
      timestamp: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
  });

  const totalChecks = checks.length;
  const enabledCount = checks.filter(c => {
    const metadata = JSON.parse(c.metadata as string);
    return metadata.enabled === true;
  }).length;
  const disabledCount = totalChecks - enabledCount;
  const enabledPercentage = totalChecks > 0 ? (enabledCount / totalChecks) * 100 : 0;

  return {
    totalChecks,
    enabledCount,
    disabledCount,
    enabledPercentage,
  };
}

/**
 * Log feature flag check (for analytics)
 */
export async function logFeatureFlagCheck(
  name: FeatureFlagName,
  enabled: boolean,
  userId?: string,
  tenantId?: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: 'FEATURE_FLAG_CHECKED',
      resourceType: 'feature_flag',
      resourceId: name,
      userId,
      tenantId,
      metadata: JSON.stringify({
        name,
        enabled,
        userId,
        tenantId,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });
}
