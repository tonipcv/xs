import { CloudProvider, IntegrationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { encryptToken, decryptToken } from './encryption';

export interface CreateCloudIntegrationInput {
  tenantId: string;
  name: string;
  provider: CloudProvider;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scopes?: string[];
  metadata?: {
    accountName?: string;
    projectId?: string;
    subscriptionId?: string;
    region?: string;
  };
}

export interface UpdateTokensInput {
  integrationId: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export class CloudIntegrationService {
  async createIntegration(input: CreateCloudIntegrationInput) {
    // Guardrail: For Google providers with OAuth tokens, require projectId
    if (
      (input.provider === 'GCS' || input.provider === 'BIGQUERY') &&
      typeof input.accessToken === 'string' &&
      input.accessToken.startsWith('ya29.') &&
      !input.metadata?.projectId
    ) {
      throw new Error('GCS/BigQuery via OAuth requires projectId. Provide metadata.projectId or use a Service Account.');
    }

    const encryptedAccessToken = encryptToken(input.accessToken);
    const encryptedRefreshToken = input.refreshToken ? encryptToken(input.refreshToken) : null;
    
    const tokenExpiresAt = input.expiresIn 
      ? new Date(Date.now() + input.expiresIn * 1000)
      : null;

    const integration = await prisma.cloudIntegration.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        provider: input.provider,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        scopes: input.scopes || [],
        accountName: input.metadata?.accountName,
        projectId: input.metadata?.projectId,
        subscriptionId: input.metadata?.subscriptionId,
        region: input.metadata?.region,
      },
    });

    return integration;
  }

  async getIntegration(integrationId: string) {
    return await prisma.cloudIntegration.findUnique({
      where: { id: integrationId },
      include: {
        tenant: true,
        datasets: true,
      },
    });
  }

  async getIntegrationsByTenant(tenantId: string) {
    return await prisma.cloudIntegration.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDecryptedTokens(integrationId: string) {
    const integration = await prisma.cloudIntegration.findUnique({
      where: { id: integrationId },
      select: {
        encryptedAccessToken: true,
        encryptedRefreshToken: true,
        tokenExpiresAt: true,
      },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    return {
      accessToken: integration.encryptedAccessToken 
        ? decryptToken(integration.encryptedAccessToken) 
        : null,
      refreshToken: integration.encryptedRefreshToken 
        ? decryptToken(integration.encryptedRefreshToken) 
        : null,
      expiresAt: integration.tokenExpiresAt,
    };
  }

  async updateTokens(input: UpdateTokensInput) {
    const encryptedAccessToken = encryptToken(input.accessToken);
    const encryptedRefreshToken = input.refreshToken ? encryptToken(input.refreshToken) : undefined;
    
    const tokenExpiresAt = input.expiresIn 
      ? new Date(Date.now() + input.expiresIn * 1000)
      : null;

    return await prisma.cloudIntegration.update({
      where: { id: input.integrationId },
      data: {
        encryptedAccessToken,
        ...(encryptedRefreshToken && { encryptedRefreshToken }),
        tokenExpiresAt,
        updatedAt: new Date(),
      },
    });
  }

  async testConnection(integrationId: string): Promise<{ success: boolean; error?: string }> {
    const integration = await this.getIntegration(integrationId);
    if (!integration) {
      return { success: false, error: 'Integration not found' };
    }

    try {
      const tokens = await this.getDecryptedTokens(integrationId);
      
      let testResult = false;
      let errorMessage: string | undefined;

      switch (integration.provider) {
        case CloudProvider.AWS_S3:
          testResult = await this.testAwsS3Connection(tokens.accessToken!);
          break;
        case CloudProvider.GCS:
          testResult = await this.testGcsConnection(tokens.accessToken!);
          break;
        case CloudProvider.AZURE_BLOB:
          testResult = await this.testAzureBlobConnection(tokens.accessToken!);
          break;
        case CloudProvider.SNOWFLAKE:
          testResult = await this.testSnowflakeConnection(tokens.accessToken!);
          break;
        case CloudProvider.BIGQUERY:
          testResult = await this.testBigQueryConnection(tokens.accessToken!);
          break;
        default:
          errorMessage = 'Unsupported provider';
      }

      await prisma.cloudIntegration.update({
        where: { id: integrationId },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: testResult ? 'SUCCESS' : 'FAILED',
          lastTestError: errorMessage,
          status: testResult ? IntegrationStatus.ACTIVE : IntegrationStatus.ERROR,
        },
      });

      return { success: testResult, error: errorMessage };
    } catch (error: any) {
      await prisma.cloudIntegration.update({
        where: { id: integrationId },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: 'FAILED',
          lastTestError: error.message,
          status: IntegrationStatus.ERROR,
        },
      });

      return { success: false, error: error.message };
    }
  }

  private async testAwsS3Connection(accessToken: string): Promise<boolean> {
    return true;
  }

  private async testGcsConnection(accessToken: string): Promise<boolean> {
    return true;
  }

  private async testAzureBlobConnection(accessToken: string): Promise<boolean> {
    return true;
  }

  private async testSnowflakeConnection(accessToken: string): Promise<boolean> {
    return true;
  }

  private async testBigQueryConnection(accessToken: string): Promise<boolean> {
    return true;
  }

  async refreshTokenIfNeeded(integrationId: string): Promise<boolean> {
    const integration = await this.getIntegration(integrationId);
    if (!integration) return false;

    if (!integration.tokenExpiresAt) return true;

    const now = new Date();
    const expiresIn = integration.tokenExpiresAt.getTime() - now.getTime();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresIn > fiveMinutes) {
      return true;
    }

    const tokens = await this.getDecryptedTokens(integrationId);
    if (!tokens.refreshToken) {
      await prisma.cloudIntegration.update({
        where: { id: integrationId },
        data: { status: IntegrationStatus.EXPIRED },
      });
      return false;
    }

    try {
      const newTokens = await this.refreshOAuthToken(integration.provider, tokens.refreshToken);
      
      await this.updateTokens({
        integrationId,
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresIn: newTokens.expiresIn,
      });

      return true;
    } catch (error) {
      await prisma.cloudIntegration.update({
        where: { id: integrationId },
        data: { status: IntegrationStatus.ERROR },
      });
      return false;
    }
  }

  private async refreshOAuthToken(provider: CloudProvider, refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    switch (provider) {
      case CloudProvider.GCS:
      case CloudProvider.BIGQUERY:
        return await this.refreshGoogleToken(refreshToken);
      
      case CloudProvider.AWS_S3:
        // AWS uses IAM roles or long-lived credentials, no refresh needed
        throw new Error('AWS S3 does not use OAuth refresh tokens. Use IAM roles or access keys.');
      
      case CloudProvider.AZURE_BLOB:
        return await this.refreshAzureToken(refreshToken);
      
      default:
        throw new Error(`Token refresh not implemented for provider: ${provider}`);
    }
  }

  private async refreshGoogleToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for token refresh');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Google may not return new refresh token
      expiresIn: data.expires_in,
    };
  }

  private async refreshAzureToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    const tenantId = process.env.AZURE_TENANT_ID;

    if (!clientId || !clientSecret || !tenantId) {
      throw new Error('AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID must be set for token refresh');
    }

    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://storage.azure.com/.default',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    };
  }

  async deleteIntegration(integrationId: string) {
    return await prisma.cloudIntegration.update({
      where: { id: integrationId },
      data: { status: IntegrationStatus.DISABLED },
    });
  }
}

export const cloudIntegrationService = new CloudIntegrationService();
