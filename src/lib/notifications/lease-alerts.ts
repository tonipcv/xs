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
    const lease = await prisma.voiceAccessLease.findUnique({
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
        contactEmail: true
      }
    })

    if (!clientTenant?.contactEmail) {
      console.warn(`No contact email for tenant ${lease.clientTenantId}`)
      return
    }

    // Prepare alert message
    const message = getAlertMessage(alertType, lease, context)

    // Send via multiple channels
    await Promise.allSettled([
      sendEmailAlert(clientTenant.contactEmail, message),
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
  // TODO: Integrate with Resend/SendGrid
  // For now, just log
  console.log(`📧 Email to ${to}: ${message.subject}`)
  
  // Example integration:
  // await fetch('https://api.resend.com/emails', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     from: 'alerts@xase.ai',
  //     to,
  //     subject: message.subject,
  //     text: message.body
  //   })
  // })
}

/**
 * Send push notification (using OneSignal)
 */
async function sendPushNotification(
  tenantId: string,
  message: { subject: string; body: string; priority: string }
): Promise<void> {
  // TODO: Integrate with OneSignal
  console.log(`🔔 Push to tenant ${tenantId}: ${message.subject}`)
  
  // Example integration:
  // await fetch('https://onesignal.com/api/v1/notifications', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     app_id: process.env.ONESIGNAL_APP_ID,
  //     filters: [{ field: 'tag', key: 'tenant_id', value: tenantId }],
  //     headings: { en: message.subject },
  //     contents: { en: message.body },
  //     priority: message.priority === 'high' ? 10 : 5
  //   })
  // })
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
  // Get tenant's webhook URL if configured
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      webhookUrl: true,
      webhookSecret: true
    }
  })

  if (!tenant?.webhookUrl) {
    return // No webhook configured
  }

  try {
    await fetch(tenant.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Xase-Signature': tenant.webhookSecret || ''
      },
      body: JSON.stringify({
        event: 'lease.alert',
        leaseId,
        alertType,
        timestamp: new Date().toISOString(),
        context
      })
    })

    console.log(`🔗 Webhook sent to ${tenant.webhookUrl}`)
  } catch (error) {
    console.error(`Failed to send webhook:`, error)
  }
}

/**
 * Background job to check for expiring leases and send alerts
 */
export async function checkExpiringLeases(): Promise<void> {
  const now = new Date()
  const in30min = new Date(now.getTime() + 30 * 60 * 1000)
  const in5min = new Date(now.getTime() + 5 * 60 * 1000)

  // Find leases expiring in 30min (alert not sent yet)
  const leases30min = await prisma.voiceAccessLease.findMany({
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
    await prisma.voiceAccessLease.update({
      where: { id: lease.id },
      data: { alert30minSent: true }
    })
  }

  // Find leases expiring in 5min (alert not sent yet)
  const leases5min = await prisma.voiceAccessLease.findMany({
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
    await prisma.voiceAccessLease.update({
      where: { id: lease.id },
      data: { alert5minSent: true }
    })
  }

  console.log(`✓ Checked expiring leases: ${leases30min.length} (30min), ${leases5min.length} (5min)`)
}
