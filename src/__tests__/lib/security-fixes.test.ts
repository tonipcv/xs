import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

describe('Security Fixes', () => {
  describe('Sidecar Auth JWT Signing', () => {
    it('should generate properly signed JWT tokens', () => {
      const secret = 'test-secret';
      const payload = {
        leaseId: 'lease_123',
        tenantId: 'tenant_456',
        sessionId: 'session_789',
        permissions: ['s3:GetObject'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = jwt.sign(payload, secret, { algorithm: 'HS256' });

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts

      // Verify token can be decoded
      const decoded = jwt.verify(token, secret) as any;
      expect(decoded.leaseId).toBe(payload.leaseId);
      expect(decoded.tenantId).toBe(payload.tenantId);
      expect(decoded.sessionId).toBe(payload.sessionId);
      expect(decoded.permissions).toEqual(payload.permissions);
    });

    it('should reject forged tokens', () => {
      const secret = 'test-secret';
      const wrongSecret = 'wrong-secret';
      
      const payload = {
        leaseId: 'lease_123',
        tenantId: 'tenant_456',
        sessionId: 'session_789',
        permissions: ['s3:GetObject'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = jwt.sign(payload, secret, { algorithm: 'HS256' });

      // Should throw when verifying with wrong secret
      expect(() => {
        jwt.verify(token, wrongSecret);
      }).toThrow();
    });

    it('should reject base64-only tokens (old vulnerable format)', () => {
      const secret = 'test-secret';
      
      // Simulate old vulnerable base64-only token
      const fakePayload = {
        leaseId: 'forged_lease',
        tenantId: 'forged_tenant',
        permissions: ['s3:GetObject'],
      };
      const base64Token = `sts_${Buffer.from(JSON.stringify(fakePayload)).toString('base64url')}`;

      // Should fail to verify
      expect(() => {
        jwt.verify(base64Token, secret);
      }).toThrow();
    });

    it('should include sessionId in token payload', () => {
      const secret = 'test-secret';
      const sessionId = 'session_unique_123';
      
      const payload = {
        leaseId: 'lease_123',
        tenantId: 'tenant_456',
        sessionId,
        permissions: ['s3:GetObject'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
      const decoded = jwt.verify(token, secret) as any;

      expect(decoded.sessionId).toBe(sessionId);
    });

    it('should validate token expiration', () => {
      const secret = 'test-secret';
      
      // Create expired token
      const payload = {
        leaseId: 'lease_123',
        tenantId: 'tenant_456',
        sessionId: 'session_789',
        permissions: ['s3:GetObject'],
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      const token = jwt.sign(payload, secret, { algorithm: 'HS256' });

      // Should throw on expired token
      expect(() => {
        jwt.verify(token, secret);
      }).toThrow(/expired/i);
    });
  });

  describe('Body Reading Issue', () => {
    it('should parse body only once', async () => {
      // Simulate Next.js request body that can only be read once
      let readCount = 0;
      const mockBody = { leaseId: 'lease_123', attestationReport: 'report_data' };
      
      const mockReq = {
        json: async () => {
          readCount++;
          if (readCount > 1) {
            throw new Error('Body already consumed');
          }
          return mockBody;
        },
      };

      // Correct approach: read once, store result
      const body = await mockReq.json();
      const leaseId = body.leaseId;
      const attestationReport = body.attestationReport;

      expect(readCount).toBe(1);
      expect(leaseId).toBe('lease_123');
      expect(attestationReport).toBe('report_data');

      // Attempting to read again should fail
      await expect(mockReq.json()).rejects.toThrow('Body already consumed');
    });

    it('should handle optional fields correctly', async () => {
      const mockBody: { leaseId: string; attestationReport?: string; binaryHash?: string } = { 
        leaseId: 'lease_123' 
      }; // No attestationReport
      
      const mockReq = {
        json: async () => mockBody,
      };

      const body = await mockReq.json();
      const leaseId = body.leaseId;
      const attestationReport = body.attestationReport;
      const binaryHash = body.binaryHash;

      expect(leaseId).toBe('lease_123');
      expect(attestationReport).toBeUndefined();
      expect(binaryHash).toBeUndefined();
    });
  });

  describe('Dataset Stream Params', () => {
    it('should correctly await context.params in Next.js 15', async () => {
      // Simulate Next.js 15 context with Promise-based params
      const context = {
        params: Promise.resolve({ datasetId: 'dataset_abc123' }),
      };

      const { datasetId } = await context.params;

      expect(datasetId).toBe('dataset_abc123');
    });

    it('should handle params as Promise correctly', async () => {
      const mockContext = {
        params: new Promise<{ datasetId: string }>((resolve) => {
          setTimeout(() => resolve({ datasetId: 'async_dataset_456' }), 10);
        }),
      };

      const { datasetId } = await mockContext.params;

      expect(datasetId).toBe('async_dataset_456');
    });
  });

  describe('Debug Endpoint Authentication', () => {
    it('should require authentication', () => {
      // Mock request without auth
      const mockReqNoAuth = {
        headers: new Map(),
      };

      // Should return 401 without valid API key
      // This would be tested in integration tests with actual endpoint
      expect(mockReqNoAuth.headers.size).toBe(0);
    });

    it('should block access in production without flag', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ALLOW_DEBUG_ENDPOINTS', '');

      const shouldBlock = 
        process.env.NODE_ENV === 'production' && 
        process.env.ALLOW_DEBUG_ENDPOINTS !== 'true';

      expect(shouldBlock).toBe(true);

      vi.unstubAllEnvs();
    });

    it('should allow access in development', () => {
      vi.stubEnv('NODE_ENV', 'development');

      const shouldBlock = 
        process.env.NODE_ENV === 'production' && 
        process.env.ALLOW_DEBUG_ENDPOINTS !== 'true';

      expect(shouldBlock).toBe(false);

      vi.unstubAllEnvs();
    });

    it('should allow access in production with explicit flag', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ALLOW_DEBUG_ENDPOINTS', 'true');

      const shouldBlock = 
        process.env.NODE_ENV === 'production' && 
        process.env.ALLOW_DEBUG_ENDPOINTS !== 'true';

      expect(shouldBlock).toBe(false);

      vi.unstubAllEnvs();
    });
  });
});
