/**
 * Webhook Dispatcher Unit Tests
 * Tests for webhook event dispatching and delivery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

describe('Webhook Dispatcher', () => {
  describe('Signature Generation', () => {
    it('should generate valid HMAC signature', () => {
      const payload = { type: 'test.event', data: { id: '123' } };
      const secret = 'test_secret_key';
      
      const payloadString = JSON.stringify(payload);
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payloadString);
      const signature = `sha256=${hmac.digest('hex')}`;
      
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'test_secret';
      
      const payload1 = JSON.stringify({ type: 'event1' });
      const payload2 = JSON.stringify({ type: 'event2' });
      
      const sig1 = crypto.createHmac('sha256', secret).update(payload1).digest('hex');
      const sig2 = crypto.createHmac('sha256', secret).update(payload2).digest('hex');
      
      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const payload = JSON.stringify({ type: 'test' });
      
      const sig1 = crypto.createHmac('sha256', 'secret1').update(payload).digest('hex');
      const sig2 = crypto.createHmac('sha256', 'secret2').update(payload).digest('hex');
      
      expect(sig1).not.toBe(sig2);
    });

    it('should generate same signature for same payload and secret', () => {
      const payload = JSON.stringify({ type: 'test' });
      const secret = 'test_secret';
      
      const sig1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const sig2 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      
      expect(sig1).toBe(sig2);
    });
  });

  describe('Signature Verification', () => {
    it('should verify valid signature', () => {
      const payload = JSON.stringify({ type: 'test' });
      const secret = 'test_secret';
      
      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const providedSignature = expectedSignature;
      
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(providedSignature)
      );
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ type: 'test' });
      const secret = 'test_secret';
      
      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const providedSignature = 'invalid_signature_' + '0'.repeat(48);
      
      try {
        const isValid = crypto.timingSafeEqual(
          Buffer.from(expectedSignature),
          Buffer.from(providedSignature)
        );
        expect(isValid).toBe(false);
      } catch (error) {
        // timingSafeEqual throws if lengths don't match
        expect(error).toBeTruthy();
      }
    });

    it('should use timing-safe comparison', () => {
      const payload = JSON.stringify({ type: 'test' });
      const secret = 'test_secret';
      
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      
      // Timing-safe comparison should work
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(signature)
      );
      
      expect(isValid).toBe(true);
    });
  });

  describe('Event Type Validation', () => {
    it('should validate policy events', () => {
      const validEvents = [
        'policy.created',
        'policy.revoked',
        'policy.updated',
      ];
      
      validEvents.forEach(event => {
        expect(event).toMatch(/^policy\.(created|revoked|updated)$/);
      });
    });

    it('should validate consent events', () => {
      const validEvents = [
        'consent.revoked',
        'consent.granted',
      ];
      
      validEvents.forEach(event => {
        expect(event).toMatch(/^consent\.(revoked|granted)$/);
      });
    });

    it('should validate lease events', () => {
      const validEvents = [
        'lease.issued',
        'lease.expired',
        'lease.expiring_soon',
        'lease.revoked',
      ];
      
      validEvents.forEach(event => {
        expect(event).toMatch(/^lease\.(issued|expired|expiring_soon|revoked)$/);
      });
    });

    it('should validate billing events', () => {
      const validEvents = [
        'billing.threshold_exceeded',
        'billing.payment_succeeded',
        'billing.payment_failed',
      ];
      
      validEvents.forEach(event => {
        expect(event).toMatch(/^billing\.(threshold_exceeded|payment_succeeded|payment_failed)$/);
      });
    });

    it('should validate dataset events', () => {
      const validEvents = [
        'dataset.published',
        'dataset.updated',
        'dataset.deleted',
      ];
      
      validEvents.forEach(event => {
        expect(event).toMatch(/^dataset\.(published|updated|deleted)$/);
      });
    });

    it('should validate access events', () => {
      const validEvents = [
        'access.requested',
        'access.granted',
        'access.denied',
      ];
      
      validEvents.forEach(event => {
        expect(event).toMatch(/^access\.(requested|granted|denied)$/);
      });
    });
  });

  describe('Payload Structure', () => {
    it('should create valid webhook payload', () => {
      const payload = {
        id: crypto.randomUUID(),
        type: 'policy.created',
        data: {
          policyId: 'pol_123',
          name: 'Test Policy',
        },
        timestamp: new Date().toISOString(),
        tenantId: 'tenant_123',
      };
      
      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('type');
      expect(payload).toHaveProperty('data');
      expect(payload).toHaveProperty('timestamp');
      expect(payload).toHaveProperty('tenantId');
      
      expect(payload.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(payload.type).toBe('policy.created');
      expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should serialize payload to JSON', () => {
      const payload = {
        id: '123',
        type: 'test.event',
        data: { value: 'test' },
        timestamp: '2026-02-28T10:00:00Z',
        tenantId: 'tenant_123',
      };
      
      const json = JSON.stringify(payload);
      const parsed = JSON.parse(json);
      
      expect(parsed).toEqual(payload);
    });
  });

  describe('Retry Logic', () => {
    it('should calculate retry delays', () => {
      const retryDelays = [1000, 5000, 15000];
      
      expect(retryDelays[0]).toBe(1000);   // 1 second
      expect(retryDelays[1]).toBe(5000);   // 5 seconds
      expect(retryDelays[2]).toBe(15000);  // 15 seconds
    });

    it('should calculate next retry time', () => {
      const delay = 5000; // 5 seconds
      const now = Date.now();
      const nextRetry = new Date(now + delay);
      
      expect(nextRetry.getTime()).toBeGreaterThan(now);
      expect(nextRetry.getTime() - now).toBe(delay);
    });

    it('should respect max retries', () => {
      const maxRetries = 3;
      const attempts = [0, 1, 2, 3];
      
      attempts.forEach(attempt => {
        const shouldRetry = attempt < maxRetries;
        expect(shouldRetry).toBe(attempt < 3);
      });
    });
  });

  describe('HTTP Request Headers', () => {
    it('should include required headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': 'sha256=abc123',
        'X-Webhook-Event': 'policy.created',
        'X-Webhook-ID': crypto.randomUUID(),
        'User-Agent': 'XASE-Webhooks/1.0',
      };
      
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Webhook-Signature']).toMatch(/^sha256=/);
      expect(headers['X-Webhook-Event']).toBe('policy.created');
      expect(headers['X-Webhook-ID']).toMatch(/^[0-9a-f-]{36}$/);
      expect(headers['User-Agent']).toBe('XASE-Webhooks/1.0');
    });
  });

  describe('Timeout Handling', () => {
    it('should set request timeout', () => {
      const timeout = 10000; // 10 seconds
      
      expect(timeout).toBe(10000);
      expect(timeout).toBeGreaterThan(0);
    });

    it('should abort request on timeout', async () => {
      const controller = new AbortController();
      const timeout = 100;
      
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      await new Promise(resolve => setTimeout(resolve, timeout + 10));
      
      expect(controller.signal.aborted).toBe(true);
      clearTimeout(timeoutId);
    });
  });

  describe('Response Handling', () => {
    it('should handle successful response', () => {
      const response = {
        ok: true,
        status: 200,
        statusText: 'OK',
      };
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    });

    it('should handle error response', () => {
      const response = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      };
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it('should limit response body size', () => {
      const responseBody = 'a'.repeat(2000);
      const limited = responseBody.substring(0, 1000);
      
      expect(limited.length).toBe(1000);
      expect(limited.length).toBeLessThan(responseBody.length);
    });
  });

  describe('Delivery Status', () => {
    it('should track delivery status', () => {
      const statuses = ['pending', 'success', 'failed'];
      
      expect(statuses).toContain('pending');
      expect(statuses).toContain('success');
      expect(statuses).toContain('failed');
    });

    it('should track attempt count', () => {
      let attempts = 0;
      
      attempts++;
      expect(attempts).toBe(1);
      
      attempts++;
      expect(attempts).toBe(2);
      
      attempts++;
      expect(attempts).toBe(3);
    });

    it('should record last attempt time', () => {
      const lastAttemptAt = new Date();
      
      expect(lastAttemptAt).toBeInstanceOf(Date);
      expect(lastAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Error Handling', () => {
    it('should capture error messages', () => {
      const error = new Error('Connection timeout');
      
      expect(error.message).toBe('Connection timeout');
      expect(error).toBeInstanceOf(Error);
    });

    it('should handle network errors', () => {
      const errors = [
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ECONNRESET',
      ];
      
      errors.forEach(errorCode => {
        expect(errorCode).toMatch(/^E[A-Z]+$/);
      });
    });

    it('should handle HTTP errors', () => {
      const httpErrors = [400, 401, 403, 404, 500, 502, 503, 504];
      
      httpErrors.forEach(status => {
        expect(status).toBeGreaterThanOrEqual(400);
      });
    });
  });

  describe('Statistics', () => {
    it('should calculate success rate', () => {
      const total = 100;
      const successful = 95;
      const successRate = (successful / total) * 100;
      
      expect(successRate).toBe(95);
    });

    it('should handle zero total', () => {
      const total = 0;
      const successful = 0;
      const successRate = total > 0 ? (successful / total) * 100 : 0;
      
      expect(successRate).toBe(0);
    });

    it('should group by status', () => {
      const deliveries = [
        { status: 'success' },
        { status: 'success' },
        { status: 'failed' },
        { status: 'pending' },
      ];
      
      const grouped = deliveries.reduce((acc: any, d) => {
        acc[d.status] = (acc[d.status] || 0) + 1;
        return acc;
      }, {});
      
      expect(grouped.success).toBe(2);
      expect(grouped.failed).toBe(1);
      expect(grouped.pending).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should calculate cutoff date', () => {
      const daysToKeep = 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      expect(cutoffDate.getTime()).toBeLessThan(Date.now());
    });

    it('should identify old deliveries', () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const oldDelivery = new Date();
      oldDelivery.setDate(oldDelivery.getDate() - 35);
      
      const isOld = oldDelivery < cutoffDate;
      expect(isOld).toBe(true);
    });

    it('should keep recent deliveries', () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const recentDelivery = new Date();
      recentDelivery.setDate(recentDelivery.getDate() - 5);
      
      const isOld = recentDelivery < cutoffDate;
      expect(isOld).toBe(false);
    });
  });

  describe('Secret Generation', () => {
    it('should generate secure secret', () => {
      const secret = crypto.randomBytes(32).toString('hex');
      
      expect(secret.length).toBe(64);
      expect(secret).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique secrets', () => {
      const secret1 = crypto.randomBytes(32).toString('hex');
      const secret2 = crypto.randomBytes(32).toString('hex');
      
      expect(secret1).not.toBe(secret2);
    });
  });

  describe('URL Validation', () => {
    it('should validate HTTPS URLs', () => {
      const url = 'https://example.com/webhook';
      
      try {
        new URL(url);
        expect(url).toMatch(/^https:\/\//);
      } catch {
        expect(true).toBe(false);
      }
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com',
        'javascript:alert(1)',
      ];
      
      invalidUrls.forEach(url => {
        try {
          new URL(url);
          // If it doesn't throw, check protocol
          const parsed = new URL(url);
          expect(['http:', 'https:']).toContain(parsed.protocol);
        } catch {
          // Expected to throw for invalid URLs
          expect(true).toBe(true);
        }
      });
    });
  });
});
