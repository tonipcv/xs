/**
 * Outbound Webhooks System
 * Send webhooks to external services for integrations
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export type WebhookEvent = 
  | 'dataset.created'
  | 'dataset.updated'
  | 'dataset.published'
  | 'dataset.deleted'
  | 'lease.created'
  | 'lease.renewed'
  | 'lease.expired'
  | 'lease.revoked'
  | 'policy.created'
  | 'policy.updated'
  | 'policy.deleted'
  | 'member.invited'
  | 'member.added'
  | 'member.removed'
  | 'member.role_updated'
  | 'billing.invoice_created'
  | 'billing.payment_succeeded'
  | 'billing.payment_failed'
  | 'compliance.report_generated'
  | 'anomaly.detected'
  | 'backup.completed';

export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  headers?: Record<string, string>;
  retryConfig?: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: any;
  metadata?: {
    tenantId?: string;
    userId?: string;
    requestId?: string;
  };
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: WebhookPayload;
  url: string;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Register a new webhook
 */
export async function registerWebhook(
  config: Omit<WebhookConfig, 'id' | 'secret'>
): Promise<WebhookConfig> {
  const id = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const secret = generateWebhookSecret();

  const webhook: WebhookConfig = {
    id,
    secret,
    ...config,
    active: config.active !== undefined ? config.active : true,
  };

  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_REGISTERED',
      resourceType: 'webhook',
      resourceId: id,
      metadata: JSON.stringify({
        url: webhook.url,
        events: webhook.events,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  return webhook;
}

/**
 * Send webhook to external service
 */
export async function sendWebhook(
  webhookId: string,
  event: WebhookEvent,
  data: any,
  metadata?: WebhookPayload['metadata']
): Promise<WebhookDelivery> {
  const webhook = await getWebhook(webhookId);

  if (!webhook) {
    throw new Error(`Webhook ${webhookId} not found`);
  }

  if (!webhook.active) {
    throw new Error(`Webhook ${webhookId} is not active`);
  }

  if (!webhook.events.includes(event)) {
    throw new Error(`Webhook ${webhookId} is not subscribed to event ${event}`);
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
    metadata,
  };

  const delivery: WebhookDelivery = {
    id: `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    webhookId,
    event,
    payload,
    url: webhook.url,
    status: 'pending',
    attempts: 0,
    createdAt: new Date(),
  };

  // Send webhook asynchronously
  deliverWebhook(delivery, webhook).catch(error => {
    console.error(`Failed to deliver webhook ${delivery.id}:`, error);
  });

  return delivery;
}

/**
 * Deliver webhook with retry logic
 */
async function deliverWebhook(
  delivery: WebhookDelivery,
  webhook: WebhookConfig
): Promise<void> {
  const maxRetries = webhook.retryConfig?.maxRetries || 3;
  const backoffMultiplier = webhook.retryConfig?.backoffMultiplier || 2;
  const initialDelay = webhook.retryConfig?.initialDelay || 1000;

  while (delivery.attempts < maxRetries) {
    delivery.attempts++;
    delivery.lastAttemptAt = new Date();
    delivery.status = delivery.attempts > 1 ? 'retrying' : 'pending';

    try {
      const signature = generateWebhookSignature(delivery.payload, webhook.secret);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': delivery.event,
        'X-Webhook-Delivery': delivery.id,
        'X-Webhook-Timestamp': delivery.payload.timestamp,
        ...webhook.headers,
      };

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(delivery.payload),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      delivery.responseStatus = response.status;
      delivery.responseBody = await response.text();

      if (response.ok) {
        delivery.status = 'success';
        delivery.completedAt = new Date();

        await logWebhookDelivery(delivery, 'SUCCESS');
        return;
      } else {
        delivery.error = `HTTP ${response.status}: ${delivery.responseBody}`;
      }
    } catch (error: any) {
      delivery.error = error.message;
    }

    // Calculate next retry delay
    if (delivery.attempts < maxRetries) {
      const delay = initialDelay * Math.pow(backoffMultiplier, delivery.attempts - 1);
      delivery.nextRetryAt = new Date(Date.now() + delay);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  delivery.status = 'failed';
  delivery.completedAt = new Date();

  await logWebhookDelivery(delivery, 'FAILED');
}

/**
 * Generate webhook signature for verification
 */
function generateWebhookSignature(payload: WebhookPayload, secret: string): string {
  const data = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: WebhookPayload,
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
 * Generate webhook secret
 */
function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get webhook by ID
 */
async function getWebhook(webhookId: string): Promise<WebhookConfig | null> {
  const log = await prisma.auditLog.findFirst({
    where: {
      resourceType: 'webhook',
      resourceId: webhookId,
      action: 'WEBHOOK_REGISTERED',
    },
  });

  if (!log || !log.metadata) {
    return null;
  }

  const metadata = JSON.parse(log.metadata as string);

  return {
    id: webhookId,
    url: metadata.url,
    events: metadata.events,
    secret: metadata.secret || '',
    active: metadata.active !== false,
    headers: metadata.headers,
    retryConfig: metadata.retryConfig,
  };
}

/**
 * List all webhooks
 */
export async function listWebhooks(): Promise<WebhookConfig[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      resourceType: 'webhook',
      action: 'WEBHOOK_REGISTERED',
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  return logs.map(log => {
    const metadata = JSON.parse(log.metadata as string);
    return {
      id: log.resourceId,
      url: metadata.url,
      events: metadata.events,
      secret: metadata.secret || '',
      active: metadata.active !== false,
      headers: metadata.headers,
      retryConfig: metadata.retryConfig,
    };
  });
}

/**
 * Update webhook
 */
export async function updateWebhook(
  webhookId: string,
  updates: Partial<Omit<WebhookConfig, 'id' | 'secret'>>
): Promise<WebhookConfig> {
  const webhook = await getWebhook(webhookId);

  if (!webhook) {
    throw new Error(`Webhook ${webhookId} not found`);
  }

  const updated: WebhookConfig = {
    ...webhook,
    ...updates,
  };

  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_UPDATED',
      resourceType: 'webhook',
      resourceId: webhookId,
      metadata: JSON.stringify({
        url: updated.url,
        events: updated.events,
        active: updated.active,
        headers: updated.headers,
        retryConfig: updated.retryConfig,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  return updated;
}

/**
 * Delete webhook
 */
export async function deleteWebhook(webhookId: string): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_DELETED',
      resourceType: 'webhook',
      resourceId: webhookId,
      metadata: JSON.stringify({ webhookId }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });
}

/**
 * Log webhook delivery
 */
async function logWebhookDelivery(
  delivery: WebhookDelivery,
  status: 'SUCCESS' | 'FAILED'
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_DELIVERED',
      resourceType: 'webhook',
      resourceId: delivery.webhookId,
      metadata: JSON.stringify({
        deliveryId: delivery.id,
        event: delivery.event,
        attempts: delivery.attempts,
        status: delivery.status,
        responseStatus: delivery.responseStatus,
        error: delivery.error,
      }),
      status,
      timestamp: new Date(),
    },
  });
}

/**
 * Get webhook delivery statistics
 */
export async function getWebhookStats(
  webhookId: string,
  timeWindowHours: number = 24
): Promise<{
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  averageAttempts: number;
  successRate: number;
}> {
  const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

  const deliveries = await prisma.auditLog.findMany({
    where: {
      resourceType: 'webhook',
      resourceId: webhookId,
      action: 'WEBHOOK_DELIVERED',
      timestamp: {
        gte: since,
      },
    },
  });

  const totalDeliveries = deliveries.length;
  const successfulDeliveries = deliveries.filter(d => d.status === 'SUCCESS').length;
  const failedDeliveries = deliveries.filter(d => d.status === 'FAILED').length;

  const totalAttempts = deliveries.reduce((sum, d) => {
    const metadata = JSON.parse(d.metadata as string);
    return sum + (metadata.attempts || 1);
  }, 0);

  const averageAttempts = totalDeliveries > 0 ? totalAttempts / totalDeliveries : 0;
  const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 0;

  return {
    totalDeliveries,
    successfulDeliveries,
    failedDeliveries,
    averageAttempts,
    successRate,
  };
}

/**
 * Trigger webhook for event
 */
export async function triggerWebhookEvent(
  event: WebhookEvent,
  data: any,
  metadata?: WebhookPayload['metadata']
): Promise<void> {
  const webhooks = await listWebhooks();

  const subscribedWebhooks = webhooks.filter(
    w => w.active && w.events.includes(event)
  );

  for (const webhook of subscribedWebhooks) {
    await sendWebhook(webhook.id, event, data, metadata);
  }
}
