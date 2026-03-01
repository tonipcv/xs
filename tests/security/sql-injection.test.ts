/**
 * SQL Injection Security Tests
 * Tests all endpoints with parameters for SQL injection vulnerabilities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

describe('SQL Injection Security Tests', () => {
  const sqlInjectionPayloads = [
    "' OR '1'='1",
    "' OR '1'='1' --",
    "' OR '1'='1' /*",
    "admin'--",
    "' UNION SELECT NULL--",
    "1' AND '1'='1",
    "1' AND '1'='2",
    "' OR 1=1--",
    "; DROP TABLE users--",
    "' OR 'x'='x",
    "1'; DROP TABLE users; --",
    "' UNION SELECT * FROM users--",
    "admin' OR '1'='1' /*",
    "' OR EXISTS(SELECT * FROM users WHERE '1'='1",
  ];

  describe('Authentication Endpoints', () => {
    it('should prevent SQLi in login email field', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: payload,
            password: 'test123',
          }),
        });

        // Should return 400 or 401, not 500 (which would indicate SQL error)
        expect([400, 401]).toContain(response.status);
        
        const data = await response.json();
        // Should not contain SQL error messages
        expect(JSON.stringify(data).toLowerCase()).not.toContain('sql');
        expect(JSON.stringify(data).toLowerCase()).not.toContain('syntax');
        expect(JSON.stringify(data).toLowerCase()).not.toContain('postgresql');
      }
    });

    it('should prevent SQLi in registration email field', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${BASE_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Test User',
            email: payload,
            password: 'SecurePass123!',
            region: 'US',
          }),
        });

        expect([400, 401]).toContain(response.status);
      }
    });

    it('should prevent SQLi in password reset email', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: payload,
          }),
        });

        // Should return 200 (to prevent email enumeration) or 400, not 500
        expect([200, 400]).toContain(response.status);
      }
    });
  });

  describe('Dataset Endpoints', () => {
    it('should prevent SQLi in dataset ID parameter', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${BASE_URL}/api/datasets/${encodeURIComponent(payload)}`, {
          method: 'GET',
          headers: {
            'X-API-Key': 'test_key',
          },
        });

        expect([400, 401, 404]).toContain(response.status);
      }
    });

    it('should prevent SQLi in dataset search query', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(
          `${BASE_URL}/api/datasets?search=${encodeURIComponent(payload)}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          }
        );

        expect([200, 400, 401]).toContain(response.status);
      }
    });

    it('should prevent SQLi in dataset filter parameters', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(
          `${BASE_URL}/api/datasets?dataType=${encodeURIComponent(payload)}&region=${encodeURIComponent(payload)}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          }
        );

        expect([200, 400, 401]).toContain(response.status);
      }
    });
  });

  describe('Policy Endpoints', () => {
    it('should prevent SQLi in policy ID parameter', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${BASE_URL}/api/policies/${encodeURIComponent(payload)}`, {
          method: 'GET',
          headers: {
            'X-API-Key': 'test_key',
          },
        });

        expect([400, 401, 404]).toContain(response.status);
      }
    });

    it('should prevent SQLi in policy creation', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${BASE_URL}/api/policies`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test_key',
          },
          body: JSON.stringify({
            name: payload,
            datasetId: payload,
            rules: {},
          }),
        });

        expect([400, 401]).toContain(response.status);
      }
    });
  });

  describe('Lease Endpoints', () => {
    it('should prevent SQLi in lease ID parameter', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${BASE_URL}/api/leases/${encodeURIComponent(payload)}`, {
          method: 'GET',
          headers: {
            'X-API-Key': 'test_key',
          },
        });

        expect([400, 401, 404]).toContain(response.status);
      }
    });

    it('should prevent SQLi in lease creation', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${BASE_URL}/api/leases`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test_key',
          },
          body: JSON.stringify({
            datasetId: payload,
            policyId: payload,
            duration: 3600,
          }),
        });

        expect([400, 401]).toContain(response.status);
      }
    });
  });

  describe('Marketplace Endpoints', () => {
    it('should prevent SQLi in offer ID parameter', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(
          `${BASE_URL}/api/marketplace/offers/${encodeURIComponent(payload)}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          }
        );

        expect([400, 401, 404]).toContain(response.status);
      }
    });

    it('should prevent SQLi in marketplace search', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(
          `${BASE_URL}/api/marketplace/offers?search=${encodeURIComponent(payload)}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          }
        );

        expect([200, 400, 401]).toContain(response.status);
      }
    });
  });

  describe('Billing Endpoints', () => {
    it('should prevent SQLi in billing usage query', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(
          `${BASE_URL}/api/billing/usage?startDate=${encodeURIComponent(payload)}&endDate=${encodeURIComponent(payload)}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          }
        );

        expect([200, 400, 401]).toContain(response.status);
      }
    });
  });

  describe('User Endpoints', () => {
    it('should prevent SQLi in user ID parameter', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${BASE_URL}/api/users/${encodeURIComponent(payload)}`, {
          method: 'GET',
          headers: {
            'X-API-Key': 'test_key',
          },
        });

        expect([400, 401, 404]).toContain(response.status);
      }
    });
  });

  describe('Advanced SQLi Techniques', () => {
    it('should prevent time-based blind SQLi', async () => {
      const timeBasedPayloads = [
        "' OR SLEEP(5)--",
        "'; WAITFOR DELAY '00:00:05'--",
        "' OR pg_sleep(5)--",
      ];

      for (const payload of timeBasedPayloads) {
        const startTime = Date.now();
        
        const response = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: payload,
            password: 'test',
          }),
        });

        const duration = Date.now() - startTime;
        
        // Should not delay for 5 seconds
        expect(duration).toBeLessThan(2000);
        expect([400, 401]).toContain(response.status);
      }
    });

    it('should prevent boolean-based blind SQLi', async () => {
      const booleanPayloads = [
        "admin' AND '1'='1",
        "admin' AND '1'='2",
      ];

      const responses: number[] = [];

      for (const payload of booleanPayloads) {
        const response = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: payload,
            password: 'test',
          }),
        });

        responses.push(response.status);
      }

      // Both should return the same status (no information leakage)
      expect(responses[0]).toBe(responses[1]);
    });

    it('should prevent UNION-based SQLi', async () => {
      const unionPayloads = [
        "' UNION SELECT NULL, NULL, NULL--",
        "' UNION SELECT username, password FROM users--",
        "' UNION ALL SELECT NULL--",
      ];

      for (const payload of unionPayloads) {
        const response = await fetch(`${BASE_URL}/api/datasets?search=${encodeURIComponent(payload)}`, {
          method: 'GET',
          headers: {
            'X-API-Key': 'test_key',
          },
        });

        expect([200, 400, 401]).toContain(response.status);
        
        const data = await response.json();
        // Should not return unexpected columns or data
        if (response.status === 200) {
          expect(data).toHaveProperty('datasets');
          expect(Array.isArray(data.datasets)).toBe(true);
        }
      }
    });
  });

  describe('Error Message Sanitization', () => {
    it('should not leak database structure in error messages', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets/invalid-id-format`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      const data = await response.json();
      const responseText = JSON.stringify(data).toLowerCase();

      // Should not contain sensitive database information
      expect(responseText).not.toContain('table');
      expect(responseText).not.toContain('column');
      expect(responseText).not.toContain('prisma');
      expect(responseText).not.toContain('postgresql');
      expect(responseText).not.toContain('pg_');
      expect(responseText).not.toContain('schema');
    });

    it('should not leak stack traces in production', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets/trigger-error`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      const data = await response.json();
      const responseText = JSON.stringify(data);

      // Should not contain stack traces
      expect(responseText).not.toContain('at ');
      expect(responseText).not.toContain('.ts:');
      expect(responseText).not.toContain('node_modules');
    });
  });
});
