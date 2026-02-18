/**
 * Lease Expiry Alerts
 * Send notifications via email, push, and webhooks when leases are about to expire
 */

import { prisma } from '@/lib/prisma'

type AlertType = 
  | 'EXPIRING_30MIN'
  | 'EXPIRING_5MIN'
  | 'EXPIRED'
  | 'AUTO_RENEWED'
  | 'MAX_RENEWALS_REACHED'
  | 'BUDGET_EXCEEDED'

interface AlertContext {
  newExpiresAt?: Date
  totalCost?: number
  budgetLimit?: number
}

/**
 * Send lease expiry alert via multiple channels
 */
export async function sendLeaseExpiryAlert(
  leaseId: string,
  alertType: AlertType,
  context?: AlertContext
): Promise<void> {
  try {
    const lease = await prisma.accessLease.findUnique({
      where: { leaseId },
      include: {
        dataset: {
          select: {
            name: true,
            tenantId: true
          }
        },
        policy: {
          select: {
            policyId: true
          }
        }
      }
    })

    if (!lease) {
      console.error(`Lease ${leaseId} not found for alert`)
      return
    }

    // Get client tenant contact info
    const clientTenant = await prisma.tenant.findUnique({
      where: { id: lease.clientTenantId },
      select: {
        name: true,
        email: true
      }
    })

    if (!clientTenant?.email) {
      console.warn(`No contact email for tenant ${lease.clientTenantId}`)
      return
    }

    // Prepare alert message
    const message = getAlertMessage(alertType, lease, context)

    // Send via multiple channels
    await Promise.allSettled([
      sendEmailAlert(clientTenant.email, message),
      sendPushNotification(lease.clientTenantId, message),
      sendWebhook(lease.clientTenantId, leaseId, alertType, context)
    ])

    console.log(`✓ Sent ${alertType} alert for lease ${leaseId}`)

  } catch (error) {
    console.error(`Failed to send alert for lease ${leaseId}:`, error)
  }
}

function getAlertMessage(
  alertType: AlertType,
  lease: any,
  context?: AlertContext
): { subject: string; body: string; priority: 'high' | 'medium' | 'low' } {
  const datasetName = lease.dataset?.name || 'Unknown Dataset'
  const expiresAt = lease.expiresAt.toLocaleString()

  switch (alertType) {
    case 'EXPIRING_30MIN':
      return {
        subject: `⚠️ Lease expiring in 30 minutes`,
        body: `Your lease for "${datasetName}" will expire at ${expiresAt}.\n\nLease ID: ${lease.leaseId}\n\nExtend now to avoid interruption.`,
        priority: 'high'
      }

    case 'EXPIRING_5MIN':
      return {
        subject: `🚨 URGENT: Lease expiring in 5 minutes`,
        body: `Your lease for "${datasetName}" will expire at ${expiresAt}.\n\nLease ID: ${lease.leaseId}\n\nACTION REQUIRED: Extend immediately or your training will be interrupted.`,
        priority: 'high'
      }

    case 'EXPIRED':
      return {
        subject: `❌ Lease expired`,
        body: `Your lease for "${datasetName}" has expired.\n\nLease ID: ${lease.leaseId}\n\nRenew to continue access.`,
        priority: 'medium'
      }

    case 'AUTO_RENEWED':
      return {
        subject: `✅ Lease auto-renewed`,
        body: `Your lease for "${datasetName}" was automatically renewed.\n\nLease ID: ${lease.leaseId}\nNew expiry: ${context?.newExpiresAt?.toLocaleString()}\n\nNo action needed.`,
        priority: 'low'
      }

    case 'MAX_RENEWALS_REACHED':
      return {
        subject: `⚠️ Max renewals reached - lease will expire`,
        body: `Your lease for "${datasetName}" has reached the maximum number of auto-renewals.\n\nLease ID: ${lease.leaseId}\nExpires at: ${expiresAt}\n\nManually extend to continue access.`,
        priority: 'high'
      }

    case 'BUDGET_EXCEEDED':
      return {
        subject: `💰 Budget limit reached - lease will expire`,
        body: `Your lease for "${datasetName}" has reached the budget limit.\n\nLease ID: ${lease.leaseId}\nTotal cost: $${context?.totalCost}\nBudget limit: $${context?.budgetLimit}\n\nIncrease budget or manually extend.`,
        priority: 'high'
      }

    default:
      return {
        subject: `Lease notification`,
        body: `Lease ${lease.leaseId} status update`,
        priority: 'medium'
      }
  }
}

/**
 * Send email alert (using Resend or SendGrid)
 */
async function sendEmailAlert(
  to: string,
  message: { subject: string; body: string; priority: string }
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  
  if (!resendApiKey) {
    console.warn(`📧 Email alert skipped (RESEND_API_KEY not configured): ${message.subject}`);
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'alerts@xase.ai',
        to,
        subject: message.subject,
        text: message.body,
        tags: [
          { name: 'priority', value: message.priority },
          { name: 'type', value: 'lease-alert' }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${error}`);
    }

    console.log(`📧 Email sent to ${to}: ${message.subject}`);
  } catch (error) {
    console.error('Failed to send email alert:', error);
  }
}

/**
 * Send push notification (using OneSignal)
 */
async function sendPushNotification(
  tenantId: string,
  message: { subject: string; body: string; priority: string }
): Promise<void> {
  const onesignalApiKey = process.env.ONESIGNAL_API_KEY;
  const onesignalAppId = process.env.ONESIGNAL_APP_ID;

  if (!onesignalApiKey || !onesignalAppId) {
    console.warn(`🔔 Push notification skipped (OneSignal not configured): ${message.subject}`);
    return;
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${onesignalApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: onesignalAppId,
        filters: [{ field: 'tag', key: 'tenant_id', value: tenantId }],
        headings: { en: message.subject },
        contents: { en: message.body },
        priority: message.priority === 'high' ? 10 : 5,
        data: { type: 'lease-alert', tenant_id: tenantId }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OneSignal API error: ${error}`);
    }

    console.log(`🔔 Push notification sent to tenant ${tenantId}: ${message.subject}`);
  } catch (error) {
    console.error('Failed to send push notification:', error);
  }
}

/**
 * Send webhook to client's system
 */
async function sendWebhook(
  tenantId: string,
  leaseId: string,
  alertType: AlertType,
  context?: AlertContext
): Promise<void> {
  // Webhook functionality requires adding webhookUrl and webhookSecret fields to Tenant schema
  // For now, webhooks are disabled until schema is updated
  console.log(`Webhook notification skipped for tenant ${tenantId} - schema not yet configured`);
  return;
}

/**
 * Background job to check for expiring leases and send alerts
 */
export async function checkExpiringLeases(): Promise<void> {
  const now = new Date()
  const in30min = new Date(now.getTime() + 30 * 60 * 1000)
  const in5min = new Date(now.getTime() + 5 * 60 * 1000)

  // Find leases expiring in 30min (alert not sent yet)
  const leases30min = await prisma.accessLease.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: {
        lte: in30min,
        gt: in5min
      },
      alert30minSent: false,
      deletedAt: null
    }
  })

  for (const lease of leases30min) {
    await sendLeaseExpiryAlert(lease.leaseId, 'EXPIRING_30MIN')
    await prisma.accessLease.update({
      where: { id: lease.id },
      data: { alert30minSent: true }
    })
  }

  // Find leases expiring in 5min (alert not sent yet)
  const leases5min = await prisma.accessLease.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: {
        lte: in5min,
        gt: now
      },
      alert5minSent: false,
      deletedAt: null
    }
  })

  for (const lease of leases5min) {
    await sendLeaseExpiryAlert(lease.leaseId, 'EXPIRING_5MIN')
    await prisma.accessLease.update({
      where: { id: lease.id },
      data: { alert5minSent: true }
    })
  }

  console.log(`✓ Checked expiring leases: ${leases30min.length} (30min), ${leases5min.length} (5min)`)
}
