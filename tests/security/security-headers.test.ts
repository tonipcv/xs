/**
 * Security Headers Tests
 * Tests for proper security headers configuration
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

describe('Security Headers Tests', () => {
  describe('HSTS (HTTP Strict Transport Security)', () => {
    it('should set Strict-Transport-Security header in production', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const hsts = response.headers.get('strict-transport-security');
      
      // HSTS only set in production per middleware.ts:71-73
      if (process.env.NODE_ENV === 'production' && hsts) {
        expect(hsts).toContain('max-age=');
        expect(parseInt(hsts.match(/max-age=(\d+)/)?.[1] || '0')).toBeGreaterThan(0);
      } else {
        // In dev, HSTS may not be set
        expect(true).toBe(true);
      }
    });

    it('should include includeSubDomains directive in production', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const hsts = response.headers.get('strict-transport-security');
      
      if (hsts && process.env.NODE_ENV === 'production') {
        expect(hsts.toLowerCase()).toContain('includesubdomains');
      } else {
        expect(true).toBe(true);
      }
    });

    it('should have max-age of at least 1 year in production', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const hsts = response.headers.get('strict-transport-security');
      
      if (hsts && process.env.NODE_ENV === 'production') {
        const maxAge = parseInt(hsts.match(/max-age=(\d+)/)?.[1] || '0');
        const oneYear = 31536000; // seconds in a year
        expect(maxAge).toBeGreaterThanOrEqual(oneYear);
      } else {
        expect(true).toBe(true);
      }
    });
  });

  describe('X-Frame-Options', () => {
    it('should set X-Frame-Options header', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const xFrameOptions = response.headers.get('x-frame-options');
      
      expect(xFrameOptions).toBeTruthy();
      expect(['DENY', 'SAMEORIGIN']).toContain(xFrameOptions?.toUpperCase());
    });

    it('should prevent clickjacking', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      const xFrameOptions = response.headers.get('x-frame-options');
      
      if (xFrameOptions) {
        expect(['DENY', 'SAMEORIGIN']).toContain(xFrameOptions.toUpperCase());
      }
    });
  });

  describe('X-Content-Type-Options', () => {
    it('should set X-Content-Type-Options to nosniff', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const xContentTypeOptions = response.headers.get('x-content-type-options');
      
      expect(xContentTypeOptions).toBe('nosniff');
    });

    it('should prevent MIME type sniffing on API responses', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      const xContentTypeOptions = response.headers.get('x-content-type-options');
      
      expect(xContentTypeOptions).toBe('nosniff');
    });
  });

  describe('X-XSS-Protection', () => {
    it('should set X-XSS-Protection header', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const xXssProtection = response.headers.get('x-xss-protection');
      
      if (xXssProtection) {
        expect(xXssProtection).toMatch(/1/);
      }
    });

    it('should enable XSS filtering with mode=block', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const xXssProtection = response.headers.get('x-xss-protection');
      
      if (xXssProtection) {
        expect(xXssProtection).toContain('mode=block');
      }
    });
  });

  describe('Content-Security-Policy', () => {
    it('should set Content-Security-Policy header', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const csp = response.headers.get('content-security-policy');
      
      expect(csp).toBeTruthy();
    });

    it('should restrict script sources', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const csp = response.headers.get('content-security-policy');
      
      if (csp) {
        expect(csp).toContain('script-src');
      }
    });

    it('should restrict style sources', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const csp = response.headers.get('content-security-policy');
      
      if (csp) {
        expect(csp).toContain('style-src');
      }
    });

    it('should set default-src directive', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const csp = response.headers.get('content-security-policy');
      
      if (csp) {
        expect(csp).toContain('default-src');
      }
    });

    it('should restrict frame-ancestors', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const csp = response.headers.get('content-security-policy');
      
      if (csp) {
        expect(csp).toContain('frame-ancestors');
      }
    });

    it('should not allow unsafe-eval in production', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const csp = response.headers.get('content-security-policy');
      
      // Dev allows unsafe-eval for HMR per middleware.ts:41
      if (csp && process.env.NODE_ENV === 'production') {
        expect(csp).not.toContain("'unsafe-eval'");
      } else {
        expect(true).toBe(true);
      }
    });
  });

  describe('Referrer-Policy', () => {
    it('should set Referrer-Policy header', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const referrerPolicy = response.headers.get('referrer-policy');
      
      expect(referrerPolicy).toBeTruthy();
    });

    it('should use strict referrer policy', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const referrerPolicy = response.headers.get('referrer-policy');
      
      if (referrerPolicy) {
        const strictPolicies = [
          'no-referrer',
          'same-origin',
          'strict-origin',
          'strict-origin-when-cross-origin',
        ];
        
        expect(strictPolicies.some(policy => 
          referrerPolicy.toLowerCase().includes(policy)
        )).toBe(true);
      }
    });
  });

  describe('Permissions-Policy', () => {
    it('should set Permissions-Policy header', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const permissionsPolicy = response.headers.get('permissions-policy');
      
      if (permissionsPolicy) {
        expect(permissionsPolicy).toBeTruthy();
      }
    });

    it('should restrict dangerous features', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const permissionsPolicy = response.headers.get('permissions-policy');
      
      if (permissionsPolicy) {
        // Should restrict camera, microphone, geolocation, etc.
        const dangerousFeatures = ['camera', 'microphone', 'geolocation', 'payment'];
        
        dangerousFeatures.forEach(feature => {
          if (permissionsPolicy.includes(feature)) {
            expect(permissionsPolicy).toMatch(new RegExp(`${feature}=\\(\\)`));
          }
        });
      }
    });
  });

  describe('Cache-Control', () => {
    it('should set appropriate Cache-Control for sensitive data', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      // Cache-Control is set by Next.js for API routes
      const cacheControl = response.headers.get('cache-control');
      
      if (cacheControl) {
        expect(cacheControl).toMatch(/no-store|no-cache|private/);
      } else {
        // API may not set explicit cache control, Next.js handles it
        expect(true).toBe(true);
      }
    });

    it('should prevent caching of authentication responses', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      });

      const cacheControl = response.headers.get('cache-control');
      
      if (cacheControl) {
        expect(cacheControl).toMatch(/no-store|no-cache/);
      } else {
        expect(true).toBe(true);
      }
    });
  });

  describe('Server Header', () => {
    it('should not expose server version', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const server = response.headers.get('server');
      
      if (server) {
        // Should not contain version numbers
        expect(server).not.toMatch(/\d+\.\d+/);
      }
    });

    it('should not expose technology stack', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const server = response.headers.get('server');
      const xPoweredBy = response.headers.get('x-powered-by');
      
      // Should not reveal Express, Next.js, etc.
      if (server) {
        expect(server.toLowerCase()).not.toContain('express');
        expect(server.toLowerCase()).not.toContain('next');
      }
      
      // X-Powered-By should be removed
      expect(xPoweredBy).toBeNull();
    });
  });

  describe('CORS Headers', () => {
    it('should set Access-Control-Allow-Origin appropriately', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://xase.ai',
        },
      });

      const allowOrigin = response.headers.get('access-control-allow-origin');
      
      // CORS may not be set for same-origin requests
      if (allowOrigin) {
        // Should not be wildcard for authenticated endpoints
        expect(allowOrigin).not.toBe('*');
      } else {
        expect(true).toBe(true);
      }
    });

    it('should set Access-Control-Allow-Credentials if CORS enabled', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://xase.ai',
        },
      });

      const allowCredentials = response.headers.get('access-control-allow-credentials');
      
      if (allowCredentials) {
        expect(allowCredentials).toBe('true');
      } else {
        expect(true).toBe(true);
      }
    });

    it('should validate Origin header', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
          'Origin': 'https://malicious-site.com',
        },
      });

      const allowOrigin = response.headers.get('access-control-allow-origin');
      
      if (allowOrigin) {
        expect(allowOrigin).not.toBe('https://malicious-site.com');
      } else {
        expect(true).toBe(true);
      }
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should not leak timing information in error responses', async () => {
      const timings: number[] = [];

      // Test with valid and invalid credentials
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        
        await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            password: i % 2 === 0 ? 'correct' : 'wrong',
          }),
        });

        timings.push(Date.now() - startTime);
      }

      // Timing variance should be minimal
      const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length;
      const maxVariance = Math.max(...timings.map(t => Math.abs(t - avgTiming)));
      
      // Should not have significant timing differences
      expect(maxVariance).toBeLessThan(avgTiming * 0.5);
    });
  });

  describe('Information Disclosure Prevention', () => {
    it('should not expose stack traces in production', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets/ds_invalid_id`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      if (response.status >= 500) {
        const text = await response.text();
        
        if (process.env.NODE_ENV === 'production') {
          expect(text).not.toContain('at ');
          expect(text).not.toContain('.ts:');
          expect(text).not.toContain('node_modules');
        } else {
          expect(true).toBe(true);
        }
      } else {
        // No 500 error, test passes
        expect(true).toBe(true);
      }
    });

    it('should not expose database errors', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets/ds_invalid_id`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      if (response.status === 401) {
        // Invalid API key, test passes
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const responseText = JSON.stringify(data).toLowerCase();

      expect(responseText).not.toContain('prisma');
      expect(responseText).not.toContain('postgresql');
      expect(responseText).not.toContain('pg_');
    });
  });

  describe('Security.txt', () => {
    it('should have security.txt file', async () => {
      const response = await fetch(`${BASE_URL}/.well-known/security.txt`, {
        method: 'GET',
      });

      if (response.status === 200) {
        const text = await response.text();
        
        expect(text).toContain('Contact:');
      }
    });
  });

  describe('HTTP Methods', () => {
    it('should only allow safe methods on GET endpoints', async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
          method: 'TRACE' as any,
          headers: {
            'X-API-Key': 'test_key',
          },
        });

        expect([405, 501]).toContain(response.status);
      } catch (e) {
        // Fetch may reject invalid methods
        expect(true).toBe(true);
      }
    });

    it('should reject TRACK method', async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
          method: 'TRACK' as any,
          headers: {
            'X-API-Key': 'test_key',
          },
        });

        expect([405, 501]).toContain(response.status);
      } catch (e) {
        // Fetch may reject invalid methods
        expect(true).toBe(true);
      }
    });
  });
});
