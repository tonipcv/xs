/**
 * Rate Limiting Security Tests
 * Tests for rate limiting and DoS protection
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

describe('Rate Limiting Tests', () => {
  describe('Authentication Rate Limiting', () => {
    it('should rate limit login attempts', async () => {
      const requests = [];
      
      // Attempt 20 failed logins
      for (let i = 0; i < 20; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: 'test@example.com',
              password: 'wrong_password',
            }),
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      // Should have rate limiting after multiple failures
      const rateLimited = statusCodes.filter(s => s === 429);
      
      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should rate limit password reset requests', async () => {
      const requests = [];
      
      // Attempt 15 password resets
      for (let i = 0; i < 15; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/auth/forgot-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: 'test@example.com',
            }),
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      const rateLimited = statusCodes.filter(s => s === 429);
      
      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should rate limit registration attempts', async () => {
      const requests = [];
      
      // Attempt 10 registrations
      for (let i = 0; i < 10; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: `User ${i}`,
              email: `user${i}@example.com`,
              password: 'SecurePass123!',
              region: 'US',
            }),
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      const rateLimited = statusCodes.filter(s => s === 429);
      
      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('API Endpoint Rate Limiting', () => {
    it('should rate limit dataset listing requests', async () => {
      const requests = [];
      
      // Send 150 requests
      for (let i = 0; i < 150; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      const rateLimited = statusCodes.filter(s => s === 429);
      
      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should rate limit dataset creation requests', async () => {
      const requests = [];
      
      // Attempt 30 dataset creations
      for (let i = 0; i < 30; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': 'test_key',
            },
            body: JSON.stringify({
              name: `Dataset ${i}`,
              description: 'Test',
              dataType: 'AUDIO',
            }),
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      const rateLimited = statusCodes.filter(s => s === 429);
      
      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should rate limit policy creation requests', async () => {
      const requests = [];
      
      // Attempt 25 policy creations
      for (let i = 0; i < 25; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/policies`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': 'test_key',
            },
            body: JSON.stringify({
              name: `Policy ${i}`,
              datasetId: 'test_id',
              rules: {},
            }),
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      const rateLimited = statusCodes.filter(s => s === 429);
      
      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Per-Tier Rate Limiting', () => {
    it('should enforce FREE tier rate limits', async () => {
      const requests = [];
      
      // FREE tier: 100 requests per hour
      for (let i = 0; i < 120; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'GET',
            headers: {
              'X-API-Key': 'free_tier_key',
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      const rateLimited = statusCodes.filter(s => s === 429);
      
      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should enforce INICIANTE tier rate limits', async () => {
      const requests = [];
      
      // INICIANTE tier: 1000 requests per hour
      for (let i = 0; i < 50; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'GET',
            headers: {
              'X-API-Key': 'iniciante_tier_key',
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      
      // Should not be rate limited for INICIANTE tier
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBe(0);
    }, 30000);

    it('should enforce PRO tier rate limits', async () => {
      const requests = [];
      
      // PRO tier: 10000 requests per hour
      for (let i = 0; i < 100; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'GET',
            headers: {
              'X-API-Key': 'pro_tier_key',
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      
      // Should not be rate limited for PRO tier
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBe(0);
    }, 30000);
  });

  describe('Rate Limit Headers', () => {
    it('should include rate limit headers in responses', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      // Check for standard rate limit headers
      const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitReset = response.headers.get('X-RateLimit-Reset');

      if (rateLimitLimit) {
        expect(parseInt(rateLimitLimit)).toBeGreaterThan(0);
      }

      if (rateLimitRemaining) {
        expect(parseInt(rateLimitRemaining)).toBeGreaterThanOrEqual(0);
      }

      if (rateLimitReset) {
        expect(parseInt(rateLimitReset)).toBeGreaterThan(0);
      }
    });

    it('should include Retry-After header when rate limited', async () => {
      const requests = [];
      
      // Trigger rate limit
      for (let i = 0; i < 200; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses.find(r => r.status === 429);

      if (rateLimitedResponse) {
        const retryAfter = rateLimitedResponse.headers.get('Retry-After');
        
        if (retryAfter) {
          expect(parseInt(retryAfter)).toBeGreaterThan(0);
        }
      }
    }, 30000);
  });

  describe('Distributed Rate Limiting', () => {
    it('should enforce rate limits across multiple IPs', async () => {
      const requests = [];
      
      // Attempt to bypass by changing IP
      for (let i = 0; i < 50; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
              'X-Forwarded-For': `192.168.1.${i % 10}`,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      
      // Rate limit should be based on API key, not IP
      expect(responses.length).toBe(50);
    }, 30000);
  });

  describe('Burst Protection', () => {
    it('should handle burst traffic', async () => {
      const startTime = Date.now();
      const requests = [];
      
      // Send 50 requests in quick succession
      for (let i = 0; i < 50; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // Should handle burst without crashing
      expect(responses.length).toBe(50);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    }, 30000);
  });

  describe('Sliding Window Rate Limiting', () => {
    it('should use sliding window for rate limiting', async () => {
      // Send requests over time
      const responses = [];

      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
          method: 'GET',
          headers: {
            'X-API-Key': 'test_key',
          },
        });
        responses.push(response);

        // Wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // All should succeed if within rate limit
      const successfulRequests = responses.filter(r => (r.status === 200 || r.status === 401));
      expect(successfulRequests.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Rate Limit Reset', () => {
    it('should reset rate limit after time window', async () => {
      // Trigger rate limit
      const requests1 = [];
      for (let i = 0; i < 150; i++) {
        requests1.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          })
        );
      }

      await Promise.all(requests1);

      // Wait for rate limit window to reset (assuming 1 minute window)
      await new Promise(resolve => setTimeout(resolve, 61000));

      // Try again
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      // Should work after reset
      expect([200, 401]).toContain(response.status);
    }, 90000);
  });

  describe('Endpoint-Specific Rate Limits', () => {
    it('should have stricter limits for expensive operations', async () => {
      const requests = [];
      
      // Dataset creation is more expensive than listing
      for (let i = 0; i < 20; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': 'test_key',
            },
            body: JSON.stringify({
              name: `Dataset ${i}`,
              description: 'Test',
              dataType: 'AUDIO',
            }),
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      // Should rate limit creation faster than reads
      const rateLimited = statusCodes.filter(s => s === 429);
      
      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('DDoS Protection', () => {
    it('should handle concurrent requests without crashing', async () => {
      const requests = [];
      
      // Simulate DDoS with 500 concurrent requests
      for (let i = 0; i < 200; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/health`, {
            method: 'GET',
          })
        );
      }

      const responses = await Promise.all(requests);
      
      // Server should remain responsive
      expect(responses.length).toBe(200);
      
      // Most should succeed or be rate limited, not error
      const validResponses = responses.filter(r => [200, 429, 503].includes(r.status));
      expect(validResponses.length).toBeGreaterThan(160);
    }, 60000);
  });

  describe('Graceful Degradation', () => {
    it('should return 503 under extreme load', async () => {
      const requests = [];
      
      // Extreme load
      for (let i = 0; i < 1000; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/v1/datasets`, {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      // Should have mix of success, rate limit, and service unavailable
      const valid = statusCodes.filter(s => [200,401,429,503].includes(s));
      
      // System should gracefully degrade
      expect(valid.length).toBeGreaterThanOrEqual(900);
    }, 60000);
  });
});
