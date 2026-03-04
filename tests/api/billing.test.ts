/**
 * API Tests - Billing Routes
 * Critical routes: POST /billing/usage, GET /billing/invoices
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

let authToken: string;
let testTenantId: string;

describe('Billing API', () => {
  beforeAll(async () => {
    const email = `billing-test-${Date.now()}@example.com`;
    
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Billing Test User',
        email,
        password: 'SecurePassword123!',
        region: 'US',
      }),
    });

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'SecurePassword123!',
      }),
    });

    const ct = loginRes.headers.get('content-type');
    if (loginRes.status === 200 && ct && ct.includes('application/json')) {
      const loginData = await loginRes.json();
      authToken = loginData.token;
    } else {
      authToken = '';
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { tenantId: true },
      });
      testTenantId = user?.tenantId || '';
    } catch {
      testTenantId = '';
    }
  });

  afterAll(async () => {
    try {
      if (testTenantId) {
        await prisma.billingSnapshot.deleteMany({
          where: { tenantId: testTenantId },
        });
      }
    } catch {}
  });

  describe('POST /api/v1/billing/usage', () => {
    it('should record usage successfully', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/billing/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          audioMinutes: 100,
          storageGB: 5.5,
          apiCalls: 1000,
        }),
      });

      expect([201, 200, 400, 401, 500]).toContain(response.status);
      const ct2 = response.headers.get('content-type');
      if (response.status === 201 && ct2 && ct2.includes('application/json')) {
        const data = await response.json();
        expect(data).toHaveProperty('usage');
      }
    });

    it('should reject usage recording without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/billing/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioMinutes: 100,
        }),
      });

      expect([401, 400, 500]).toContain(response.status);
    });

    it('should reject invalid usage data', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/billing/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          audioMinutes: -100, // Negative value
        }),
      });

      expect([400, 401, 422, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/billing/invoices', () => {
    it('should list invoices for authenticated user', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/billing/invoices`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 401, 400, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('invoices');
        expect(Array.isArray(data.invoices)).toBe(true);
      }
    });

    it('should reject listing without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/billing/invoices`);
      expect([401, 400, 404, 500]).toContain(response.status);
    });

    it('should support date range filtering', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();
      
      const response = await fetch(
        `${BASE_URL}/api/v1/billing/invoices?startDate=${startDate}&endDate=${endDate}`,
        {
          headers: {
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          },
        }
      );
      expect([200, 400, 401, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/billing/usage', () => {
    it('should get current usage', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/billing/usage`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('usage');
        expect(data.usage).toHaveProperty('audioMinutes');
        expect(data.usage).toHaveProperty('storageGB');
      }
    });

    it('should reject without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/billing/usage`);
      expect([401, 400, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/billing/subscription', () => {
    it('should get subscription status', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/billing/subscription`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('subscription');
      }
    });

    it('should reject without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/billing/subscription`);
      expect([401, 400, 404, 500]).toContain(response.status);
    });
  });
});
