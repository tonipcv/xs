/**
 * API Tests - Datasets Routes
 * Critical routes: GET /datasets, POST /datasets
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

let authToken: string;
let testTenantId: string;
let testDatasetId: string;

describe('Datasets API', () => {
  beforeAll(async () => {
    // Create test user and get auth token
    const email = `dataset-test-${Date.now()}@example.com`;
    
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dataset Test User',
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

    // Get tenant ID
    const user = await prisma.user.findUnique({
      where: { email },
      select: { tenantId: true },
    });
    testTenantId = user?.tenantId || '';
  });

  afterAll(async () => {
    // Cleanup
    if (testTenantId) {
      await prisma.dataset.deleteMany({
        where: { tenantId: testTenantId },
      });
      await prisma.tenant.delete({
        where: { id: testTenantId },
      }).catch(() => {});
    }
  });

  describe('POST /api/datasets', () => {
    it('should create a new dataset successfully', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: 'Test Audio Dataset',
          description: 'Test dataset for API testing',
          dataType: 'AUDIO',
          language: 'en-US',
          totalDurationHours: 10.5,
          numRecordings: 100,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('dataset');
      expect(data.dataset.name).toBe('Test Audio Dataset');
      expect(data.dataset.dataType).toBe('AUDIO');
      
      testDatasetId = data.dataset.id;
    });

    it('should reject dataset creation without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unauthorized Dataset',
          dataType: 'AUDIO',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject dataset creation with invalid data type', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: 'Invalid Dataset',
          dataType: 'INVALID_TYPE',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject dataset creation without required fields', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          description: 'Missing name and type',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/datasets', () => {
    it('should list datasets for authenticated user', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('datasets');
      expect(Array.isArray(data.datasets)).toBe(true);
      expect(data.datasets.length).toBeGreaterThan(0);
    });

    it('should reject listing without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets`);
      expect(response.status).toBe(401);
    });

    it('should support pagination', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets?page=1&limit=10`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('datasets');
      expect(data).toHaveProperty('total');
    });

    it('should support filtering by data type', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets?dataType=AUDIO`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.datasets.every((d: any) => d.dataType === 'AUDIO')).toBe(true);
    });
  });

  describe('GET /api/datasets/:id', () => {
    it('should get dataset by ID', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets/${testDatasetId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('dataset');
      expect(data.dataset.id).toBe(testDatasetId);
    });

    it('should reject access to non-existent dataset', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets/non-existent-id`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
    });

    it('should reject access without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets/${testDatasetId}`);
      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/datasets/:id', () => {
    it('should update dataset successfully', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets/${testDatasetId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          description: 'Updated description',
          status: 'PUBLISHED',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.dataset.description).toBe('Updated description');
    });

    it('should reject update without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets/${testDatasetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Unauthorized update',
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/datasets/:id', () => {
    it('should delete dataset successfully', async () => {
      // Create a dataset to delete
      const createRes = await fetch(`${BASE_URL}/api/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: 'Dataset to Delete',
          dataType: 'AUDIO',
        }),
      });

      const createData = await createRes.json();
      const datasetToDelete = createData.dataset.id;

      const response = await fetch(`${BASE_URL}/api/datasets/${datasetToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
    });

    it('should reject deletion without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets/${testDatasetId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });
  });
});
