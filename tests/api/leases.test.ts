/**
 * API Tests - Leases Routes
 * Critical routes: POST /leases, GET /leases/:id
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

let authToken: string;
let testTenantId: string;
let testDatasetId: string;
let testPolicyId: string;
let testLeaseId: string;

describe('Leases API', () => {
  beforeAll(async () => {
    // Create test user
    const email = `lease-test-${Date.now()}@example.com`;
    
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lease Test User',
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

    // Create test dataset
    const datasetRes = await fetch(`${BASE_URL}/api/datasets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: 'Lease Test Dataset',
        dataType: 'AUDIO',
      }),
    });
    const datasetData = await datasetRes.json();
    testDatasetId = datasetData.dataset.id;

    // Create test policy
    const policyRes = await fetch(`${BASE_URL}/api/policies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        datasetId: testDatasetId,
        allowedRegions: ['US', 'EU'],
        allowedPurposes: ['RESEARCH', 'TRAINING'],
        maxDurationDays: 30,
      }),
    });
    const policyData = await policyRes.json();
    testPolicyId = policyData.policy.id;
  });

  afterAll(async () => {
    if (testTenantId) {
      await prisma.accessLease.deleteMany({
        where: { clientTenantId: testTenantId },
      });
      await prisma.dataset.deleteMany({
        where: { tenantId: testTenantId },
      });
    }
  });

  describe('POST /api/leases', () => {
    it('should create a new lease successfully', async () => {
      const response = await fetch(`${BASE_URL}/api/leases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          datasetId: testDatasetId,
          policyId: testPolicyId,
          purpose: 'RESEARCH',
          durationDays: 7,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('lease');
      expect(data.lease.datasetId).toBe(testDatasetId);
      expect(data.lease.status).toBe('ACTIVE');
      
      testLeaseId = data.lease.id;
    });

    it('should reject lease creation without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: testDatasetId,
          policyId: testPolicyId,
          purpose: 'RESEARCH',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject lease with invalid purpose', async () => {
      const response = await fetch(`${BASE_URL}/api/leases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          datasetId: testDatasetId,
          policyId: testPolicyId,
          purpose: 'INVALID_PURPOSE',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject lease exceeding policy duration', async () => {
      const response = await fetch(`${BASE_URL}/api/leases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          datasetId: testDatasetId,
          policyId: testPolicyId,
          purpose: 'RESEARCH',
          durationDays: 365, // Exceeds policy max of 30
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject lease without required fields', async () => {
      const response = await fetch(`${BASE_URL}/api/leases`, {
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

  describe('GET /api/leases/:id', () => {
    it('should get lease by ID', async () => {
      const response = await fetch(`${BASE_URL}/api/leases/${testLeaseId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('lease');
      expect(data.lease.id).toBe(testLeaseId);
    });

    it('should reject access without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/leases/${testLeaseId}`);
      expect(response.status).toBe(401);
    });

    it('should reject access to non-existent lease', async () => {
      const response = await fetch(`${BASE_URL}/api/leases/non-existent-id`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/leases', () => {
    it('should list leases for authenticated user', async () => {
      const response = await fetch(`${BASE_URL}/api/leases`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('leases');
      expect(Array.isArray(data.leases)).toBe(true);
    });

    it('should support filtering by status', async () => {
      const response = await fetch(`${BASE_URL}/api/leases?status=ACTIVE`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.leases.every((l: any) => l.status === 'ACTIVE')).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await fetch(`${BASE_URL}/api/leases?page=1&limit=10`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('total');
    });
  });

  describe('POST /api/leases/:id/revoke', () => {
    it('should revoke lease successfully', async () => {
      const response = await fetch(`${BASE_URL}/api/leases/${testLeaseId}/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.lease.status).toBe('REVOKED');
    });

    it('should reject revocation without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/leases/${testLeaseId}/revoke`, {
        method: 'POST',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/leases/:id/renew', () => {
    it('should renew lease successfully', async () => {
      // Create a new lease to renew
      const createRes = await fetch(`${BASE_URL}/api/leases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          datasetId: testDatasetId,
          policyId: testPolicyId,
          purpose: 'RESEARCH',
          durationDays: 7,
        }),
      });
      const createData = await createRes.json();
      const leaseToRenew = createData.lease.id;

      const response = await fetch(`${BASE_URL}/api/leases/${leaseToRenew}/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          durationDays: 7,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('lease');
    });

    it('should reject renewal without authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/leases/${testLeaseId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationDays: 7,
        }),
      });

      expect(response.status).toBe(401);
    });
  });
});
