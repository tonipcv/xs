/**
 * Webhook Dispatcher
 * Real webhook dispatch implementation for third-party integrations
 * F2-005: Webhooks - Implementar Dispatch Real
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import crypto from 'crypto';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export type WebhookEvent =
  | 'policy.created'
  | 'policy.revoked'
  | 'consent.revoked'
  | 'lease.issued'
  | 'lease.expired'
  | 'lease.expiring_soon'
  | 'billing.threshold_exceeded'
  | 'dataset.published'
  | 'access.requested';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: any;
  tenantId: string;
}

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  enabled: boolean;
  tenantId: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: any;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
}

/**
 * Dispatch webhook to configured endpoints
 */
export async function dispatchWebhook(
  event: WebhookEvent,
  data: any,
  tenantId: string
): Promise<void> {
  console.log(`Dispatching webhook: ${event} for tenant ${tenantId}`);

  // Get all webhook configurations for this tenant and event
  const webhooks = await getWebhookConfigs(tenantId, event);

  if (webhooks.length === 0) {
    console.log(`No webhooks configured for event: ${event}`);
    return;
  }

  // Create payload
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
    tenantId,
  };

  // Dispatch to all configured webhooks
  for (const webhook of webhooks) {
    await queueWebhookDelivery(webhook, payload);
  }
}

/**
 * Get webhook configurations for tenant and event
 */
async function getWebhookConfigs(
  tenantId: string,
  event: WebhookEvent
): Promise<WebhookConfig[]> {
  // Check cache first
  const cacheKey = `webhooks:${tenantId}`;
  const cached = await redis.get(cacheKey);

  let webhooks: WebhookConfig[];

  if (cached) {
    webhooks = JSON.parse(cached);
  } else {
    // Fetch from database
    const dbWebhooks = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'WEBHOOK_CONFIGURED',
        resourceType: 'webhook',
      },
      select: {
        resourceId: true,
        metadata: true,
      },
    });

    webhooks = dbWebhooks
      .map(w => {
        try {
          const meta = typeof w.metadata === 'string' ? JSON.parse(w.metadata) : w.metadata;
          return {
            id: w.resourceId || '',
            url: meta.url,
            secret: meta.secret,
            events: meta.events || [],
            enabled: meta.enabled !== false,
            tenantId,
          };
        } catch {
          return null;
        }
      })
      .filter((w): w is WebhookConfig => w !== null);

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(webhooks));
  }

  // Filter by event and enabled status
  return webhooks.filter(w => w.enabled && w.events.includes(event));
}

/**
 * Queue webhook delivery for processing
 */
async function queueWebhookDelivery(
  webhook: WebhookConfig,
  payload: WebhookPayload
): Promise<void> {
  const deliveryId = `whd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const delivery: WebhookDelivery = {
    id: deliveryId,
    webhookId: webhook.id,
    event: payload.event,
    payload,
    status: 'pending',
    attempts: 0,
  };

  // Store delivery record
  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_DELIVERY_QUEUED',
      resourceType: 'webhook_delivery',
      resourceId: deliveryId,
      tenantId: webhook.tenantId,
      metadata: JSON.stringify(delivery),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Queue for immediate processing
  await redis.lpush('webhook:queue', JSON.stringify({ webhook, delivery }));
}

/**
 * Process webhook delivery queue
 */
export async function processWebhookQueue(): Promise<void> {
  while (true) {
    try {
      // Get next delivery from queue (blocking pop with 1 second timeout)
      const item = await redis.brpop('webhook:queue', 1);

      if (!item) {
        continue;
      }

      const [, data] = item;
      const { webhook, delivery } = JSON.parse(data);

      await deliverWebhook(webhook, delivery);
    } catch (error) {
      console.error('Error processing webhook queue:', error);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Deliver webhook to endpoint
 */
async function deliverWebhook(
  webhook: WebhookConfig,
  delivery: WebhookDelivery
): Promise<void> {
  const maxAttempts = 5;
  const backoffBase = 2; // seconds

  delivery.attempts++;
  delivery.lastAttemptAt = new Date();

  try {
    // Generate signature
    const signature = generateWebhookSignature(
      JSON.stringify(delivery.payload),
      webhook.secret
    );

    // Send webhook
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': delivery.event,
        'X-Webhook-Delivery-ID': delivery.id,
        'User-Agent': 'XASE-Webhooks/1.0',
      },
      body: JSON.stringify(delivery.payload),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    delivery.responseStatus = response.status;
    delivery.responseBody = await response.text().catch(() => '');

    if (response.ok) {
      delivery.status = 'success';
      console.log(`Webhook delivered successfully: ${delivery.id}`);

      // Log success
      await prisma.auditLog.create({
        data: {
          action: 'WEBHOOK_DELIVERED',
          resourceType: 'webhook_delivery',
          resourceId: delivery.id,
          tenantId: webhook.tenantId,
          metadata: JSON.stringify({
            webhookId: webhook.id,
            event: delivery.event,
            attempts: delivery.attempts,
            status: response.status,
          }),
          status: 'SUCCESS',
          timestamp: new Date(),
        },
      });
    } else {
      throw new Error(`HTTP ${response.status}: ${delivery.responseBody}`);
    }
  } catch (error: any) {
    delivery.status = 'failed';
    delivery.error = error.message;

    console.error(`Webhook delivery failed: ${delivery.id}`, error);

    // Retry if not exceeded max attempts
    if (delivery.attempts < maxAttempts) {
      const retryDelay = Math.pow(backoffBase, delivery.attempts) * 1000;
      delivery.nextRetryAt = new Date(Date.now() + retryDelay);

      console.log(
        `Scheduling retry ${delivery.attempts}/${maxAttempts} in ${retryDelay}ms`
      );

      // Re-queue with delay
      setTimeout(async () => {
        await redis.lpush('webhook:queue', JSON.stringify({ webhook, delivery }));
      }, retryDelay);
    } else {
      console.error(`Max retry attempts reached for delivery: ${delivery.id}`);

      // Log final failure
      await prisma.auditLog.create({
        data: {
          action: 'WEBHOOK_DELIVERY_FAILED',
          resourceType: 'webhook_delivery',
          resourceId: delivery.id,
          tenantId: webhook.tenantId,
          metadata: JSON.stringify({
            webhookId: webhook.id,
            event: delivery.event,
            attempts: delivery.attempts,
            error: delivery.error,
          }),
          status: 'FAILED',
          timestamp: new Date(),
        },
      });
    }
  }

  // Update delivery record
  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_DELIVERY_UPDATED',
      resourceType: 'webhook_delivery',
      resourceId: delivery.id,
      tenantId: webhook.tenantId,
      metadata: JSON.stringify(delivery),
      status: delivery.status === 'success' ? 'SUCCESS' : 'FAILED',
      timestamp: new Date(),
    },
  });
}

/**
 * Generate HMAC signature for webhook
 */
function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateWebhookSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Register webhook configuration
 */
export async function registerWebhook(
  tenantId: string,
  url: string,
  events: WebhookEvent[],
  secret?: string
): Promise<WebhookConfig> {
  const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const webhookSecret = secret || crypto.randomBytes(32).toString('hex');

  const config: WebhookConfig = {
    id: webhookId,
    url,
    secret: webhookSecret,
    events,
    enabled: true,
    tenantId,
  };

  // Store configuration
  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_CONFIGURED',
      resourceType: 'webhook',
      resourceId: webhookId,
      tenantId,
      metadata: JSON.stringify(config),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Invalidate cache
  await redis.del(`webhooks:${tenantId}`);

  return config;
}

/**
 * Update webhook configuration
 */
export async function updateWebhook(
  webhookId: string,
  updates: Partial<Pick<WebhookConfig, 'url' | 'events' | 'enabled'>>
): Promise<void> {
  // Get existing config
  const existing = await prisma.auditLog.findFirst({
    where: {
      action: 'WEBHOOK_CONFIGURED',
      resourceType: 'webhook',
      resourceId: webhookId,
    },
  });

  if (!existing) {
    throw new Error('Webhook not found');
  }

  const config = typeof existing.metadata === 'string' 
    ? JSON.parse(existing.metadata) 
    : existing.metadata;

  const updated = { ...config, ...updates };

  // Store updated configuration
  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_CONFIGURED',
      resourceType: 'webhook',
      resourceId: webhookId,
      tenantId: existing.tenantId,
      metadata: JSON.stringify(updated),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Invalidate cache
  if (existing.tenantId) {
    await redis.del(`webhooks:${existing.tenantId}`);
  }
}

/**
 * Delete webhook configuration
 */
export async function deleteWebhook(webhookId: string): Promise<void> {
  const existing = await prisma.auditLog.findFirst({
    where: {
      action: 'WEBHOOK_CONFIGURED',
      resourceType: 'webhook',
      resourceId: webhookId,
    },
  });

  if (!existing) {
    throw new Error('Webhook not found');
  }

  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_DELETED',
      resourceType: 'webhook',
      resourceId: webhookId,
      tenantId: existing.tenantId,
      metadata: JSON.stringify({ deletedAt: new Date() }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Invalidate cache
  if (existing.tenantId) {
    await redis.del(`webhooks:${existing.tenantId}`);
  }
}

/**
 * Get webhook delivery history
 */
export async function getWebhookDeliveries(
  webhookId: string,
  limit: number = 50
): Promise<WebhookDelivery[]> {
  const deliveries = await prisma.auditLog.findMany({
    where: {
      resourceType: 'webhook_delivery',
      metadata: {
        path: ['webhookId'],
        equals: webhookId,
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
    take: limit,
  });

  return deliveries.map(d => {
    const meta = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata;
    return meta as WebhookDelivery;
  });
}

/**
 * Start webhook queue processor
 */
export function startWebhookProcessor(): void {
  console.log('Starting webhook processor...');
  processWebhookQueue().catch(error => {
    console.error('Webhook processor crashed:', error);
    // Restart after delay
    setTimeout(() => startWebhookProcessor(), 5000);
  });
}
