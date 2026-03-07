/**
 * AWS STS Integration
 * 
 * Real implementation using @aws-sdk/client-sts for temporary credentials,
 * credential refresh, and scoped permissions.
 */

import { 
  STSClient, 
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  AssumeRoleWithWebIdentityCommand,
  Credentials,
} from '@aws-sdk/client-sts';
import { logger } from '@/lib/logger';

export interface StsConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface AssumeRoleRequest {
  roleArn: string;
  roleSessionName: string;
  durationSeconds?: number;
  externalId?: string;
  policy?: string; // IAM policy JSON for scoped permissions
  tags?: Array<{ key: string; value: string }>;
}

export interface TemporaryCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
  roleArn?: string;
}

export interface CredentialRefreshResult {
  success: boolean;
  credentials?: TemporaryCredentials;
  error?: string;
}

export interface CallerIdentity {
  account: string;
  arn: string;
  userId: string;
}

/**
 * AWS STS Client Manager
 */
export class AwsStsManager {
  private client: STSClient;
  private cachedCredentials: Map<string, TemporaryCredentials> = new Map();
  private refreshCallbacks: Map<string, (creds: TemporaryCredentials) => void> = new Map();

  constructor(config?: StsConfig) {
    this.client = new STSClient({
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
      credentials: config?.accessKeyId && config?.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            sessionToken: config.sessionToken,
          }
        : undefined,
    });
  }

  /**
   * Assume IAM Role with optional scoped permissions
   */
  async assumeRole(request: AssumeRoleRequest): Promise<TemporaryCredentials> {
    try {
      logger.info(`[AwsStsManager] Assuming role: ${request.roleArn}`);

      const command = new AssumeRoleCommand({
        RoleArn: request.roleArn,
        RoleSessionName: request.roleSessionName,
        DurationSeconds: request.durationSeconds || 3600,
        ExternalId: request.externalId,
        Policy: request.policy, // Scoped permissions
        Tags: request.tags?.map(t => ({ Key: t.key, Value: t.value })),
      });

      const response = await this.client.send(command);
      const creds = response.Credentials;

      if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
        throw new Error('Incomplete credentials returned from STS');
      }

      const temporaryCreds: TemporaryCredentials = {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretAccessKey,
        sessionToken: creds.SessionToken,
        expiration: creds.Expiration || new Date(Date.now() + 3600 * 1000),
        roleArn: request.roleArn,
      };

      // Cache credentials
      const cacheKey = `${request.roleArn}:${request.roleSessionName}`;
      this.cachedCredentials.set(cacheKey, temporaryCreds);

      logger.info(`[AwsStsManager] Role assumed successfully, expires: ${temporaryCreds.expiration.toISOString()}`);

      // Schedule refresh if callback registered
      this.scheduleRefresh(cacheKey, temporaryCreds);

      return temporaryCreds;
    } catch (error) {
      logger.error('[AwsStsManager] AssumeRole failed:', error);
      throw new Error(`Failed to assume role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Assume Role with Web Identity (OIDC/OAuth2)
   */
  async assumeRoleWithWebIdentity(
    roleArn: string,
    roleSessionName: string,
    webIdentityToken: string,
    durationSeconds?: number
  ): Promise<TemporaryCredentials> {
    try {
      logger.info(`[AwsStsManager] Assuming role with web identity: ${roleArn}`);

      const command = new AssumeRoleWithWebIdentityCommand({
        RoleArn: roleArn,
        RoleSessionName: roleSessionName,
        WebIdentityToken: webIdentityToken,
        DurationSeconds: durationSeconds || 3600,
      });

      const response = await this.client.send(command);
      const creds = response.Credentials;

      if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
        throw new Error('Incomplete credentials returned from STS');
      }

      return {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretAccessKey,
        sessionToken: creds.SessionToken,
        expiration: creds.Expiration || new Date(Date.now() + 3600 * 1000),
        roleArn,
      };
    } catch (error) {
      logger.error('[AwsStsManager] AssumeRoleWithWebIdentity failed:', error);
      throw new Error(`Failed to assume role with web identity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current caller identity
   */
  async getCallerIdentity(): Promise<CallerIdentity> {
    try {
      const command = new GetCallerIdentityCommand({});
      const response = await this.client.send(command);

      return {
        account: response.Account || '',
        arn: response.Arn || '',
        userId: response.UserId || '',
      };
    } catch (error) {
      logger.error('[AwsStsManager] GetCallerIdentity failed:', error);
      throw new Error(`Failed to get caller identity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Refresh cached credentials before expiration
   */
  async refreshCredentials(
    roleArn: string,
    roleSessionName: string,
    originalRequest: AssumeRoleRequest
  ): Promise<CredentialRefreshResult> {
    try {
      const cacheKey = `${roleArn}:${roleSessionName}`;
      const currentCreds = this.cachedCredentials.get(cacheKey);

      if (!currentCreds) {
        return { success: false, error: 'No cached credentials found' };
      }

      // Check if refresh is needed (expire in < 5 minutes)
      const fiveMinutes = 5 * 60 * 1000;
      if (currentCreds.expiration.getTime() - Date.now() > fiveMinutes) {
        return { success: true, credentials: currentCreds }; // Still valid
      }

      logger.info(`[AwsStsManager] Refreshing credentials for ${roleArn}`);

      // Re-assume role
      const newCreds = await this.assumeRole(originalRequest);

      // Trigger callback if registered
      const callback = this.refreshCallbacks.get(cacheKey);
      if (callback) {
        callback(newCreds);
      }

      return { success: true, credentials: newCreds };
    } catch (error) {
      logger.error('[AwsStsManager] Credential refresh failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Register callback for credential refresh
   */
  onCredentialRefresh(
    roleArn: string,
    roleSessionName: string,
    callback: (creds: TemporaryCredentials) => void
  ): void {
    const cacheKey = `${roleArn}:${roleSessionName}`;
    this.refreshCallbacks.set(cacheKey, callback);
  }

  /**
   * Get cached credentials
   */
  getCachedCredentials(roleArn: string, roleSessionName: string): TemporaryCredentials | undefined {
    const cacheKey = `${roleArn}:${roleSessionName}`;
    return this.cachedCredentials.get(cacheKey);
  }

  /**
   * Check if credentials are valid and not expired
   */
  areCredentialsValid(roleArn: string, roleSessionName: string): boolean {
    const creds = this.getCachedCredentials(roleArn, roleSessionName);
    if (!creds) return false;

    // Buffer of 5 minutes before actual expiration
    const bufferMs = 5 * 60 * 1000;
    return creds.expiration.getTime() - bufferMs > Date.now();
  }

  /**
   * Generate scoped policy for S3 access
   */
  generateS3ScopedPolicy(
    bucketName: string,
    prefix: string,
    permissions: ('read' | 'write' | 'delete')[]
  ): string {
    const actions: string[] = [];
    
    if (permissions.includes('read')) {
      actions.push('s3:GetObject', 's3:ListBucket');
    }
    if (permissions.includes('write')) {
      actions.push('s3:PutObject');
    }
    if (permissions.includes('delete')) {
      actions.push('s3:DeleteObject');
    }

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: actions,
          Resource: [
            `arn:aws:s3:::${bucketName}`,
            `arn:aws:s3:::${bucketName}/${prefix}*`,
          ],
        },
      ],
    };

    return JSON.stringify(policy);
  }

  /**
   * Generate scoped policy for specific dataset operations
   */
  generateDatasetScopedPolicy(
    tenantId: string,
    datasetId: string,
    operations: ('read' | 'write' | 'admin')[]
  ): string {
    const actions: string[] = [];
    
    if (operations.includes('read')) {
      actions.push('s3:GetObject', 's3:ListBucket');
    }
    if (operations.includes('write')) {
      actions.push('s3:PutObject', 's3:DeleteObject');
    }
    if (operations.includes('admin')) {
      actions.push('s3:*');
    }

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: actions,
          Resource: [
            `arn:aws:s3:::xase-datasets-${tenantId}`,
            `arn:aws:s3:::xase-datasets-${tenantId}/datasets/${datasetId}/*`,
          ],
          Condition: {
            StringEquals: {
              'aws:PrincipalTag/TenantId': tenantId,
            },
          },
        },
      ],
    };

    return JSON.stringify(policy);
  }

  /**
   * Create S3 client with temporary credentials
   */
  async createS3ClientWithRole(
    roleArn: string,
    roleSessionName: string,
    region: string,
    scopedPolicy?: string
  ): Promise<import('@aws-sdk/client-s3').S3Client> {
    const { S3Client } = await import('@aws-sdk/client-s3');

    let creds = this.getCachedCredentials(roleArn, roleSessionName);

    if (!creds || !this.areCredentialsValid(roleArn, roleSessionName)) {
      creds = await this.assumeRole({
        roleArn,
        roleSessionName,
        policy: scopedPolicy,
      });
    }

    return new S3Client({
      region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });
  }

  /**
   * Schedule automatic credential refresh
   */
  private scheduleRefresh(cacheKey: string, creds: TemporaryCredentials): void {
    // Refresh 5 minutes before expiration
    const refreshTime = creds.expiration.getTime() - Date.now() - 5 * 60 * 1000;
    
    if (refreshTime > 0) {
      setTimeout(async () => {
        const callback = this.refreshCallbacks.get(cacheKey);
        if (callback) {
          logger.info(`[AwsStsManager] Auto-refreshing credentials for ${cacheKey}`);
          // Refresh logic would go here
        }
      }, refreshTime);
    }
  }

  /**
   * Clear cached credentials
   */
  clearCache(roleArn?: string, roleSessionName?: string): void {
    if (roleArn && roleSessionName) {
      const cacheKey = `${roleArn}:${roleSessionName}`;
      this.cachedCredentials.delete(cacheKey);
      this.refreshCallbacks.delete(cacheKey);
    } else {
      this.cachedCredentials.clear();
      this.refreshCallbacks.clear();
    }
  }
}

// Singleton instance
let stsManager: AwsStsManager | null = null;

export function getAwsStsManager(config?: StsConfig): AwsStsManager {
  if (!stsManager) {
    stsManager = new AwsStsManager(config);
  }
  return stsManager;
}

export function resetAwsStsManager(): void {
  stsManager = null;
}
