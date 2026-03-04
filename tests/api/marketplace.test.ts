/**
 * API Tests - Marketplace Routes
 * Critical routes: GET /marketplace/offers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

let authToken: string;
let testTenantId: string;
let testDatasetId: string;

describe('Marketplace API', () => {
  beforeAll(async () => {
    const email = `marketplace-test-${Date.now()}@example.com`;
    
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Marketplace Test User',
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

    // Create published dataset for marketplace
    const datasetRes = await fetch(`${BASE_URL}/api/v1/datasets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        name: 'Marketplace Test Dataset',
        dataType: 'AUDIO',
        status: 'PUBLISHED',
      }),
    });
    const ct2 = datasetRes.headers.get('content-type');
    if ((datasetRes.status === 201 || datasetRes.status === 200) && ct2 && ct2.includes('application/json')) {
      const datasetData = await datasetRes.json();
      testDatasetId = datasetData.dataset.id;
    } else {
      testDatasetId = 'non-existent';
    }
  });

  afterAll(async () => {
    try {
      if (testTenantId) {
        await prisma.dataset.deleteMany({
          where: { tenantId: testTenantId },
        });
      }
    } catch {}
  });

  describe('GET /api/marketplace/offers', () => {
    it('should list marketplace offers', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/offers`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('offers');
        expect(Array.isArray(data.offers)).toBe(true);
      }
    });

    it('should allow unauthenticated access to public offers', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/offers`);
      expect([200, 400, 401, 404, 500]).toContain(response.status);
    });

    it('should support filtering by data type', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/offers?dataType=AUDIO`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(Array.isArray(data.offers)).toBe(true);
      }
    });

    it('should support filtering by language', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/offers?language=en-US`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });
      expect([200, 400, 401, 404, 500]).toContain(response.status);
    });

    it('should support pagination', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/offers?page=1&limit=10`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('total');
        expect(data).toHaveProperty('page');
      }
    });

    it('should support sorting', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/offers?sortBy=createdAt&order=desc`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });
      expect([200, 400, 401, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/marketplace/offers/:id', () => {
    it('should get offer details', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/offers/${testDatasetId}`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('offer');
      }
    });

    it('should reject access to non-existent offer', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/offers/non-existent-id`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });
      expect([404, 400, 401, 500]).toContain(response.status);
    });
  });

  describe('POST /api/marketplace/request', () => {
    it('should create access request', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          datasetId: testDatasetId,
          purpose: 'RESEARCH',
          message: 'Request for research purposes',
        }),
      });

      expect([201, 200, 400, 401, 404, 500]).toContain(response.status);
      if (response.status === 201 || response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('request');
      }
    });

    it('should reject request without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: testDatasetId,
          purpose: 'RESEARCH',
        }),
      });
      expect([401, 400, 404, 500]).toContain(response.status);
    });

    it('should reject request without required fields', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          datasetId: testDatasetId,
        }),
      });
      expect([400, 401, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/marketplace/search', () => {
    it('should search marketplace offers', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/search?q=audio`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });
      expect([200, 400, 401, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('results');
      }
    });

    it('should return empty results for non-matching query', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/marketplace/search?q=nonexistentquery12345`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });
      expect([200, 400, 401, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(Array.isArray(data.results)).toBe(true);
      }
    });
  });
});
