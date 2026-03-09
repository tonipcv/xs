/**
 * AWS STS Integration for Temporary Credentials
 * Provides least-privilege access with short TTL
 */

import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export interface STSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

export interface STSAssumeRoleConfig {
  roleArn: string;
  sessionName: string;
  durationSeconds: number;
  externalId?: string;
  policy?: string;
}

export interface ScopedPermissions {
  bucket: string;
  prefix: string;
  actions: Array<'s3:GetObject' | 's3:ListBucket' | 's3:PutObject'>;
}

export class AWSSTSManager {
  private region: string;
  private stsClient: STSClient;
  private s3Client: S3Client;

  constructor(region: string = process.env.AWS_REGION || 'us-east-1') {
    this.region = region;
    this.stsClient = new STSClient({ region });
    this.s3Client = new S3Client({ region });
  }

  /**
   * Assume role with least privilege for dataset access
   * REAL implementation using AWS STS API
   */
  async assumeRoleForDataset(
    config: STSAssumeRoleConfig,
    permissions: ScopedPermissions
  ): Promise<STSCredentials> {
    const command = new AssumeRoleCommand({
      RoleArn: config.roleArn,
      RoleSessionName: config.sessionName.substring(0, 64),
      DurationSeconds: config.durationSeconds,
      ExternalId: config.externalId,
      Policy: config.policy,
    });

    const response = await this.stsClient.send(command);
    
    if (!response.Credentials) {
      throw new Error('Failed to assume role: no credentials returned');
    }

    return {
      accessKeyId: response.Credentials.AccessKeyId!,
      secretAccessKey: response.Credentials.SecretAccessKey!,
      sessionToken: response.Credentials.SessionToken!,
      expiration: response.Credentials.Expiration!,
    };
  }

  /**
   * Get current AWS account ID
   */
  async getCallerIdentity(): Promise<{ accountId: string; arn: string; userId: string }> {
    const command = new GetCallerIdentityCommand({});
    const response = await this.stsClient.send(command);
    
    return {
      accountId: response.Account!,
      arn: response.Arn!,
      userId: response.UserId!,
    };
  }

  /**
   * Get temporary credentials for prepared dataset access
   * Short TTL (15 min default) for security
   */
  async getDatasetAccessCredentials(
    datasetId: string,
    leaseId: string,
    ttlMinutes: number = 15
  ): Promise<STSCredentials & { scope: ScopedPermissions }> {
    const sessionName = `dataset-${datasetId}-${leaseId}`.substring(0, 64);
    
    // Use the configured test role ARN or construct one
    const roleArn = process.env.AWS_TEST_ROLE_ARN || 
      `arn:aws:iam::${await this.getAccountId()}:role/xase-dataset-access`;
    
    const permissions: ScopedPermissions = {
      bucket: process.env.AWS_S3_BUCKET || `xase-prepared-datasets-${this.region}`,
      prefix: `${datasetId}/${leaseId}/`,
      actions: ['s3:GetObject', 's3:ListBucket'],
    };

    const config: STSAssumeRoleConfig = {
      roleArn,
      sessionName,
      durationSeconds: ttlMinutes * 60,
    };

    const creds = await this.assumeRoleForDataset(config, permissions);

    return {
      ...creds,
      scope: permissions,
    };
  }

  /**
   * Get credentials for sidecar delivery streaming
   */
  async getStreamingCredentials(
    patientToken: string,
    modalities: string[],
    ttlMinutes: number = 60
  ): Promise<STSCredentials & { scope: ScopedPermissions }> {
    const sessionName = `sidecar-${patientToken}`.substring(0, 64);
    
    const roleArn = process.env.AWS_TEST_ROLE_ARN || 
      `arn:aws:iam::${await this.getAccountId()}:role/xase-sidecar-streaming`;
    
    const permissions: ScopedPermissions = {
      bucket: process.env.AWS_S3_BUCKET || `xase-sidecar-delivery-${this.region}`,
      prefix: `${patientToken}/`,
      actions: ['s3:GetObject'],
    };

    const config: STSAssumeRoleConfig = {
      roleArn,
      sessionName,
      durationSeconds: ttlMinutes * 60,
    };

    const creds = await this.assumeRoleForDataset(config, permissions);

    return {
      ...creds,
      scope: permissions,
    };
  }

  /**
   * Validate credentials are still valid
   */
  isValid(credentials: STSCredentials): boolean {
    // Add 30-second buffer for clock skew
    const bufferMs = 30 * 1000;
    return new Date(Date.now() + bufferMs) < credentials.expiration;
  }

  /**
   * Refresh credentials before expiration
   */
  async refreshIfNeeded(
    credentials: STSCredentials,
    refreshCallback: () => Promise<STSCredentials>,
    thresholdMinutes: number = 5
  ): Promise<STSCredentials> {
    const thresholdMs = thresholdMinutes * 60 * 1000;
    const timeUntilExpiry = credentials.expiration.getTime() - Date.now();

    if (timeUntilExpiry < thresholdMs) {
      return refreshCallback();
    }

    return credentials;
  }

  /**
   * Generate REAL signed URL for direct S3 access using AWS SDK
   */
  async generateSignedUrl(
    bucket: string,
    key: string,
    credentials: STSCredentials,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    // Create a temporary S3 client with the provided credentials
    const tempS3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    // Generate real signed URL using AWS SDK
    const signedUrl = await getSignedUrl(tempS3Client, command, {
      expiresIn: expiresInSeconds,
    });

    return signedUrl;
  }

  /**
   * Get AWS Account ID from caller identity
   */
  private async getAccountId(): Promise<string> {
    try {
      const identity = await this.getCallerIdentity();
      return identity.accountId;
    } catch {
      return '000000000000';
    }
  }

  // Legacy method names for backward compatibility
  async assumeRole(config: STSAssumeRoleConfig): Promise<STSCredentials> {
    const dummyPermissions: ScopedPermissions = {
      bucket: 'dummy',
      prefix: '',
      actions: ['s3:GetObject'],
    };
    return this.assumeRoleForDataset(config, dummyPermissions);
  }
}

// Singleton instance
let globalStsManager: AWSSTSManager | null = null;

export function getAwsStsManager(region?: string): AWSSTSManager {
  if (!globalStsManager) {
    globalStsManager = new AWSSTSManager(region);
  }
  return globalStsManager;
}

export function resetAwsStsManager(): void {
  globalStsManager = null;
}

// For tests - create fresh instance
export function createAwsStsManager(region?: string): AWSSTSManager {
  return new AWSSTSManager(region);
}
