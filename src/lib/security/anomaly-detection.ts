/**
 * Anomaly Detection System
 * Detect suspicious access patterns and security anomalies
 * F3-014: Alertas de Anomalia em Access Patterns
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { sendEmail } from '@/lib/email/email-service';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface AnomalyAlert {
  id: string;
  type: 'volume_spike' | 'unusual_ip' | 'off_hours' | 'expired_lease' | 'rapid_requests';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  tenantId?: string;
  resourceId?: string;
  description: string;
  metadata: any;
  detectedAt: Date;
  resolved: boolean;
}

export interface AccessPattern {
  userId: string;
  tenantId: string;
  resourceType: string;
  resourceId: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
}

/**
 * Analyze access pattern for anomalies
 */
export async function analyzeAccessPattern(pattern: AccessPattern): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];

  // Run all anomaly checks in parallel
  const [
    volumeAlert,
    ipAlert,
    hoursAlert,
    expiredLeaseAlert,
    rapidRequestsAlert,
  ] = await Promise.all([
    checkVolumeAnomaly(pattern),
    checkUnusualIP(pattern),
    checkOffHoursAccess(pattern),
    checkExpiredLeaseAccess(pattern),
    checkRapidRequests(pattern),
  ]);

  if (volumeAlert) alerts.push(volumeAlert);
  if (ipAlert) alerts.push(ipAlert);
  if (hoursAlert) alerts.push(hoursAlert);
  if (expiredLeaseAlert) alerts.push(expiredLeaseAlert);
  if (rapidRequestsAlert) alerts.push(rapidRequestsAlert);

  // Store and notify for high/critical alerts
  for (const alert of alerts) {
    if (alert.severity === 'high' || alert.severity === 'critical') {
      await storeAlert(alert);
      await notifyAlert(alert);
    }
  }

  return alerts;
}

/**
 * Check for volume anomaly (>3x average)
 */
async function checkVolumeAnomaly(pattern: AccessPattern): Promise<AnomalyAlert | null> {
  const key = `access_volume:${pattern.userId}:${pattern.tenantId}`;
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  // Add current access
  await redis.zadd(key, now, `${now}:${pattern.resourceId}`);
  await redis.expire(key, 24 * 60 * 60); // 24 hours

  // Count accesses in last hour
  const recentCount = await redis.zcount(key, hourAgo, now);

  // Get historical average
  const historicalKey = `access_avg:${pattern.userId}:${pattern.tenantId}`;
  const avgStr = await redis.get(historicalKey);
  const historicalAvg = avgStr ? parseFloat(avgStr) : 10;

  // Update rolling average
  const newAvg = (historicalAvg * 0.9 + recentCount * 0.1);
  await redis.setex(historicalKey, 7 * 24 * 60 * 60, newAvg.toString());

  // Check if current volume is >3x average
  if (recentCount > historicalAvg * 3 && recentCount > 20) {
    return {
      id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'volume_spike',
      severity: recentCount > historicalAvg * 5 ? 'critical' : 'high',
      userId: pattern.userId,
      tenantId: pattern.tenantId,
      description: `Unusual access volume detected: ${recentCount} requests in last hour (${(recentCount / historicalAvg).toFixed(1)}x average)`,
      metadata: {
        currentVolume: recentCount,
        historicalAverage: historicalAvg,
        multiplier: recentCount / historicalAvg,
      },
      detectedAt: new Date(),
      resolved: false,
    };
  }

  return null;
}

/**
 * Check for unusual IP address
 */
async function checkUnusualIP(pattern: AccessPattern): Promise<AnomalyAlert | null> {
  const key = `known_ips:${pattern.userId}`;
  
  // Get known IPs for user
  const knownIPs = await redis.smembers(key);

  // Add current IP
  await redis.sadd(key, pattern.ipAddress);
  await redis.expire(key, 30 * 24 * 60 * 60); // 30 days

  // If this is a new IP and user has history
  if (knownIPs.length > 0 && !knownIPs.includes(pattern.ipAddress)) {
    // Check if IP is from different country (simplified check)
    const isHighRisk = await checkHighRiskIP(pattern.ipAddress);

    if (isHighRisk) {
      return {
        id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'unusual_ip',
        severity: 'high',
        userId: pattern.userId,
        tenantId: pattern.tenantId,
        description: `Access from new high-risk IP address: ${pattern.ipAddress}`,
        metadata: {
          ipAddress: pattern.ipAddress,
          knownIPCount: knownIPs.length,
          userAgent: pattern.userAgent,
        },
        detectedAt: new Date(),
        resolved: false,
      };
    }
  }

  return null;
}

/**
 * Check for off-hours access
 */
async function checkOffHoursAccess(pattern: AccessPattern): Promise<AnomalyAlert | null> {
  const hour = pattern.timestamp.getHours();
  const day = pattern.timestamp.getDay();

  // Define business hours: Mon-Fri 8am-6pm
  const isWeekend = day === 0 || day === 6;
  const isOffHours = hour < 8 || hour > 18;

  if (isWeekend || isOffHours) {
    // Check if user typically accesses during off-hours
    const key = `off_hours_pattern:${pattern.userId}`;
    const offHoursCount = await redis.incr(key);
    await redis.expire(key, 30 * 24 * 60 * 60);

    const totalKey = `total_access:${pattern.userId}`;
    const totalCount = await redis.incr(totalKey);
    await redis.expire(totalKey, 30 * 24 * 60 * 60);

    // If >80% of accesses are during business hours, flag off-hours access
    const offHoursRatio = offHoursCount / totalCount;

    if (offHoursRatio < 0.2 && totalCount > 50) {
      return {
        id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'off_hours',
        severity: 'medium',
        userId: pattern.userId,
        tenantId: pattern.tenantId,
        resourceId: pattern.resourceId,
        description: `Unusual off-hours access detected at ${pattern.timestamp.toISOString()}`,
        metadata: {
          hour,
          day,
          isWeekend,
          offHoursRatio,
        },
        detectedAt: new Date(),
        resolved: false,
      };
    }
  }

  return null;
}

/**
 * Check for access with expired lease
 */
async function checkExpiredLeaseAccess(pattern: AccessPattern): Promise<AnomalyAlert | null> {
  if (pattern.resourceType !== 'lease') {
    return null;
  }

  // Check if lease is expired
  const lease = await prisma.lease.findUnique({
    where: { leaseId: pattern.resourceId },
  });

  if (lease && lease.expiresAt < new Date()) {
    return {
      id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'expired_lease',
      severity: 'critical',
      userId: pattern.userId,
      tenantId: pattern.tenantId,
      resourceId: pattern.resourceId,
      description: `Attempted access with expired lease: ${pattern.resourceId}`,
      metadata: {
        leaseId: pattern.resourceId,
        expiresAt: lease.expiresAt,
        attemptedAt: pattern.timestamp,
      },
      detectedAt: new Date(),
      resolved: false,
    };
  }

  return null;
}

/**
 * Check for rapid sequential requests
 */
async function checkRapidRequests(pattern: AccessPattern): Promise<AnomalyAlert | null> {
  const key = `rapid_requests:${pattern.userId}`;
  const now = Date.now();
  const fiveSecondsAgo = now - 5000;

  // Add current request
  await redis.zadd(key, now, `${now}:${pattern.resourceId}`);
  await redis.expire(key, 60);

  // Count requests in last 5 seconds
  const recentCount = await redis.zcount(key, fiveSecondsAgo, now);

  // If >10 requests in 5 seconds, flag as suspicious
  if (recentCount > 10) {
    return {
      id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'rapid_requests',
      severity: 'high',
      userId: pattern.userId,
      tenantId: pattern.tenantId,
      description: `Rapid sequential requests detected: ${recentCount} requests in 5 seconds`,
      metadata: {
        requestCount: recentCount,
        timeWindow: '5 seconds',
        ipAddress: pattern.ipAddress,
      },
      detectedAt: new Date(),
      resolved: false,
    };
  }

  return null;
}

/**
 * Check if IP is high-risk (simplified)
 */
async function checkHighRiskIP(ipAddress: string): Promise<boolean> {
  // In production, integrate with IP reputation services
  // For now, simple heuristic checks
  
  // Check if IP is in known bad ranges (simplified)
  const badRanges = ['10.0.0.', '192.168.', '172.16.'];
  
  // Private IPs are not high risk
  if (badRanges.some(range => ipAddress.startsWith(range))) {
    return false;
  }

  // Check Redis cache for known bad IPs
  const isBad = await redis.sismember('bad_ips', ipAddress);
  return isBad === 1;
}

/**
 * Store anomaly alert
 */
async function storeAlert(alert: AnomalyAlert): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: 'ANOMALY_DETECTED',
      resourceType: 'security_alert',
      resourceId: alert.id,
      userId: alert.userId,
      tenantId: alert.tenantId,
      metadata: JSON.stringify(alert),
      status: 'SUCCESS',
      timestamp: alert.detectedAt,
    },
  });

  // Store in Redis for quick access
  await redis.setex(
    `alert:${alert.id}`,
    7 * 24 * 60 * 60,
    JSON.stringify(alert)
  );
}

/**
 * Notify about anomaly alert
 */
async function notifyAlert(alert: AnomalyAlert): Promise<void> {
  // Get user email
  if (!alert.userId) return;

  const user = await prisma.user.findUnique({
    where: { id: alert.userId },
  });

  if (!user?.email) return;

  // Get tenant admins
  const adminEmails = await getAdminEmails(alert.tenantId);

  const recipients = [user.email, ...adminEmails];

  const severityEmoji = {
    low: '🔵',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };

  await sendEmail({
    to: recipients,
    subject: `${severityEmoji[alert.severity]} Security Alert: ${alert.type.replace('_', ' ')}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${alert.severity === 'critical' ? '#f44336' : '#ff9800'};">
          ${severityEmoji[alert.severity]} Security Anomaly Detected
        </h2>
        
        <div style="background-color: ${alert.severity === 'critical' ? '#ffebee' : '#fff3cd'}; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid ${alert.severity === 'critical' ? '#f44336' : '#ff9800'};">
          <strong>Type:</strong> ${alert.type.replace('_', ' ').toUpperCase()}<br>
          <strong>Severity:</strong> ${alert.severity.toUpperCase()}<br>
          <strong>Description:</strong> ${alert.description}<br>
          <strong>Detected:</strong> ${alert.detectedAt.toISOString()}
        </div>
        
        <h3>Details:</h3>
        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto;">
${JSON.stringify(alert.metadata, null, 2)}
        </pre>
        
        <p>Please review this activity and take appropriate action if necessary.</p>
        
        <div style="margin: 30px 0;">
          <a href="${process.env.NEXTAUTH_URL}/security/alerts/${alert.id}" style="background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Review Alert
          </a>
        </div>
        
        <p>Best regards,<br>XASE Security Team</p>
      </div>
    `,
  });
}

/**
 * Get admin emails for tenant
 */
async function getAdminEmails(tenantId?: string): Promise<string[]> {
  if (!tenantId) return [];

  const adminLogs = await prisma.auditLog.findMany({
    where: {
      action: 'MEMBER_ADDED',
      resourceType: 'member',
      tenantId,
    },
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  const emails: string[] = [];
  for (const log of adminLogs) {
    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    if ((meta.role === 'OWNER' || meta.role === 'ADMIN') && log.user?.email) {
      emails.push(log.user.email);
    }
  }

  return emails;
}

/**
 * Get all alerts for tenant
 */
export async function getAlerts(
  tenantId: string,
  options?: {
    severity?: string[];
    type?: string[];
    resolved?: boolean;
    limit?: number;
  }
): Promise<AnomalyAlert[]> {
  const where: any = {
    action: 'ANOMALY_DETECTED',
    resourceType: 'security_alert',
    tenantId,
  };

  const alerts = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: options?.limit || 100,
  });

  return alerts
    .map((log) => {
      const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
      return meta as AnomalyAlert;
    })
    .filter((alert) => {
      if (options?.severity && !options.severity.includes(alert.severity)) {
        return false;
      }
      if (options?.type && !options.type.includes(alert.type)) {
        return false;
      }
      if (options?.resolved !== undefined && alert.resolved !== options.resolved) {
        return false;
      }
      return true;
    });
}

/**
 * Resolve alert
 */
export async function resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
  const alertData = await redis.get(`alert:${alertId}`);
  
  if (!alertData) {
    throw new Error('Alert not found');
  }

  const alert = JSON.parse(alertData);
  alert.resolved = true;
  alert.resolvedBy = resolvedBy;
  alert.resolvedAt = new Date();

  await redis.setex(`alert:${alertId}`, 7 * 24 * 60 * 60, JSON.stringify(alert));

  await prisma.auditLog.create({
    data: {
      action: 'ANOMALY_RESOLVED',
      resourceType: 'security_alert',
      resourceId: alertId,
      userId: resolvedBy,
      metadata: JSON.stringify({
        resolvedAt: alert.resolvedAt,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });
}
