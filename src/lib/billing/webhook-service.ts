/**
 * Webhook Service - Event notifications
 * Sends webhooks for: lease_issued, consent_changed, budget_exhausted, etc.
 */

import crypto from 'crypto'

export interface WebhookEvent {
  id: string
  type: 'lease_issued' | 'lease_revoked' | 'consent_changed' | 'budget_exhausted' | 'policy_created' | 'policy_updated' | 'quota_exceeded'
  tenantId: string
  timestamp: Date
  data: Record<string, any>
}

export interface WebhookEndpoint {
  id: string
  tenantId: string
  url: string
  secret: string
  events: string[]
  enabled: boolean
  createdAt: Date
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  eventId: string
  url: string
  status: 'pending' | 'success' | 'failed' | 'retrying'
  attempts: number
  lastAttempt?: Date
  nextRetry?: Date
  response?: {
    status: number
    body: string
  }
}

export class WebhookService {
  private static readonly MAX_RETRIES = 3
  private static readonly RETRY_DELAYS = [60, 300, 900] // 1min, 5min, 15min

  /**
   * Register webhook endpoint
   */
  static async registerWebhook(
    tenantId: string,
    url: string,
    events: string[]
  ): Promise<WebhookEndpoint> {
    const secret = crypto.randomBytes(32).toString('hex')
    
    const webhook: WebhookEndpoint = {
      id: `wh_${Date.now()}`,
      tenantId,
      url,
      secret,
      events,
      enabled: true,
      createdAt: new Date(),
    }

    // Store in database (simplified - would use Prisma in production)
    console.log('[Webhook] Registered:', webhook.id)

    return webhook
  }

  /**
   * Send webhook event
   */
  static async sendEvent(event: WebhookEvent): Promise<void> {
    // Get webhooks for tenant that are subscribed to this event type
    const webhooks = await this.getWebhooksForEvent(event.tenantId, event.type)

    for (const webhook of webhooks) {
      await this.deliverWebhook(webhook, event)
    }
  }

  /**
   * Deliver webhook to endpoint
   */
  private static async deliverWebhook(
    webhook: WebhookEndpoint,
    event: WebhookEvent
  ): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: `whd_${Date.now()}`,
      webhookId: webhook.id,
      eventId: event.id,
      url: webhook.url,
      status: 'pending',
      attempts: 0,
    }

    try {
      const signature = this.generateSignature(event, webhook.secret)
      
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event.type,
          'X-Webhook-Id': event.id,
        },
        body: JSON.stringify(event),
      })

      delivery.status = response.ok ? 'success' : 'failed'
      delivery.attempts = 1
      delivery.lastAttempt = new Date()
      delivery.response = {
        status: response.status,
        body: await response.text().catch(() => ''),
      }

      if (!response.ok) {
        // Schedule retry
        await this.scheduleRetry(delivery)
      }
    } catch (error: any) {
      delivery.status = 'failed'
      delivery.attempts = 1
      delivery.lastAttempt = new Date()
      delivery.response = {
        status: 0,
        body: error.message,
      }

      await this.scheduleRetry(delivery)
    }

    return delivery
  }

  /**
   * Schedule webhook retry
   */
  private static async scheduleRetry(delivery: WebhookDelivery): Promise<void> {
    if (delivery.attempts >= this.MAX_RETRIES) {
      delivery.status = 'failed'
      return
    }

    const delaySeconds = this.RETRY_DELAYS[delivery.attempts - 1] || 900
    delivery.nextRetry = new Date(Date.now() + delaySeconds * 1000)
    delivery.status = 'retrying'

    console.log(`[Webhook] Scheduled retry for ${delivery.id} in ${delaySeconds}s`)
  }

  /**
   * Generate webhook signature
   */
  private static generateSignature(event: WebhookEvent, secret: string): string {
    const payload = JSON.stringify(event)
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
  }

  /**
   * Verify webhook signature
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  }

  /**
   * Get webhooks for event
   */
  private static async getWebhooksForEvent(
    tenantId: string,
    eventType: string
  ): Promise<WebhookEndpoint[]> {
    // In production, fetch from database
    // For now, return empty array
    return []
  }

  /**
   * Send lease issued event
   */
  static async sendLeaseIssued(
    tenantId: string,
    leaseId: string,
    datasetId: string,
    clientTenantId: string
  ): Promise<void> {
    await this.sendEvent({
      id: `evt_${Date.now()}`,
      type: 'lease_issued',
      tenantId,
      timestamp: new Date(),
      data: {
        leaseId,
        datasetId,
        clientTenantId,
      },
    })
  }

  /**
   * Send consent changed event
   */
  static async sendConsentChanged(
    tenantId: string,
    datasetId: string,
    consentStatus: string,
    reason?: string
  ): Promise<void> {
    await this.sendEvent({
      id: `evt_${Date.now()}`,
      type: 'consent_changed',
      tenantId,
      timestamp: new Date(),
      data: {
        datasetId,
        consentStatus,
        reason,
      },
    })
  }

  /**
   * Send budget exhausted event
   */
  static async sendBudgetExhausted(
    tenantId: string,
    datasetId: string,
    budgetType: 'epsilon' | 'quota',
    remaining: number
  ): Promise<void> {
    await this.sendEvent({
      id: `evt_${Date.now()}`,
      type: 'budget_exhausted',
      tenantId,
      timestamp: new Date(),
      data: {
        datasetId,
        budgetType,
        remaining,
      },
    })
  }

  /**
   * Send quota exceeded event
   */
  static async sendQuotaExceeded(
    tenantId: string,
    metric: string,
    limit: number,
    usage: number
  ): Promise<void> {
    await this.sendEvent({
      id: `evt_${Date.now()}`,
      type: 'quota_exceeded',
      tenantId,
      timestamp: new Date(),
      data: {
        metric,
        limit,
        usage,
        overage: usage - limit,
      },
    })
  }

  /**
   * Test webhook endpoint
   */
  static async testWebhook(webhookId: string): Promise<{
    success: boolean
    latency: number
    status?: number
    error?: string
  }> {
    const startTime = Date.now()

    try {
      // Send test event
      const testEvent: WebhookEvent = {
        id: `evt_test_${Date.now()}`,
        type: 'lease_issued',
        tenantId: 'test',
        timestamp: new Date(),
        data: { test: true },
      }

      // In production, fetch webhook from database
      // For now, return mock result
      const latency = Date.now() - startTime

      return {
        success: true,
        latency,
        status: 200,
      }
    } catch (error: any) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error.message,
      }
    }
  }

  /**
   * Get webhook deliveries
   */
  static async getDeliveries(
    webhookId: string,
    limit: number = 100
  ): Promise<WebhookDelivery[]> {
    // In production, fetch from database
    return []
  }

  /**
   * Retry failed webhook
   */
  static async retryWebhook(deliveryId: string): Promise<void> {
    // In production, fetch delivery and retry
    console.log(`[Webhook] Retrying delivery ${deliveryId}`)
  }
}
