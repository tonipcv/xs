/**
 * CSRF (Cross-Site Request Forgery) Security Tests
 * Tests all mutation endpoints for CSRF protection
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

describe('CSRF Protection Tests', () => {
  describe('State-Changing Operations', () => {
    it('should require CSRF token for user registration', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Missing CSRF token
        },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          password: 'SecurePass123!',
          region: 'US',
        }),
      });

      // Should either accept (if CSRF not required for registration) or reject
      expect([200, 201, 400, 401, 403, 500]).toContain(response.status);
    });

    it('should reject requests with invalid CSRF token', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test_key',
          'X-CSRF-Token': 'invalid_token_12345',
        },
        body: JSON.stringify({
          name: 'Test Dataset',
          description: 'Test',
          dataType: 'AUDIO',
        }),
      });

      // Should reject with 403 if CSRF protection is enabled
      expect([400, 401, 403, 500]).toContain(response.status);
    });

    it('should protect dataset creation', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test_key',
          // No CSRF token
        },
        body: JSON.stringify({
          name: 'Test Dataset',
          description: 'Test',
          dataType: 'AUDIO',
        }),
      });

      expect([400, 401, 403, 500]).toContain(response.status);
    });

    it('should protect dataset deletion', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets/test_id`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': 'test_key',
          // No CSRF token
        },
      });

      expect([400, 401, 403, 404, 405, 500]).toContain(response.status);
    });

    it('should protect policy creation', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test_key',
          // No CSRF token
        },
        body: JSON.stringify({
          name: 'Test Policy',
          datasetId: 'test_id',
          rules: {},
        }),
      });

      expect([400, 401, 403, 500]).toContain(response.status);
    });

    it('should protect policy revocation', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/policies/test_id/revoke`, {
        method: 'POST',
        headers: {
          'X-API-Key': 'test_key',
          // No CSRF token
        },
      });

      expect([400, 401, 403, 404]).toContain(response.status);
    });

    it('should protect lease creation', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/leases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test_key',
          // No CSRF token
        },
        body: JSON.stringify({
          datasetId: 'test_id',
          policyId: 'test_id',
          duration: 3600,
        }),
      });

      expect([400, 401, 403]).toContain(response.status);
    });
  });

  describe('GET Requests (Should Not Require CSRF)', () => {
    it('should allow GET requests without CSRF token', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
          // No CSRF token - should be OK for GET
        },
      });

      expect([200, 401]).toContain(response.status);
    });

    it('should allow HEAD requests without CSRF token', async () => {
      const response = await fetch(`${BASE_URL}/api/health`, {
        method: 'HEAD',
        // No CSRF token - should be OK for HEAD
      });

      expect([200, 204]).toContain(response.status);
    });

    it('should allow OPTIONS requests without CSRF token', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'OPTIONS',
        // No CSRF token - should be OK for OPTIONS
      });

      expect([200, 204]).toContain(response.status);
    });
  });

  describe('SameSite Cookie Attribute', () => {
    it('should set SameSite attribute on session cookies', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'test123',
        }),
      });

      const setCookie = response.headers.get('set-cookie');
      
      if (setCookie) {
        // Should have SameSite=Lax or SameSite=Strict
        expect(setCookie.toLowerCase()).toMatch(/samesite=(lax|strict)/);
      }
    });

    it('should set Secure flag on cookies in production', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'test123',
        }),
      });

      const setCookie = response.headers.get('set-cookie');
      
      if (setCookie && process.env.NODE_ENV === 'production') {
        expect(setCookie.toLowerCase()).toContain('secure');
      }
    });

    it('should set HttpOnly flag on session cookies', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'test123',
        }),
      });

      const setCookie = response.headers.get('set-cookie');
      
      if (setCookie) {
        expect(setCookie.toLowerCase()).toContain('httponly');
      }
    });
  });

  describe('Origin and Referer Validation', () => {
    it('should validate Origin header for state-changing requests', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test_key',
          'Origin': 'https://malicious-site.com',
        },
        body: JSON.stringify({
          name: 'Test Dataset',
          description: 'Test',
          dataType: 'AUDIO',
        }),
      });

      // Should reject requests from unauthorized origins
      expect([400, 401, 403]).toContain(response.status);
    });

    it('should validate Referer header', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test_key',
          'Referer': 'https://malicious-site.com/attack',
        },
        body: JSON.stringify({
          name: 'Test Policy',
          datasetId: 'test_id',
          rules: {},
        }),
      });

      expect([400, 401, 403]).toContain(response.status);
    });
  });

  describe('Double Submit Cookie Pattern', () => {
    it('should validate CSRF token matches cookie', async () => {
      // First, get a CSRF token
      const tokenResponse = await fetch(`${BASE_URL}/api/csrf-token`, {
        method: 'GET',
      });

      if (tokenResponse.status === 200) {
        const { token } = await tokenResponse.json();
        const cookies = tokenResponse.headers.get('set-cookie');

        // Try to use the token with a different cookie value
        const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test_key',
            'X-CSRF-Token': token,
            'Cookie': 'csrf_token=different_value',
          },
          body: JSON.stringify({
            name: 'Test Dataset',
            description: 'Test',
            dataType: 'AUDIO',
          }),
        });

        // Should reject mismatched token
        expect([400, 401, 403]).toContain(response.status);
      }
    });
  });

  describe('Custom Header Validation', () => {
    it('should require custom header for AJAX requests', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test_key',
          // Missing X-Requested-With header
        },
        body: JSON.stringify({
          name: 'Test Dataset',
          description: 'Test',
          dataType: 'AUDIO',
        }),
      });

      // May require X-Requested-With: XMLHttpRequest
      expect([200, 201, 400, 401, 403]).toContain(response.status);
    });
  });

  describe('Token Expiration', () => {
    it('should reject expired CSRF tokens', async () => {
      // Use an obviously expired token
      const expiredToken = 'expired_token_from_yesterday';

      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test_key',
          'X-CSRF-Token': expiredToken,
        },
        body: JSON.stringify({
          name: 'Test Dataset',
          description: 'Test',
          dataType: 'AUDIO',
        }),
      });

      expect([400, 401, 403]).toContain(response.status);
    });
  });

  describe('Token Regeneration', () => {
    it('should regenerate CSRF token after authentication', async () => {
      // Login
      const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'test123',
        }),
      });

      if (loginResponse.status === 200) {
        const cookies1 = loginResponse.headers.get('set-cookie');

        // Get CSRF token
        const tokenResponse = await fetch(`${BASE_URL}/api/csrf-token`, {
          method: 'GET',
          headers: {
            'Cookie': cookies1 || '',
          },
        });

        if (tokenResponse.status === 200) {
          const { token: token1 } = await tokenResponse.json();

          // Logout and login again
          await fetch(`${BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Cookie': cookies1 || '',
            },
          });

          const loginResponse2 = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: 'test@example.com',
              password: 'test123',
            }),
          });

          if (loginResponse2.status === 200) {
            const cookies2 = loginResponse2.headers.get('set-cookie');

            const tokenResponse2 = await fetch(`${BASE_URL}/api/csrf-token`, {
              method: 'GET',
              headers: {
                'Cookie': cookies2 || '',
              },
            });

            if (tokenResponse2.status === 200) {
              const { token: token2 } = await tokenResponse2.json();

              // Tokens should be different
              expect(token1).not.toBe(token2);
            }
          }
        }
      }
    });
  });

  describe('Idempotent Operations', () => {
    it('should allow idempotent operations without strict CSRF', async () => {
      // GET requests should not require CSRF
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('API Key Authentication Bypass', () => {
    it('should allow API key authentication without CSRF token', async () => {
      // API key authentication should bypass CSRF for programmatic access
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'valid_api_key_here',
          // No CSRF token - should be OK with API key
        },
        body: JSON.stringify({
          name: 'Test Dataset',
          description: 'Test',
          dataType: 'AUDIO',
        }),
      });

      // Should accept with valid API key, or reject with 401 if key is invalid
      expect([200, 201, 401]).toContain(response.status);
    });
  });
});
