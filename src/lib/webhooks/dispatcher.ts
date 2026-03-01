/**
 * Webhook Dispatcher
 * Handles dispatching webhook events to configured endpoints
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface WebhookEvent {
  type: WebhookEventType;
  data: any;
  tenantId: string;
  timestamp: Date;
}

export type WebhookEventType =
  | 'policy.created'
  | 'policy.revoked'
  | 'policy.updated'
  | 'consent.revoked'
  | 'consent.granted'
  | 'lease.issued'
  | 'lease.expired'
  | 'lease.expiring_soon'
  | 'lease.revoked'
  | 'billing.threshold_exceeded'
  | 'billing.payment_succeeded'
  | 'billing.payment_failed'
  | 'dataset.published'
  | 'dataset.updated'
  | 'dataset.deleted'
  | 'access.requested'
  | 'access.granted'
  | 'access.denied';

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  isActive: boolean;
  tenantId: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: WebhookEventType;
  payload: any;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
}

export class WebhookDispatcher {
  private maxRetries = 3;
  private retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s
  private timeout = 10000; // 10 seconds

  /**
   * Dispatch a webhook event to all configured endpoints
   */
  async dispatch(event: WebhookEvent): Promise<void> {
    try {
      // Get all active webhooks for this tenant that subscribe to this event
      const webhooks = await prisma.webhook.findMany({
        where: {
          tenantId: event.tenantId,
          isActive: true,
          events: {
            has: event.type,
          },
        },
      });

      if (webhooks.length === 0) {
        console.log(`No webhooks configured for event ${event.type} in tenant ${event.tenantId}`);
        return;
      }

      // Dispatch to all webhooks in parallel
      const deliveryPromises = webhooks.map(webhook =>
        this.deliverWebhook(webhook, event)
      );

      await Promise.allSettled(deliveryPromises);
    } catch (error) {
      console.error('Error dispatching webhook:', error);
    }
  }

  /**
   * Deliver webhook to a specific endpoint
   */
  private async deliverWebhook(
    webhook: any,
    event: WebhookEvent
  ): Promise<void> {
    const payload = {
      id: crypto.randomUUID(),
      type: event.type,
      data: event.data,
      timestamp: event.timestamp.toISOString(),
      tenantId: event.tenantId,
    };

    // Create delivery record
    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType: event.type,
        payload: JSON.stringify(payload),
        status: 'pending',
        attempts: 0,
      },
    });

    // Attempt delivery with retries
    await this.attemptDelivery(webhook, payload, delivery.id);
  }

  /**
   * Attempt to deliver webhook with retry logic
   */
  private async attemptDelivery(
    webhook: any,
    payload: any,
    deliveryId: string,
    attemptNumber: number = 0
  ): Promise<void> {
    try {
      // Generate signature
      const signature = this.generateSignature(payload, webhook.secret);

      // Make HTTP request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': payload.type,
          'X-Webhook-ID': payload.id,
          'User-Agent': 'XASE-Webhooks/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseBody = await response.text();

      // Update delivery record
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: response.ok ? 'success' : 'failed',
          attempts: attemptNumber + 1,
          lastAttemptAt: new Date(),
          responseStatus: response.status,
          responseBody: responseBody.substring(0, 1000), // Limit size
          error: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`,
        },
      });

      if (!response.ok && attemptNumber < this.maxRetries) {
        // Schedule retry
        const delay = this.retryDelays[attemptNumber] || 15000;
        const nextRetryAt = new Date(Date.now() + delay);

        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { nextRetryAt },
        });

        // Retry after delay
        setTimeout(() => {
          this.attemptDelivery(webhook, payload, deliveryId, attemptNumber + 1);
        }, delay);
      }

      // Log delivery
      console.log(`Webhook delivery ${response.ok ? 'succeeded' : 'failed'}: ${webhook.url} (attempt ${attemptNumber + 1})`);
    } catch (error: any) {
      console.error(`Webhook delivery error: ${error.message}`);

      // Update delivery record with error
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          attempts: attemptNumber + 1,
          lastAttemptAt: new Date(),
          error: error.message,
        },
      });

      // Retry if not exceeded max attempts
      if (attemptNumber < this.maxRetries) {
        const delay = this.retryDelays[attemptNumber] || 15000;
        const nextRetryAt = new Date(Date.now() + delay);

        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { nextRetryAt },
        });

        setTimeout(() => {
          this.attemptDelivery(webhook, payload, deliveryId, attemptNumber + 1);
        }, delay);
      }
    }
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  private generateSignature(payload: any, secret: string): string {
    const payloadString = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadString);
    return `sha256=${hmac.digest('hex')}`;
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
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );
  }

  /**
   * Retry failed webhook deliveries
   */
  async retryFailedDeliveries(): Promise<void> {
    try {
      // Get failed deliveries that are ready for retry
      const failedDeliveries = await prisma.webhookDelivery.findMany({
        where: {
          status: 'failed',
          attempts: {
            lt: this.maxRetries,
          },
          nextRetryAt: {
            lte: new Date(),
          },
        },
        include: {
          webhook: true,
        },
        take: 100, // Process in batches
      });

      for (const delivery of failedDeliveries) {
        if (delivery.webhook && delivery.webhook.isActive) {
          const payload = JSON.parse(delivery.payload);
          await this.attemptDelivery(
            delivery.webhook,
            payload,
            delivery.id,
            delivery.attempts
          );
        }
      }
    } catch (error) {
      console.error('Error retrying failed deliveries:', error);
    }
  }

  /**
   * Get webhook delivery statistics
   */
  async getDeliveryStats(webhookId: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    pending: number;
    successRate: number;
  }> {
    const stats = await prisma.webhookDelivery.groupBy({
      by: ['status'],
      where: {
        webhookId,
      },
      _count: true,
    });

    const total = stats.reduce((sum, stat) => sum + stat._count, 0);
    const successful = stats.find(s => s.status === 'success')?._count || 0;
    const failed = stats.find(s => s.status === 'failed')?._count || 0;
    const pending = stats.find(s => s.status === 'pending')?._count || 0;

    return {
      total,
      successful,
      failed,
      pending,
      successRate: total > 0 ? (successful / total) * 100 : 0,
    };
  }

  /**
   * Clean up old webhook deliveries
   */
  async cleanupOldDeliveries(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.webhookDelivery.deleteMany({
      where: {
        lastAttemptAt: {
          lt: cutoffDate,
        },
        status: {
          in: ['success', 'failed'],
        },
      },
    });

    return result.count;
  }
}

// Singleton instance
export const webhookDispatcher = new WebhookDispatcher();

// Helper functions for common webhook events
export async function dispatchPolicyCreated(
  tenantId: string,
  policyId: string,
  policyData: any
): Promise<void> {
  await webhookDispatcher.dispatch({
    type: 'policy.created',
    data: {
      policyId,
      ...policyData,
    },
    tenantId,
    timestamp: new Date(),
  });
}

export async function dispatchPolicyRevoked(
  tenantId: string,
  policyId: string,
  reason?: string
): Promise<void> {
  await webhookDispatcher.dispatch({
    type: 'policy.revoked',
    data: {
      policyId,
      reason,
    },
    tenantId,
    timestamp: new Date(),
  });
}

export async function dispatchConsentRevoked(
  tenantId: string,
  userId: string,
  datasetId: string
): Promise<void> {
  await webhookDispatcher.dispatch({
    type: 'consent.revoked',
    data: {
      userId,
      datasetId,
    },
    tenantId,
    timestamp: new Date(),
  });
}

export async function dispatchLeaseIssued(
  tenantId: string,
  leaseId: string,
  leaseData: any
): Promise<void> {
  await webhookDispatcher.dispatch({
    type: 'lease.issued',
    data: {
      leaseId,
      ...leaseData,
    },
    tenantId,
    timestamp: new Date(),
  });
}

export async function dispatchLeaseExpired(
  tenantId: string,
  leaseId: string
): Promise<void> {
  await webhookDispatcher.dispatch({
    type: 'lease.expired',
    data: {
      leaseId,
    },
    tenantId,
    timestamp: new Date(),
  });
}

export async function dispatchLeaseExpiringSoon(
  tenantId: string,
  leaseId: string,
  expiresAt: Date
): Promise<void> {
  await webhookDispatcher.dispatch({
    type: 'lease.expiring_soon',
    data: {
      leaseId,
      expiresAt: expiresAt.toISOString(),
    },
    tenantId,
    timestamp: new Date(),
  });
}

export async function dispatchBillingThresholdExceeded(
  tenantId: string,
  threshold: number,
  currentUsage: number
): Promise<void> {
  await webhookDispatcher.dispatch({
    type: 'billing.threshold_exceeded',
    data: {
      threshold,
      currentUsage,
      percentage: (currentUsage / threshold) * 100,
    },
    tenantId,
    timestamp: new Date(),
  });
}

export async function dispatchDatasetPublished(
  tenantId: string,
  datasetId: string,
  datasetData: any
): Promise<void> {
  await webhookDispatcher.dispatch({
    type: 'dataset.published',
    data: {
      datasetId,
      ...datasetData,
    },
    tenantId,
    timestamp: new Date(),
  });
}

export async function dispatchAccessRequested(
  tenantId: string,
  requestId: string,
  requestData: any
): Promise<void> {
  await webhookDispatcher.dispatch({
    type: 'access.requested',
    data: {
      requestId,
      ...requestData,
    },
    tenantId,
    timestamp: new Date(),
  });
}
