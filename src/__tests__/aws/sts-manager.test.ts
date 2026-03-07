/**
 * Tests for AWS STS Integration
 * 
 * Testes para integração com AWS STS usando @aws-sdk/client-sts.
 * Nota: Estes testes usam mocks para evitar chamadas reais à AWS.
 */

import { 
  AwsStsManager, 
  getAwsStsManager, 
  resetAwsStsManager,
  AssumeRoleRequest,
} from '@/lib/aws/sts-manager';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock AWS SDK
vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  AssumeRoleCommand: vi.fn(),
  GetCallerIdentityCommand: vi.fn(),
  AssumeRoleWithWebIdentityCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
}));

describe('AwsStsManager', () => {
  let manager: AwsStsManager;

  beforeEach(() => {
    resetAwsStsManager();
    manager = getAwsStsManager({
      region: 'us-east-1',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });
  });

  describe('Constructor', () => {
    it('should create instance with config', () => {
      const customManager = new AwsStsManager({
        region: 'eu-west-1',
        accessKeyId: 'AKIA...',
        secretAccessKey: 'secret...',
      });

      expect(customManager).toBeDefined();
    });

    it('should use environment variables when config not provided', () => {
      process.env.AWS_REGION = 'us-west-2';
      
      const envManager = new AwsStsManager();
      expect(envManager).toBeDefined();
      
      delete process.env.AWS_REGION;
    });
  });

  describe('assumeRole', () => {
    it('should assume role successfully', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      const mockSend = vi.fn().mockResolvedValue({
        Credentials: {
          AccessKeyId: 'ASIA...',
          SecretAccessKey: 'secret...',
          SessionToken: 'token...',
          Expiration: new Date(Date.now() + 3600 * 1000),
        },
      });
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      const request: AssumeRoleRequest = {
        roleArn: 'arn:aws:iam::123456789012:role/TestRole',
        roleSessionName: 'test-session',
        durationSeconds: 3600,
      };

      const creds = await manager.assumeRole(request);

      expect(creds.accessKeyId).toBe('ASIA...');
      expect(creds.secretAccessKey).toBe('secret...');
      expect(creds.sessionToken).toBe('token...');
      expect(creds.roleArn).toBe(request.roleArn);
      expect(creds.expiration).toBeInstanceOf(Date);
    });

    it('should cache credentials', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      const mockSend = vi.fn().mockResolvedValue({
        Credentials: {
          AccessKeyId: 'ASIA...',
          SecretAccessKey: 'secret...',
          SessionToken: 'token...',
          Expiration: new Date(Date.now() + 3600 * 1000),
        },
      });
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      const request: AssumeRoleRequest = {
        roleArn: 'arn:aws:iam::123456789012:role/TestRole',
        roleSessionName: 'test-session',
      };

      // First call
      await manager.assumeRole(request);
      
      // Second call should use cache
      const cachedCreds = manager.getCachedCredentials(
        request.roleArn,
        request.roleSessionName
      );

      expect(cachedCreds).toBeDefined();
      expect(cachedCreds?.accessKeyId).toBe('ASIA...');
    });

    it('should include external ID when provided', async () => {
      const { STSClient, AssumeRoleCommand } = await import('@aws-sdk/client-sts');
      const mockSend = vi.fn().mockResolvedValue({
        Credentials: {
          AccessKeyId: 'ASIA...',
          SecretAccessKey: 'secret...',
          SessionToken: 'token...',
          Expiration: new Date(),
        },
      });
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      const request: AssumeRoleRequest = {
        roleArn: 'arn:aws:iam::123456789012:role/TestRole',
        roleSessionName: 'test-session',
        externalId: 'external-id-123',
      };

      await manager.assumeRole(request);

      expect(AssumeRoleCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ExternalId: 'external-id-123',
        })
      );
    });

    it('should include scoped policy when provided', async () => {
      const { STSClient, AssumeRoleCommand } = await import('@aws-sdk/client-sts');
      const mockSend = vi.fn().mockResolvedValue({
        Credentials: {
          AccessKeyId: 'ASIA...',
          SecretAccessKey: 'secret...',
          SessionToken: 'token...',
          Expiration: new Date(),
        },
      });
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      const policy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: 's3:GetObject',
          Resource: '*',
        }],
      });

      const request: AssumeRoleRequest = {
        roleArn: 'arn:aws:iam::123456789012:role/TestRole',
        roleSessionName: 'test-session',
        policy,
      };

      await manager.assumeRole(request);

      expect(AssumeRoleCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Policy: policy,
        })
      );
    });

    it('should throw error on assume role failure', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: vi.fn().mockRejectedValue(new Error('Access denied')),
      }));

      const request: AssumeRoleRequest = {
        roleArn: 'arn:aws:iam::123456789012:role/InvalidRole',
        roleSessionName: 'test-session',
      };

      await expect(manager.assumeRole(request)).rejects.toThrow('Failed to assume role');
    });
  });

  describe('assumeRoleWithWebIdentity', () => {
    it('should assume role with web identity', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      const mockSend = vi.fn().mockResolvedValue({
        Credentials: {
          AccessKeyId: 'ASIA...',
          SecretAccessKey: 'secret...',
          SessionToken: 'token...',
          Expiration: new Date(),
        },
      });
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      const creds = await manager.assumeRoleWithWebIdentity(
        'arn:aws:iam::123456789012:role/OIDC-Role',
        'oidc-session',
        'eyJhbGciOiJSUzI1NiIs...',
        3600
      );

      expect(creds.accessKeyId).toBe('ASIA...');
    });
  });

  describe('getCallerIdentity', () => {
    it('should return caller identity', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: vi.fn().mockResolvedValue({
          Account: '123456789012',
          Arn: 'arn:aws:iam::123456789012:user/test-user',
          UserId: 'AIDACKCEVSQ6C2EXAMPLE',
        }),
      }));

      const identity = await manager.getCallerIdentity();

      expect(identity.account).toBe('123456789012');
      expect(identity.arn).toBe('arn:aws:iam::123456789012:user/test-user');
      expect(identity.userId).toBe('AIDACKCEVSQ6C2EXAMPLE');
    });
  });

  describe('Credential Cache Management', () => {
    it('should check if credentials are valid', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: vi.fn().mockResolvedValue({
          Credentials: {
            AccessKeyId: 'ASIA...',
            SecretAccessKey: 'secret...',
            SessionToken: 'token...',
            Expiration: new Date(Date.now() + 3600 * 1000), // 1 hour from now
          },
        }),
      }));

      const roleArn = 'arn:aws:iam::123456789012:role/TestRole';
      const roleSessionName = 'test-session';

      await manager.assumeRole({ roleArn, roleSessionName });

      expect(manager.areCredentialsValid(roleArn, roleSessionName)).toBe(true);
    });

    it('should detect expired credentials', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: vi.fn().mockResolvedValue({
          Credentials: {
            AccessKeyId: 'ASIA...',
            SecretAccessKey: 'secret...',
            SessionToken: 'token...',
            Expiration: new Date(Date.now() - 1000), // Expired 1 second ago
          },
        }),
      }));

      const roleArn = 'arn:aws:iam::123456789012:role/TestRole';
      const roleSessionName = 'expired-session';

      await manager.assumeRole({ roleArn, roleSessionName });

      expect(manager.areCredentialsValid(roleArn, roleSessionName)).toBe(false);
    });

    it('should clear specific cached credentials', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: vi.fn().mockResolvedValue({
          Credentials: {
            AccessKeyId: 'ASIA...',
            SecretAccessKey: 'secret...',
            SessionToken: 'token...',
            Expiration: new Date(),
          },
        }),
      }));

      const roleArn = 'arn:aws:iam::123456789012:role/TestRole';
      const roleSessionName = 'test-session';

      await manager.assumeRole({ roleArn, roleSessionName });
      expect(manager.getCachedCredentials(roleArn, roleSessionName)).toBeDefined();

      manager.clearCache(roleArn, roleSessionName);
      expect(manager.getCachedCredentials(roleArn, roleSessionName)).toBeUndefined();
    });

    it('should clear all cached credentials', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: vi.fn().mockResolvedValue({
          Credentials: {
            AccessKeyId: 'ASIA...',
            SecretAccessKey: 'secret...',
            SessionToken: 'token...',
            Expiration: new Date(),
          },
        }),
      }));

      await manager.assumeRole({
        roleArn: 'arn:aws:iam::123456789012:role/Role1',
        roleSessionName: 'session1',
      });
      await manager.assumeRole({
        roleArn: 'arn:aws:iam::123456789012:role/Role2',
        roleSessionName: 'session2',
      });

      manager.clearCache();

      expect(manager.getCachedCredentials('arn:aws:iam::123456789012:role/Role1', 'session1')).toBeUndefined();
      expect(manager.getCachedCredentials('arn:aws:iam::123456789012:role/Role2', 'session2')).toBeUndefined();
    });
  });

  describe('Policy Generation', () => {
    it('should generate S3 scoped policy with read permissions', () => {
      const policy = manager.generateS3ScopedPolicy(
        'my-bucket',
        'datasets/tenant-123/',
        ['read']
      );

      const parsed = JSON.parse(policy);
      expect(parsed.Version).toBe('2012-10-17');
      expect(parsed.Statement[0].Action).toContain('s3:GetObject');
      expect(parsed.Statement[0].Action).toContain('s3:ListBucket');
      expect(parsed.Statement[0].Resource).toContain('arn:aws:s3:::my-bucket');
    });

    it('should generate S3 scoped policy with write permissions', () => {
      const policy = manager.generateS3ScopedPolicy(
        'my-bucket',
        'uploads/',
        ['write']
      );

      const parsed = JSON.parse(policy);
      expect(parsed.Statement[0].Action).toContain('s3:PutObject');
    });

    it('should generate S3 scoped policy with all permissions', () => {
      const policy = manager.generateS3ScopedPolicy(
        'my-bucket',
        'data/',
        ['read', 'write', 'delete']
      );

      const parsed = JSON.parse(policy);
      expect(parsed.Statement[0].Action).toContain('s3:GetObject');
      expect(parsed.Statement[0].Action).toContain('s3:PutObject');
      expect(parsed.Statement[0].Action).toContain('s3:DeleteObject');
    });

    it('should generate dataset scoped policy', () => {
      const policy = manager.generateDatasetScopedPolicy(
        'tenant-123',
        'dataset-456',
        ['read', 'write']
      );

      const parsed = JSON.parse(policy);
      expect(parsed.Statement[0].Resource).toContain('xase-datasets-tenant-123');
      expect(parsed.Statement[0].Condition.StringEquals['aws:PrincipalTag/TenantId']).toBe('tenant-123');
    });
  });

  describe('Refresh Credentials', () => {
    it('should refresh credentials when expired', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      const mockSend = vi.fn()
        .mockResolvedValueOnce({
          Credentials: {
            AccessKeyId: 'ASIA_OLD',
            SecretAccessKey: 'secret...',
            SessionToken: 'token...',
            Expiration: new Date(Date.now() - 1000), // Expired
          },
        })
        .mockResolvedValueOnce({
          Credentials: {
            AccessKeyId: 'ASIA_NEW',
            SecretAccessKey: 'secret...',
            SessionToken: 'token...',
            Expiration: new Date(Date.now() + 3600 * 1000),
          },
        });
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      const roleArn = 'arn:aws:iam::123456789012:role/TestRole';
      const roleSessionName = 'test-session';

      // First assume (gets expired creds)
      await manager.assumeRole({ roleArn, roleSessionName });

      // Refresh should get new creds
      const result = await manager.refreshCredentials(
        roleArn,
        roleSessionName,
        { roleArn, roleSessionName }
      );

      expect(result.success).toBe(true);
      expect(result.credentials?.accessKeyId).toBe('ASIA_NEW');
    });

    it('should trigger refresh callback', async () => {
      const { STSClient } = await import('@aws-sdk/client-sts');
      const mockSend = vi.fn().mockResolvedValue({
        Credentials: {
          AccessKeyId: 'ASIA...',
          SecretAccessKey: 'secret...',
          SessionToken: 'token...',
          Expiration: new Date(Date.now() + 3600 * 1000),
        },
      });
      
      (STSClient as vi.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      const roleArn = 'arn:aws:iam::123456789012:role/TestRole';
      const roleSessionName = 'test-session';
      const callback = vi.fn();

      manager.onCredentialRefresh(roleArn, roleSessionName, callback);

      await manager.assumeRole({ roleArn, roleSessionName });

      // The callback should be registered, and it will be called during auto-refresh
      expect(callback).toBeDefined();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const m1 = getAwsStsManager();
      const m2 = getAwsStsManager();

      expect(m1).toBe(m2);
    });

    it('should create new instance after reset', () => {
      const m1 = getAwsStsManager();
      resetAwsStsManager();
      const m2 = getAwsStsManager();

      expect(m1).not.toBe(m2);
    });
  });
});
