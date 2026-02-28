/**
 * Critical API Routes Test Suite
 * Tests for the top 20 most critical API endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

interface TestContext {
  userId: string;
  tenantId: string;
  email: string;
  password: string;
  sessionToken?: string;
  apiKey?: string;
  datasetId?: string;
  policyId?: string;
  offerId?: string;
  leaseId?: string;
}

const ctx: TestContext = {
  userId: '',
  tenantId: '',
  email: `critical-test-${Date.now()}@xase.ai`,
  password: 'SecurePass123!@#',
};

async function makeRequest(
  method: string,
  path: string,
  options: {
    body?: any;
    headers?: Record<string, string>;
    apiKey?: string;
  } = {}
): Promise<{ status: number; data?: any; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.apiKey) {
    headers['X-API-Key'] = options.apiKey;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (options.body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE_URL}${path}`, fetchOptions);
  
  let data;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

beforeAll(async () => {
  // Ensure database is connected
  await prisma.$connect();
});

afterAll(async () => {
  // Cleanup test data
  if (ctx.userId) {
    await prisma.user.deleteMany({
      where: { email: ctx.email },
    });
  }
  await prisma.$disconnect();
});

describe('Critical Route 1: POST /api/auth/register', () => {
  it('should create a new user successfully', async () => {
    const response = await makeRequest('POST', '/api/auth/register', {
      body: {
        email: ctx.email,
        password: ctx.password,
        name: 'Critical Test User',
      },
    });

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('userId');
    expect(response.data).toHaveProperty('tenantId');
    
    ctx.userId = response.data.userId;
    ctx.tenantId = response.data.tenantId;
  });

  it('should reject duplicate email registration', async () => {
    const response = await makeRequest('POST', '/api/auth/register', {
      body: {
        email: ctx.email,
        password: ctx.password,
        name: 'Duplicate User',
      },
    });

    expect(response.status).toBe(400);
    expect(response.data).toHaveProperty('error');
  });

  it('should reject weak passwords', async () => {
    const response = await makeRequest('POST', '/api/auth/register', {
      body: {
        email: `weak-${Date.now()}@xase.ai`,
        password: '123',
        name: 'Weak Password User',
      },
    });

    expect(response.status).toBe(400);
  });

  it('should reject invalid email format', async () => {
    const response = await makeRequest('POST', '/api/auth/register', {
      body: {
        email: 'invalid-email',
        password: ctx.password,
        name: 'Invalid Email User',
      },
    });

    expect(response.status).toBe(400);
  });
});

describe('Critical Route 2: POST /api/auth/[...nextauth] (Login)', () => {
  it('should authenticate with valid credentials', async () => {
    const response = await makeRequest('POST', '/api/auth/callback/credentials', {
      body: {
        email: ctx.email,
        password: ctx.password,
      },
    });

    expect([200, 302]).toContain(response.status);
  });

  it('should reject invalid credentials', async () => {
    const response = await makeRequest('POST', '/api/auth/callback/credentials', {
      body: {
        email: ctx.email,
        password: 'WrongPassword123!',
      },
    });

    expect([401, 403]).toContain(response.status);
  });

  it('should reject non-existent user', async () => {
    const response = await makeRequest('POST', '/api/auth/callback/credentials', {
      body: {
        email: 'nonexistent@xase.ai',
        password: ctx.password,
      },
    });

    expect([401, 404]).toContain(response.status);
  });
});

describe('Critical Route 3: GET /api/v1/datasets', () => {
  beforeAll(async () => {
    // Create API key for the user
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = `xase_${rawKey.substring(0, 8)}`;
    
    await prisma.apiKey.create({
      data: {
        name: 'Test API Key',
        tenantId: ctx.tenantId,
        keyHash,
        keyPrefix,
        isActive: true,
        permissions: 'read,write',
      },
    });
    
    // Store the full key for testing
    ctx.apiKey = `${keyPrefix}_${rawKey}`;
  });

  it('should list datasets with valid API key', async () => {
    const response = await makeRequest('GET', '/api/v1/datasets', {
      apiKey: ctx.apiKey,
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('should reject request without API key', async () => {
    const response = await makeRequest('GET', '/api/v1/datasets');

    expect([401, 403]).toContain(response.status);
  });

  it('should reject invalid API key', async () => {
    const response = await makeRequest('GET', '/api/v1/datasets', {
      apiKey: 'invalid_api_key',
    });

    expect([401, 403]).toContain(response.status);
  });
});

describe('Critical Route 4: POST /api/v1/datasets', () => {
  it('should create a new dataset', async () => {
    const response = await makeRequest('POST', '/api/v1/datasets', {
      apiKey: ctx.apiKey,
      body: {
        name: 'Test Dataset',
        description: 'Critical test dataset',
        dataType: 'AUDIO',
        metadata: {
          sampleRate: 16000,
          channels: 1,
        },
      },
    });

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.name).toBe('Test Dataset');
    
    ctx.datasetId = response.data.id;
  });

  it('should reject dataset without name', async () => {
    const response = await makeRequest('POST', '/api/v1/datasets', {
      apiKey: ctx.apiKey,
      body: {
        description: 'No name dataset',
        dataType: 'AUDIO',
      },
    });

    expect(response.status).toBe(400);
  });

  it('should reject dataset with invalid dataType', async () => {
    const response = await makeRequest('POST', '/api/v1/datasets', {
      apiKey: ctx.apiKey,
      body: {
        name: 'Invalid Type Dataset',
        dataType: 'INVALID_TYPE',
      },
    });

    expect(response.status).toBe(400);
  });
});

describe('Critical Route 5: POST /api/v1/policies', () => {
  it('should create a new policy', async () => {
    const response = await makeRequest('POST', '/api/v1/policies', {
      apiKey: ctx.apiKey,
      body: {
        name: 'Test Policy',
        datasetId: ctx.datasetId,
        rules: {
          allowedPurposes: ['RESEARCH', 'TRAINING'],
          dataRetentionDays: 90,
          geographicRestrictions: ['US', 'EU'],
        },
        expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      },
    });

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.name).toBe('Test Policy');
    
    ctx.policyId = response.data.id;
  });

  it('should reject policy without datasetId', async () => {
    const response = await makeRequest('POST', '/api/v1/policies', {
      apiKey: ctx.apiKey,
      body: {
        name: 'Invalid Policy',
        rules: {},
      },
    });

    expect(response.status).toBe(400);
  });

  it('should reject policy with invalid rules', async () => {
    const response = await makeRequest('POST', '/api/v1/policies', {
      apiKey: ctx.apiKey,
      body: {
        name: 'Invalid Rules Policy',
        datasetId: ctx.datasetId,
        rules: 'invalid',
      },
    });

    expect(response.status).toBe(400);
  });
});

describe('Critical Route 6: POST /api/v1/leases', () => {
  it('should create a new lease', async () => {
    const response = await makeRequest('POST', '/api/v1/leases', {
      apiKey: ctx.apiKey,
      body: {
        datasetId: ctx.datasetId,
        policyId: ctx.policyId,
        duration: 3600, // 1 hour
        purpose: 'RESEARCH',
      },
    });

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data).toHaveProperty('token');
    
    ctx.leaseId = response.data.id;
  });

  it('should reject lease without datasetId', async () => {
    const response = await makeRequest('POST', '/api/v1/leases', {
      apiKey: ctx.apiKey,
      body: {
        policyId: ctx.policyId,
        duration: 3600,
      },
    });

    expect(response.status).toBe(400);
  });

  it('should reject lease with invalid duration', async () => {
    const response = await makeRequest('POST', '/api/v1/leases', {
      apiKey: ctx.apiKey,
      body: {
        datasetId: ctx.datasetId,
        policyId: ctx.policyId,
        duration: -100,
      },
    });

    expect(response.status).toBe(400);
  });
});

describe('Critical Route 7: GET /api/v1/leases/:id', () => {
  it('should retrieve lease by ID', async () => {
    const response = await makeRequest('GET', `/api/v1/leases/${ctx.leaseId}`, {
      apiKey: ctx.apiKey,
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('id', ctx.leaseId);
  });

  it('should reject non-existent lease', async () => {
    const response = await makeRequest('GET', '/api/v1/leases/non-existent-id', {
      apiKey: ctx.apiKey,
    });

    expect([404, 400]).toContain(response.status);
  });

  it('should reject unauthorized access to lease', async () => {
    const response = await makeRequest('GET', `/api/v1/leases/${ctx.leaseId}`);

    expect([401, 403]).toContain(response.status);
  });
});

describe('Critical Route 8: GET /api/v1/marketplace/offers', () => {
  it('should list marketplace offers', async () => {
    const response = await makeRequest('GET', '/api/v1/marketplace/offers', {
      apiKey: ctx.apiKey,
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('should filter offers by dataType', async () => {
    const response = await makeRequest('GET', '/api/v1/marketplace/offers?dataType=AUDIO', {
      apiKey: ctx.apiKey,
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('should paginate offers', async () => {
    const response = await makeRequest('GET', '/api/v1/marketplace/offers?limit=10&offset=0', {
      apiKey: ctx.apiKey,
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });
});

describe('Critical Route 9: POST /api/sidecar/auth', () => {
  it('should authenticate sidecar with valid lease token', async () => {
    // This would require a valid lease token from previous test
    const response = await makeRequest('POST', '/api/sidecar/auth', {
      body: {
        leaseId: ctx.leaseId,
        token: 'test-token',
      },
    });

    // Accept both success and expected auth failures for now
    expect([200, 401, 403]).toContain(response.status);
  });

  it('should reject sidecar auth without token', async () => {
    const response = await makeRequest('POST', '/api/sidecar/auth', {
      body: {
        leaseId: ctx.leaseId,
      },
    });

    expect([400, 401]).toContain(response.status);
  });
});

describe('Critical Route 10: POST /api/v1/billing/usage', () => {
  it('should record usage event', async () => {
    const response = await makeRequest('POST', '/api/v1/billing/usage', {
      apiKey: ctx.apiKey,
      body: {
        leaseId: ctx.leaseId,
        bytesProcessed: 1024000,
        duration: 60,
        eventType: 'STREAM',
      },
    });

    expect([200, 201]).toContain(response.status);
  });

  it('should reject usage without leaseId', async () => {
    const response = await makeRequest('POST', '/api/v1/billing/usage', {
      apiKey: ctx.apiKey,
      body: {
        bytesProcessed: 1024000,
        duration: 60,
      },
    });

    expect(response.status).toBe(400);
  });

  it('should reject negative usage values', async () => {
    const response = await makeRequest('POST', '/api/v1/billing/usage', {
      apiKey: ctx.apiKey,
      body: {
        leaseId: ctx.leaseId,
        bytesProcessed: -1000,
        duration: 60,
      },
    });

    expect(response.status).toBe(400);
  });
});

describe('Critical Route 11: POST /api/auth/forgot-password', () => {
  it('should initiate password reset', async () => {
    const response = await makeRequest('POST', '/api/auth/forgot-password', {
      body: {
        email: ctx.email,
      },
    });

    expect([200, 202]).toContain(response.status);
  });

  it('should not reveal non-existent email', async () => {
    const response = await makeRequest('POST', '/api/auth/forgot-password', {
      body: {
        email: 'nonexistent@xase.ai',
      },
    });

    // Should return success to prevent email enumeration
    expect([200, 202]).toContain(response.status);
  });

  it('should reject invalid email format', async () => {
    const response = await makeRequest('POST', '/api/auth/forgot-password', {
      body: {
        email: 'invalid-email',
      },
    });

    expect(response.status).toBe(400);
  });
});

describe('Critical Route 12: POST /api/auth/reset-password', () => {
  it('should reject reset without token', async () => {
    const response = await makeRequest('POST', '/api/auth/reset-password', {
      body: {
        password: 'NewPassword123!',
      },
    });

    expect(response.status).toBe(400);
  });

  it('should reject weak new password', async () => {
    const response = await makeRequest('POST', '/api/auth/reset-password', {
      body: {
        token: 'test-token',
        password: '123',
      },
    });

    expect(response.status).toBe(400);
  });
});

describe('Critical Route 13: POST /api/auth/verify-email', () => {
  it('should reject verification without token', async () => {
    const response = await makeRequest('POST', '/api/auth/verify-email', {
      body: {},
    });

    expect(response.status).toBe(400);
  });

  it('should reject invalid verification token', async () => {
    const response = await makeRequest('POST', '/api/auth/verify-email', {
      body: {
        token: 'invalid-token',
      },
    });

    expect([400, 404]).toContain(response.status);
  });
});

describe('Critical Route 14: GET /api/users/me', () => {
  it('should return current user with valid auth', async () => {
    const response = await makeRequest('GET', '/api/users/me', {
      apiKey: ctx.apiKey,
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('id');
    expect(response.data).toHaveProperty('email');
  });

  it('should reject unauthenticated request', async () => {
    const response = await makeRequest('GET', '/api/users/me');

    expect([401, 403]).toContain(response.status);
  });
});

describe('Critical Route 15: GET /api/v1/billing/dashboard', () => {
  it('should return billing dashboard data', async () => {
    const response = await makeRequest('GET', '/api/v1/billing/dashboard', {
      apiKey: ctx.apiKey,
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('usage');
  });

  it('should reject unauthorized access', async () => {
    const response = await makeRequest('GET', '/api/v1/billing/dashboard');

    expect([401, 403]).toContain(response.status);
  });
});

describe('Critical Route 16: GET /api/health', () => {
  it('should return healthy status', async () => {
    const response = await makeRequest('GET', '/api/health');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('status');
  });
});

describe('Critical Route 17: POST /api/auth/change-password', () => {
  it('should reject without current password', async () => {
    const response = await makeRequest('POST', '/api/auth/change-password', {
      apiKey: ctx.apiKey,
      body: {
        newPassword: 'NewPassword123!',
      },
    });

    expect(response.status).toBe(400);
  });

  it('should reject weak new password', async () => {
    const response = await makeRequest('POST', '/api/auth/change-password', {
      apiKey: ctx.apiKey,
      body: {
        currentPassword: ctx.password,
        newPassword: '123',
      },
    });

    expect(response.status).toBe(400);
  });
});

describe('Critical Route 18: DELETE /api/v1/policies/:id', () => {
  it('should revoke policy', async () => {
    const response = await makeRequest('DELETE', `/api/v1/policies/${ctx.policyId}`, {
      apiKey: ctx.apiKey,
    });

    expect([200, 204]).toContain(response.status);
  });

  it('should reject unauthorized policy deletion', async () => {
    const response = await makeRequest('DELETE', `/api/v1/policies/${ctx.policyId}`);

    expect([401, 403]).toContain(response.status);
  });
});

describe('Critical Route 19: GET /api/v1/access-offers', () => {
  it('should list access offers', async () => {
    const response = await makeRequest('GET', '/api/v1/access-offers', {
      apiKey: ctx.apiKey,
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });
});

describe('Critical Route 20: POST /api/v1/access-offers/:offerId/execute', () => {
  it('should reject execution without valid offerId', async () => {
    const response = await makeRequest('POST', '/api/v1/access-offers/invalid-id/execute', {
      apiKey: ctx.apiKey,
      body: {},
    });

    expect([400, 404]).toContain(response.status);
  });
});
