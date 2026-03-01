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

    const loginData = await loginRes.json();
    authToken = loginData.token;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { tenantId: true },
    });
    testTenantId = user?.tenantId || '';
  });

  afterAll(async () => {
    if (testTenantId) {
      await prisma.billingSnapshot.deleteMany({
        where: { tenantId: testTenantId },
      });
    }
  });

  describe('POST /api/billing/usage', () => {
    it('should record usage successfully', async () => {
      const response = await fetch(`${BASE_URL}/api/billing/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          audioMinutes: 100,
          storageGB: 5.5,
          apiCalls: 1000,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('usage');
    });

    it('should reject usage recording without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/billing/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioMinutes: 100,
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject invalid usage data', async () => {
      const response = await fetch(`${BASE_URL}/api/billing/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          audioMinutes: -100, // Negative value
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/billing/invoices', () => {
    it('should list invoices for authenticated user', async () => {
      const response = await fetch(`${BASE_URL}/api/billing/invoices`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('invoices');
      expect(Array.isArray(data.invoices)).toBe(true);
    });

    it('should reject listing without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/billing/invoices`);
      expect(response.status).toBe(401);
    });

    it('should support date range filtering', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();
      
      const response = await fetch(
        `${BASE_URL}/api/billing/invoices?startDate=${startDate}&endDate=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/billing/usage', () => {
    it('should get current usage', async () => {
      const response = await fetch(`${BASE_URL}/api/billing/usage`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('usage');
      expect(data.usage).toHaveProperty('audioMinutes');
      expect(data.usage).toHaveProperty('storageGB');
    });

    it('should reject without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/billing/usage`);
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/billing/subscription', () => {
    it('should get subscription status', async () => {
      const response = await fetch(`${BASE_URL}/api/billing/subscription`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('subscription');
    });

    it('should reject without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/billing/subscription`);
      expect(response.status).toBe(401);
    });
  });
});
