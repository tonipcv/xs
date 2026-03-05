/**
 * Notification Service
 * Multi-channel notification system (email, webhook, in-app)
 */

import { PrismaClient } from '@prisma/client';
import { sendEmail } from '@/lib/email';
import { publishConsentRevocation } from '@/lib/consent/propagation';

const prisma = new PrismaClient();

export type NotificationType = 
  | 'LEASE_EXPIRING'
  | 'LEASE_EXPIRED'
  | 'POLICY_UPDATED'
  | 'CONSENT_REVOKED'
  | 'BILLING_THRESHOLD'
  | 'SECURITY_ALERT'
  | 'MEMBER_INVITED'
  | 'MEMBER_JOINED'
  | 'DATASET_PUBLISHED'
  | 'WEBHOOK_FAILED';

export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: ('email' | 'webhook' | 'in-app')[];
  recipients: string[];
  createdAt: Date;
}

/**
 * Send notification through multiple channels
 */
export async function sendNotification(
  notification: Omit<Notification, 'id' | 'createdAt'>
): Promise<string> {
  const notificationId = `notif_${Date.now()}`;
  const timestamp = new Date();

  // Store notification in database
  await prisma.auditLog.create({
    data: {
      action: 'NOTIFICATION_SENT',
      resourceType: 'notification',
      resourceId: notificationId,
      metadata: JSON.stringify({
        ...notification,
        id: notificationId,
        createdAt: timestamp.toISOString(),
      }),
      status: 'SUCCESS',
      timestamp,
    },
  }).catch(() => {});

  // Send through each channel
  const promises: Promise<void>[] = [];

  if (notification.channels.includes('email')) {
    promises.push(sendEmailNotification(notification));
  }

  if (notification.channels.includes('webhook')) {
    promises.push(sendWebhookNotification(notification));
  }

  if (notification.channels.includes('in-app')) {
    promises.push(sendInAppNotification(notification));
  }

  await Promise.allSettled(promises);

  return notificationId;
}

/**
 * Send email notification
 */
async function sendEmailNotification(
  notification: Omit<Notification, 'id' | 'createdAt'>
): Promise<void> {
  const priorityColors = {
    LOW: '#6c757d',
    MEDIUM: '#0dcaf0',
    HIGH: '#ffc107',
    CRITICAL: '#dc3545',
  };

  const color = priorityColors[notification.priority];

  for (const recipient of notification.recipients) {
    await sendEmail({
      to: recipient,
      subject: `[${notification.priority}] ${notification.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: ${color}; color: white; padding: 15px; border-radius: 5px 5px 0 0;">
            <h2 style="margin: 0;">${notification.title}</h2>
            <span style="font-size: 12px;">Priority: ${notification.priority}</span>
          </div>
          
          <div style="padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
            <p>${notification.message}</p>
            
            ${notification.data ? `
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 20px;">
                <h4 style="margin-top: 0;">Details:</h4>
                <pre style="white-space: pre-wrap; word-wrap: break-word;">${JSON.stringify(notification.data, null, 2)}</pre>
              </div>
            ` : ''}
            
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
            
            <p style="color: #666; font-size: 12px;">
              This is an automated notification from XASE Sheets.<br>
              Type: ${notification.type}<br>
              Sent: ${new Date().toISOString()}
            </p>
          </div>
        </div>
      `,
    }).catch(err => {
      console.error('Failed to send email notification:', err);
    });
  }
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(
  notification: Omit<Notification, 'id' | 'createdAt'>
): Promise<void> {
  // This would trigger webhooks for subscribed events
  console.log('Webhook notification:', notification.type);
}

/**
 * Send in-app notification
 */
async function sendInAppNotification(
  notification: Omit<Notification, 'id' | 'createdAt'>
): Promise<void> {
  // Store in-app notification for each recipient
  for (const recipient of notification.recipients) {
    const user = await prisma.user.findUnique({
      where: { email: recipient },
      select: { id: true, tenantId: true },
    });

    if (user) {
      await prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'IN_APP_NOTIFICATION',
          resourceType: 'notification',
          resourceId: `notif_${Date.now()}`,
          metadata: JSON.stringify(notification),
          status: 'SUCCESS',
          timestamp: new Date(),
        },
      }).catch(() => {});
    }
  }
}

/**
 * Notify about expiring leases
 */
export async function notifyExpiringLeases(): Promise<void> {
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const expiringLeases = await prisma.accessLease.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: {
        lte: threeDaysFromNow,
        gte: new Date(),
      },
    },
    select: {
      id: true,
      leaseId: true,
      expiresAt: true,
      clientTenantId: true,
    },
  });

  const tenantIds = Array.from(
    new Set(expiringLeases.map(lease => lease.clientTenantId).filter((id): id is string => Boolean(id)))
  );

  const tenantContacts = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: {
      id: true,
      users: {
        where: {
          xaseRole: {
            in: ['ADMIN', 'OWNER'],
          },
        },
        select: { email: true },
      },
    },
  });

  const tenantEmailMap = new Map<string, string[]>(
    tenantContacts.map(t => [t.id, t.users.map(u => u.email).filter(Boolean) as string[]])
  );

  for (const lease of expiringLeases) {
    if (!lease.clientTenantId) continue;
    const recipients = tenantEmailMap.get(lease.clientTenantId) || [];

    if (recipients.length > 0) {
      await sendNotification({
        type: 'LEASE_EXPIRING',
        priority: 'HIGH',
        title: 'Data Access Lease Expiring Soon',
        message: `Your data access lease (${(lease as any).leaseId || lease.id}) will expire in less than 3 days.`,
        data: {
          leaseId: (lease as any).leaseId || lease.id,
          expiresAt: lease.expiresAt?.toISOString(),
        },
        channels: ['email', 'in-app'],
        recipients,
      });
    }
  }
}

/**
 * Notify about billing threshold exceeded
 */
export async function notifyBillingThreshold(
  tenantId: string,
  threshold: number,
  currentUsage: number
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        where: {
          xaseRole: {
            in: ['ADMIN', 'OWNER'],
          },
        },
      },
    },
  });

  if (!tenant) return;

  const recipients = tenant.users.map(u => u.email).filter(Boolean) as string[];

  if (recipients.length > 0) {
    await sendNotification({
      type: 'BILLING_THRESHOLD',
      priority: 'HIGH',
      title: 'Billing Threshold Exceeded',
      message: `Your organization has exceeded ${threshold}% of the billing threshold.`,
      data: {
        threshold,
        currentUsage,
        tenantName: tenant.name,
      },
      channels: ['email', 'webhook', 'in-app'],
      recipients,
    });
  }
}

/**
 * Notify about security alerts
 */
export async function notifySecurityAlert(
  tenantId: string,
  alertType: string,
  details: Record<string, any>
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        where: {
          xaseRole: {
            in: ['ADMIN', 'OWNER'],
          },
        },
      },
    },
  });

  if (!tenant) return;

  const recipients = tenant.users.map(u => u.email).filter(Boolean) as string[];

  if (recipients.length > 0) {
    await sendNotification({
      type: 'SECURITY_ALERT',
      priority: 'CRITICAL',
      title: `Security Alert: ${alertType}`,
      message: 'A security event has been detected that requires your attention.',
      data: details,
      channels: ['email', 'in-app'],
      recipients,
    });
  }
}

/**
 * Get user notifications
 */
export async function getUserNotifications(
  userId: string,
  limit: number = 50
): Promise<any[]> {
  const notifications = await prisma.auditLog.findMany({
    where: {
      userId,
      action: 'IN_APP_NOTIFICATION',
    },
    select: {
      resourceId: true,
      metadata: true,
      timestamp: true,
    },
    orderBy: {
      timestamp: 'desc',
    },
    take: limit,
  });

  return notifications.map(n => {
    try {
      return {
        id: n.resourceId,
        ...JSON.parse(n.metadata || '{}'),
        timestamp: n.timestamp,
      };
    } catch {
      return null;
    }
  }).filter(n => n !== null);
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<void> {
  await prisma.auditLog.updateMany({
    where: {
      userId,
      resourceId: notificationId,
      action: 'IN_APP_NOTIFICATION',
    },
    data: {
      metadata: JSON.stringify({ read: true }),
    },
  }).catch(() => {});
}
