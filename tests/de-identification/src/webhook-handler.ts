import axios from 'axios';
import * as crypto from 'crypto';

interface WebhookConfig {
  url: string;
  secret?: string;
  events: string[];
  retries?: number;
  timeout?: number;
}

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: any;
  signature?: string;
}

export class WebhookHandler {
  private configs: Map<string, WebhookConfig> = new Map();

  register(id: string, config: WebhookConfig): void {
    this.configs.set(id, {
      ...config,
      retries: config.retries || 3,
      timeout: config.timeout || 5000
    });
  }

  unregister(id: string): void {
    this.configs.delete(id);
  }

  async trigger(event: string, data: any): Promise<void> {
    const webhooks = Array.from(this.configs.entries())
      .filter(([_, config]) => config.events.includes(event) || config.events.includes('*'));

    const promises = webhooks.map(([id, config]) => 
      this.sendWebhook(id, config, event, data)
    );

    await Promise.allSettled(promises);
  }

  private async sendWebhook(
    id: string,
    config: WebhookConfig,
    event: string,
    data: any,
    attempt: number = 1
  ): Promise<void> {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data
    };

    if (config.secret) {
      payload.signature = this.generateSignature(payload, config.secret);
    }

    try {
      await axios.post(config.url, payload, {
        timeout: config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-ID': id,
          'X-Webhook-Signature': payload.signature || ''
        }
      });

      console.log(`✓ Webhook ${id} delivered for event: ${event}`);
    } catch (error: any) {
      console.error(`✗ Webhook ${id} failed (attempt ${attempt}): ${error.message}`);

      if (attempt < (config.retries || 3)) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendWebhook(id, config, event, data, attempt + 1);
      }
    }
  }

  private generateSignature(payload: WebhookPayload, secret: string): string {
    const data = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

// Webhook events
export const WebhookEvents = {
  DEIDENTIFICATION_STARTED: 'deidentification.started',
  DEIDENTIFICATION_COMPLETED: 'deidentification.completed',
  DEIDENTIFICATION_FAILED: 'deidentification.failed',
  BATCH_STARTED: 'batch.started',
  BATCH_COMPLETED: 'batch.completed',
  BATCH_FAILED: 'batch.failed',
  QUALITY_GATE_PASSED: 'quality.gate.passed',
  QUALITY_GATE_FAILED: 'quality.gate.failed',
  PHI_DETECTED: 'phi.detected',
  VALIDATION_FAILED: 'validation.failed'
};

// Example usage
export async function exampleWebhookUsage() {
  const webhookHandler = new WebhookHandler();

  // Register webhook
  webhookHandler.register('my-webhook', {
    url: 'https://example.com/webhook',
    secret: 'my-secret-key',
    events: [
      WebhookEvents.DEIDENTIFICATION_COMPLETED,
      WebhookEvents.QUALITY_GATE_FAILED
    ],
    retries: 3,
    timeout: 5000
  });

  // Trigger webhook
  await webhookHandler.trigger(WebhookEvents.DEIDENTIFICATION_COMPLETED, {
    fileId: '123',
    filename: 'patient-data.txt',
    phiDetected: 15,
    phiRedacted: 15,
    redactionRate: 100,
    processingTime: 45
  });
}
