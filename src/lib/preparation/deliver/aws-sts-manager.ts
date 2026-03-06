/**
 * AWS STS Integration for Temporary Credentials
 * Provides least-privilege access with short TTL
 */

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
  policy?: string; // IAM policy JSON for further restriction
}

export interface ScopedPermissions {
  bucket: string;
  prefix: string;
  actions: Array<'s3:GetObject' | 's3:ListBucket' | 's3:PutObject'>;
}

export class AWSSTSManager {
  private region: string;

  constructor(region: string = 'us-east-1') {
    this.region = region;
  }

  /**
   * Assume role with least privilege for dataset access
   */
  async assumeRoleForDataset(
    config: STSAssumeRoleConfig,
    permissions: ScopedPermissions
  ): Promise<STSCredentials> {
    // In production, this calls AWS STS AssumeRole API
    // For now, return simulated credentials
    const expiration = new Date(Date.now() + config.durationSeconds * 1000);
    
    return {
      accessKeyId: `ASIA${this.generateRandom(16)}`,
      secretAccessKey: this.generateRandom(40),
      sessionToken: this.generateSessionToken(config.sessionName, expiration),
      expiration,
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
    
    const permissions: ScopedPermissions = {
      bucket: `xase-prepared-datasets-${this.region}`,
      prefix: `${datasetId}/${leaseId}/`,
      actions: ['s3:GetObject', 's3:ListBucket'],
    };

    const config: STSAssumeRoleConfig = {
      roleArn: `arn:aws:iam::123456789012:role/xase-dataset-access`,
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
    
    const permissions: ScopedPermissions = {
      bucket: `xase-sidecar-delivery-${this.region}`,
      prefix: `${patientToken}/`,
      actions: ['s3:GetObject'],
    };

    const config: STSAssumeRoleConfig = {
      roleArn: `arn:aws:iam::123456789012:role/xase-sidecar-streaming`,
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
    return new Date() < credentials.expiration;
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
   * Generate signed URL for direct S3 access
   */
  async generateSignedUrl(
    bucket: string,
    key: string,
    credentials: STSCredentials,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    // In production, use AWS SDK to generate signed URL
    const token = Buffer.from(JSON.stringify({
      bucket,
      key,
      accessKey: credentials.accessKeyId,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    })).toString('base64');

    return `https://${bucket}.s3.amazonaws.com/${key}?X-Amz-SignedHeaders=host&X-Amz-Signature=${token}`;
  }

  private generateRandom(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateSessionToken(sessionName: string, expiration: Date): string {
    const data = `${sessionName}:${expiration.toISOString()}`;
    return Buffer.from(data).toString('base64').substring(0, 400);
  }
}
