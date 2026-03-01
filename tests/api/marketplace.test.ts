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

    const loginData = await loginRes.json();
    authToken = loginData.token;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { tenantId: true },
    });
    testTenantId = user?.tenantId || '';

    // Create published dataset for marketplace
    const datasetRes = await fetch(`${BASE_URL}/api/datasets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: 'Marketplace Test Dataset',
        dataType: 'AUDIO',
        status: 'PUBLISHED',
      }),
    });
    const datasetData = await datasetRes.json();
    testDatasetId = datasetData.dataset.id;
  });

  afterAll(async () => {
    if (testTenantId) {
      await prisma.dataset.deleteMany({
        where: { tenantId: testTenantId },
      });
    }
  });

  describe('GET /api/marketplace/offers', () => {
    it('should list marketplace offers', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/offers`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('offers');
      expect(Array.isArray(data.offers)).toBe(true);
    });

    it('should allow unauthenticated access to public offers', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/offers`);
      expect(response.status).toBe(200);
    });

    it('should support filtering by data type', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/offers?dataType=AUDIO`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.offers.every((o: any) => o.dataType === 'AUDIO')).toBe(true);
    });

    it('should support filtering by language', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/offers?language=en-US`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
    });

    it('should support pagination', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/offers?page=1&limit=10`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
    });

    it('should support sorting', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/offers?sortBy=createdAt&order=desc`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/marketplace/offers/:id', () => {
    it('should get offer details', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/offers/${testDatasetId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('offer');
    });

    it('should reject access to non-existent offer', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/offers/non-existent-id`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/marketplace/request', () => {
    it('should create access request', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          datasetId: testDatasetId,
          purpose: 'RESEARCH',
          message: 'Request for research purposes',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('request');
    });

    it('should reject request without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: testDatasetId,
          purpose: 'RESEARCH',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject request without required fields', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          datasetId: testDatasetId,
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/marketplace/search', () => {
    it('should search marketplace offers', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/search?q=audio`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('results');
    });

    it('should return empty results for non-matching query', async () => {
      const response = await fetch(`${BASE_URL}/api/marketplace/search?q=nonexistentquery12345`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.results).toHaveLength(0);
    });
  });
});
