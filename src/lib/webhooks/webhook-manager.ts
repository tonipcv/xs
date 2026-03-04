/**
 * WEBHOOK MANAGER
 * Reliable webhook delivery system with retry logic
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export type WebhookEvent = 
  | 'dataset.created'
  | 'dataset.updated'
  | 'dataset.deleted'
  | 'policy.created'
  | 'policy.expired'
  | 'lease.created'
  | 'lease.expired'
  | 'cohort.completed'
  | 'entity.matched'
  | 'billing.invoice_created'

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  tenantId: string
  data: any
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  event: WebhookEvent
  payload: WebhookPayload
  url: string
  status: 'PENDING' | 'DELIVERED' | 'FAILED'
  attempts: number
  maxAttempts: number
  lastAttemptAt?: Date
  nextRetryAt?: Date
  responseStatus?: number
  responseBody?: string
  error?: string
}

export class WebhookManager {
  private static readonly MAX_ATTEMPTS = 5
  private static readonly RETRY_DELAYS = [60, 300, 900, 3600, 7200] // seconds
  private static readonly TIMEOUT_MS = 10000

  /**
   * Send webhook to URL
   */
  static async sendWebhook(
    url: string,
    payload: WebhookPayload,
    secret: string
  ): Promise<{
    success: boolean
    status?: number
    body?: string
    error?: string
  }> {
    try {
      // Generate signature
      const signature = this.generateSignature(payload, secret)

      // Send HTTP POST
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': payload.event,
          'X-Webhook-Timestamp': payload.timestamp,
          'User-Agent': 'XASE-Webhooks/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      const body = await response.text()

      return {
        success: response.ok,
        status: response.status,
        body: body.substring(0, 1000), // Limit stored response
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Generate HMAC signature for webhook
   */
  static generateSignature(payload: WebhookPayload, secret: string): string {
    const data = JSON.stringify(payload)
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex')
  }

  /**
   * Verify webhook signature
   */
  static verifySignature(
    payload: WebhookPayload,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = this.generateSignature(payload, secret)
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  }

  /**
   * Queue webhook for delivery
   */
  static async queueWebhook(
    tenantId: string,
    event: WebhookEvent,
    data: any
  ): Promise<void> {
    // Get active webhooks for this tenant and event
    const webhooks = await prisma.webhook.findMany({
      where: {
        tenantId,
        events: { has: event },
        enabled: true,
      },
    })

    if (webhooks.length === 0) {
      return
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      tenantId,
      data,
    }

    // Create delivery records
    const deliveries = webhooks.map(webhook => ({
      webhookId: webhook.id,
      event,
      payload: JSON.stringify(payload),
      url: webhook.url,
      status: 'PENDING' as const,
      attempts: 0,
      maxAttempts: this.MAX_ATTEMPTS,
      nextRetryAt: new Date(),
    }))

    await prisma.webhookDelivery.createMany({
      data: deliveries,
    })
  }

  /**
   * Process pending webhook deliveries
   */
  static async processPendingDeliveries(limit: number = 100): Promise<{
    processed: number
    delivered: number
    failed: number
  }> {
    const now = new Date()
    
    // Get pending deliveries ready for retry
    const deliveries = await prisma.webhookDelivery.findMany({
      where: {
        status: 'PENDING',
        nextRetryAt: { lte: now },
        attempts: { lt: this.MAX_ATTEMPTS },
      },
      include: {
        webhook: true,
      },
      take: limit,
      orderBy: { nextRetryAt: 'asc' },
    })

    let delivered = 0
    let failed = 0

    for (const delivery of deliveries) {
      const payload = JSON.parse(delivery.payload as string) as WebhookPayload
      
      // Send webhook
      const result = await this.sendWebhook(
        delivery.url,
        payload,
        delivery.webhook.secret
      )

      const attempts = delivery.attempts + 1
      const isLastAttempt = attempts >= this.MAX_ATTEMPTS

      if (result.success) {
        // Mark as delivered
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'DELIVERED',
            attempts,
            lastAttemptAt: now,
            responseStatus: result.status,
            responseBody: result.body,
          },
        })
        delivered++
      } else {
        // Schedule retry or mark as failed
        const status = isLastAttempt ? 'FAILED' : 'PENDING'
        const nextRetryAt = isLastAttempt
          ? null
          : new Date(now.getTime() + this.RETRY_DELAYS[attempts - 1] * 1000)

        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status,
            attempts,
            lastAttemptAt: now,
            nextRetryAt,
            responseStatus: result.status,
            responseBody: result.body,
            error: result.error,
          },
        })

        if (isLastAttempt) {
          failed++
        }
      }
    }

    return {
      processed: deliveries.length,
      delivered,
      failed,
    }
  }

  /**
   * Retry failed delivery
   */
  static async retryDelivery(deliveryId: string): Promise<boolean> {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    })

    if (!delivery) {
      throw new Error('Delivery not found')
    }

    const payload = JSON.parse(delivery.payload as string) as WebhookPayload
    const result = await this.sendWebhook(
      delivery.url,
      payload,
      delivery.webhook.secret
    )

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: result.success ? 'DELIVERED' : 'FAILED',
        attempts: delivery.attempts + 1,
        lastAttemptAt: new Date(),
        responseStatus: result.status,
        responseBody: result.body,
        error: result.error,
      },
    })

    return result.success
  }

  /**
   * Get delivery statistics
   */
  static async getDeliveryStats(
    tenantId: string,
    since?: Date
  ): Promise<{
    total: number
    delivered: number
    pending: number
    failed: number
    successRate: number
  }> {
    const where = {
      webhook: { tenantId },
      ...(since ? { createdAt: { gte: since } } : {}),
    }

    const [total, delivered, pending, failed] = await Promise.all([
      prisma.webhookDelivery.count({ where }),
      prisma.webhookDelivery.count({ where: { ...where, status: 'DELIVERED' } }),
      prisma.webhookDelivery.count({ where: { ...where, status: 'PENDING' } }),
      prisma.webhookDelivery.count({ where: { ...where, status: 'FAILED' } }),
    ])

    const successRate = total > 0 ? (delivered / total) * 100 : 0

    return {
      total,
      delivered,
      pending,
      failed,
      successRate,
    }
  }

  /**
   * Clean up old deliveries
   */
  static async cleanupOldDeliveries(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    const result = await prisma.webhookDelivery.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        status: { in: ['DELIVERED', 'FAILED'] },
      },
    })

    return result.count
  }

  /**
   * Test webhook endpoint
   */
  static async testWebhook(
    url: string,
    secret: string
  ): Promise<{
    success: boolean
    latency: number
    error?: string
  }> {
    const startTime = Date.now()
    
    const testPayload: WebhookPayload = {
      event: 'dataset.created',
      timestamp: new Date().toISOString(),
      tenantId: 'test',
      data: { test: true },
    }

    const result = await this.sendWebhook(url, testPayload, secret)
    const latency = Date.now() - startTime

    return {
      success: result.success,
      latency,
      error: result.error,
    }
  }

  /**
   * Emit event (convenience method)
   */
  static async emit(
    tenantId: string,
    event: WebhookEvent,
    data: any
  ): Promise<void> {
    await this.queueWebhook(tenantId, event, data)
  }

  /**
   * Batch emit multiple events
   */
  static async emitBatch(
    events: Array<{
      tenantId: string
      event: WebhookEvent
      data: any
    }>
  ): Promise<void> {
    await Promise.all(
      events.map(({ tenantId, event, data }) =>
        this.queueWebhook(tenantId, event, data)
      )
    )
  }
}
