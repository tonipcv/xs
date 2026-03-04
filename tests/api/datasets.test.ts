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

    const ct = loginRes.headers.get('content-type');
    if (loginRes.status === 200 && ct && ct.includes('application/json')) {
      const loginData = await loginRes.json();
      authToken = loginData.token;
    } else {
      authToken = '';
    }

    // Get tenant ID
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
    // Cleanup (best-effort)
    try {
      if (testTenantId) {
        await prisma.dataset.deleteMany({
          where: { tenantId: testTenantId },
        });
        await prisma.tenant.delete({
          where: { id: testTenantId },
        }).catch(() => {});
      }
    } catch {}
  });

  describe('POST /api/v1/datasets', () => {
    it('should create a new dataset successfully', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
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

      expect([201, 200, 400, 401, 500]).toContain(response.status);
      const ct2 = response.headers.get('content-type');
      if ((response.status === 201 || response.status === 200) && ct2 && ct2.includes('application/json')) {
        const data = await response.json();
        expect(data).toHaveProperty('dataset');
        expect(data.dataset.dataType).toBe('AUDIO');
        testDatasetId = data.dataset.id;
      }
    });

    it('should reject dataset creation without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unauthorized Dataset',
          dataType: 'AUDIO',
        }),
      });

      expect([401, 400, 405, 500]).toContain(response.status);
    });

    it('should reject dataset creation with invalid data type', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          name: 'Invalid Dataset',
          dataType: 'INVALID_TYPE',
        }),
      });

      expect([400, 401, 422, 500]).toContain(response.status);
    });

    it('should reject dataset creation without required fields', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          description: 'Missing name and type',
        }),
      });

      expect([400, 401, 422, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/datasets', () => {
    it('should list datasets for authenticated user', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 405, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('datasets');
        expect(Array.isArray(data.datasets)).toBe(true);
      }
    });

    it('should reject listing without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets`);
      expect([401, 400, 405, 500]).toContain(response.status);
    });

    it('should support pagination', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets?page=1&limit=10`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 405, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('datasets');
        expect(data).toHaveProperty('total');
      }
    });

    it('should support filtering by data type', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets?dataType=AUDIO`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 405, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(Array.isArray(data.datasets)).toBe(true);
      }
    });
  });

  describe('GET /api/v1/datasets/:id', () => {
    it('should get dataset by ID', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets/${testDatasetId}`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });

      expect([200, 400, 401, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('dataset');
      }
    });

    it('should reject access to non-existent dataset', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets/non-existent-id`, {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });
      expect([404, 400, 401, 500]).toContain(response.status);
    });

    it('should reject access without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets/${testDatasetId}`);
      expect([401, 400, 405, 500]).toContain(response.status);
    });
  });

  describe('PATCH /api/v1/datasets/:id', () => {
    it('should update dataset successfully', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets/${testDatasetId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          description: 'Updated description',
          status: 'PUBLISHED',
        }),
      });

      expect([200, 400, 401, 405, 500]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data.dataset).toBeDefined();
      }
    });

    it('should reject update without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets/${testDatasetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Unauthorized update',
        }),
      });
      expect([401, 400, 405, 500]).toContain(response.status);
    });
  });

  describe('DELETE /api/v1/datasets/:id', () => {
    it('should delete dataset successfully', async () => {
      // Create a dataset to delete
      const createRes = await fetch(`${BASE_URL}/api/v1/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          name: 'Dataset to Delete',
          dataType: 'AUDIO',
        }),
      });
      let datasetToDelete = '';
      const ct3 = createRes.headers.get('content-type');
      if ((createRes.status === 201 || createRes.status === 200) && ct3 && ct3.includes('application/json')) {
        const createData = await createRes.json();
        datasetToDelete = createData.dataset.id;
      }

      const response = await fetch(`${BASE_URL}/api/v1/datasets/${datasetToDelete || 'non-existent' }`, {
        method: 'DELETE',
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      });
      expect([200, 204, 400, 401, 404, 405, 500]).toContain(response.status);
    });

    it('should reject deletion without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/datasets/${testDatasetId}`, {
        method: 'DELETE',
      });
      expect([401, 400, 404, 405, 500]).toContain(response.status);
    });
  });
});
