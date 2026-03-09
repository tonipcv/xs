/**
 * API Tests - Policies Routes
 * Critical route: POST /policies
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('POST /api/policies', () => {
  let authToken: string;
  let datasetId: string;
  let policyId: string;

  beforeAll(async () => {
    // Create test user and login
    const email = `policy-test-${Date.now()}@example.com`;
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Policy Test User',
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

    // Create test dataset
    const datasetRes = await fetch(`${BASE_URL}/api/datasets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: 'Test Dataset for Policies',
        dataType: 'AUDIO',
        description: 'Test dataset',
      }),
    });

    const datasetData = await datasetRes.json();
    datasetId = datasetData.dataset?.id || datasetData.id;
  });

  afterAll(async () => {
    // Cleanup
    if (policyId) {
      await prisma.auditLog.deleteMany({
        where: { resourceId: policyId },
      });
    }
    if (datasetId) {
      await prisma.dataset.deleteMany({
        where: { id: datasetId },
      });
    }
  });

  it('should create a new policy successfully', async () => {
    const response = await fetch(`${BASE_URL}/api/policies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        datasetId,
        name: 'Test Access Policy',
        type: 'LEASE',
        conditions: {
          maxDuration: 3600,
          allowedPurposes: ['RESEARCH'],
          geoRestrictions: ['US', 'EU'],
        },
        pricing: {
          model: 'USAGE_BASED',
          basePrice: 10.0,
          currency: 'USD',
        },
      }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.policy).toHaveProperty('id');
    expect(data.policy.name).toBe('Test Access Policy');
    policyId = data.policy.id;
  });

  it('should reject policy creation without authentication', async () => {
    const response = await fetch(`${BASE_URL}/api/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datasetId,
        name: 'Unauthorized Policy',
        type: 'LEASE',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('should reject policy with invalid dataset ID', async () => {
    const response = await fetch(`${BASE_URL}/api/policies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        datasetId: 'invalid-dataset-id',
        name: 'Invalid Dataset Policy',
        type: 'LEASE',
      }),
    });

    expect(response.status).toBe(404);
  });

  it('should reject policy without required fields', async () => {
    const response = await fetch(`${BASE_URL}/api/policies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        datasetId,
      }),
    });

    expect(response.status).toBe(400);
  });

  it('should list policies for dataset', async () => {
    const response = await fetch(
      `${BASE_URL}/api/policies?datasetId=${datasetId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('should get policy by ID', async () => {
    if (!policyId) return;

    const response = await fetch(`${BASE_URL}/api/policies/${policyId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(policyId);
  });

  it('should update policy', async () => {
    if (!policyId) return;

    const response = await fetch(`${BASE_URL}/api/policies/${policyId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: 'Updated Policy Name',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('Updated Policy Name');
  });

  it('should revoke policy', async () => {
    if (!policyId) return;

    const response = await fetch(`${BASE_URL}/api/policies/${policyId}/revoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('REVOKED');
  });
});
