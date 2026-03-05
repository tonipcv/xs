/**
 * Real-time Notifications System (stub)
 * Socket.io removed to avoid missing dependency; provides no-op fallbacks.
 */

import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'

const prisma = new PrismaClient()
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

export interface Notification {
  id: string;
  userId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

export type NotificationType =
  | 'LEASE_EXPIRING'
  | 'LEASE_EXPIRED'
  | 'LEASE_RENEWED'
  | 'DATASET_PUBLISHED'
  | 'ACCESS_REQUEST'
  | 'POLICY_UPDATED'
  | 'BILLING_THRESHOLD'
  | 'ANOMALY_DETECTED'
  | 'MEMBER_INVITED'
  | 'MEMBER_JOINED'
  | 'WEBHOOK_FAILED'
  | 'COMPLIANCE_ALERT'
  | 'SYSTEM_MAINTENANCE';

let noop = true

/**
 * Initialize WebSocket server
 */
export function initializeNotificationServer(): void {
  noop = true
  console.warn('[RealtimeNotifications] Socket.io server stub initialized (no-op).')
}

/**
 * Send notification to user
 */
export async function sendNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) {
  const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const fullNotification: Notification = {
    id,
    ...notification,
    read: false,
    createdAt: new Date(),
  };

  // Store in database
  await prisma.auditLog.create({
    data: {
      action: 'NOTIFICATION_SENT',
      resourceType: 'notification',
      resourceId: id,
      userId: notification.userId,
      tenantId: notification.tenantId,
      metadata: JSON.stringify(fullNotification),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Store in Redis for quick access
  await redis.setex(
    `notification:${id}`,
    7 * 24 * 60 * 60, // 7 days
    JSON.stringify(fullNotification)
  );

  // Add to user's notification list
  await redis.lpush(`notifications:user:${notification.userId}`, id);
  await redis.ltrim(`notifications:user:${notification.userId}`, 0, 99); // Keep last 100

  // Publish to Redis for real-time delivery
  await redis.publish('notifications', JSON.stringify(fullNotification));

  return fullNotification;
}

/**
 * Broadcast notification via WebSocket
 */
function broadcastNotification(_notification: Notification) {
  // No-op in stub implementation
}

/**
 * Get unread notifications for user
 */
async function getUnreadNotifications(userId: string): Promise<Notification[]> {
  const notificationIds = await redis.lrange(`notifications:user:${userId}`, 0, 99);
  const notifications: Notification[] = [];

  for (const id of notificationIds) {
    const data = await redis.get(`notification:${id}`);
    if (data) {
      const notification = JSON.parse(data);
      if (!notification.read) {
        notifications.push(notification);
      }
    }
  }

  return notifications;
}

/**
 * Mark notification as read
 */
async function markNotificationAsRead(notificationId: string) {
  const data = await redis.get(`notification:${notificationId}`);
  
  if (data) {
    const notification = JSON.parse(data);
    notification.read = true;
    
    await redis.setex(
      `notification:${notificationId}`,
      7 * 24 * 60 * 60,
      JSON.stringify(notification)
    );
  }
}

/**
 * Mark all notifications as read
 */
async function markAllNotificationsAsRead(userId: string) {
  const notificationIds = await redis.lrange(`notifications:user:${userId}`, 0, 99);

  for (const id of notificationIds) {
    await markNotificationAsRead(id);
  }
}

/**
 * Verify JWT token (placeholder)
 */
async function verifyToken(token: string): Promise<string | null> {
  // TODO: Implement actual JWT verification
  // For now, return a mock user ID
  return 'user_123';
}

/**
 * Send lease expiring notification
 */
export async function notifyLeaseExpiring(
  userId: string,
  tenantId: string,
  leaseId: string,
  datasetName: string,
  expiresIn: number
) {
  const timeUnit = expiresIn > 60 ? 'hours' : 'minutes';
  const timeValue = expiresIn > 60 ? Math.floor(expiresIn / 60) : expiresIn;

  await sendNotification({
    userId,
    tenantId,
    type: 'LEASE_EXPIRING',
    title: 'Lease Expiring Soon',
    message: `Your lease for "${datasetName}" will expire in ${timeValue} ${timeUnit}`,
    data: { leaseId, datasetName, expiresIn },
  });
}

/**
 * Send anomaly detected notification
 */
export async function notifyAnomalyDetected(
  userId: string,
  tenantId: string,
  anomalyType: string,
  severity: string,
  details: any
) {
  await sendNotification({
    userId,
    tenantId,
    type: 'ANOMALY_DETECTED',
    title: `Security Alert: ${anomalyType}`,
    message: `Anomaly detected with ${severity} severity`,
    data: { anomalyType, severity, details },
  });
}

/**
 * Send billing threshold notification
 */
export async function notifyBillingThreshold(
  userId: string,
  tenantId: string,
  currentCost: number,
  threshold: number
) {
  await sendNotification({
    userId,
    tenantId,
    type: 'BILLING_THRESHOLD',
    title: 'Billing Threshold Exceeded',
    message: `Your current usage ($${currentCost}) has exceeded the threshold ($${threshold})`,
    data: { currentCost, threshold },
  });
}

/**
 * Send member invited notification
 */
export async function notifyMemberInvited(
  userId: string,
  tenantId: string,
  inviterName: string,
  role: string
) {
  await sendNotification({
    userId,
    tenantId,
    type: 'MEMBER_INVITED',
    title: 'Team Invitation',
    message: `${inviterName} invited you to join as ${role}`,
    data: { inviterName, role },
  });
}

/**
 * Send access request notification
 */
export async function notifyAccessRequest(
  userId: string,
  tenantId: string,
  requesterName: string,
  datasetName: string,
  requestId: string
) {
  await sendNotification({
    userId,
    tenantId,
    type: 'ACCESS_REQUEST',
    title: 'New Access Request',
    message: `${requesterName} requested access to "${datasetName}"`,
    data: { requesterName, datasetName, requestId },
  });
}
