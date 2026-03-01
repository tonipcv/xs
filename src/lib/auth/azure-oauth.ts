/**
 * Azure AD OAuth Integration
 * Complete Azure Active Directory authentication
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AzureOAuthConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
}

export interface AzureTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
}

export interface AzureUserInfo {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  jobTitle?: string;
  officeLocation?: string;
}

/**
 * Get Azure AD authorization URL
 */
export function getAzureAuthorizationUrl(config: AzureOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    state,
  });

  return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  config: AzureOAuthConfig,
  code: string
): Promise<AzureTokenResponse> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for token: ${error}`);
  }

  return await response.json();
}

/**
 * Get user information from Microsoft Graph API
 */
export async function getAzureUserInfo(accessToken: string): Promise<AzureUserInfo> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get user info: ${error}`);
  }

  return await response.json();
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  config: AzureOAuthConfig,
  refreshToken: string
): Promise<AzureTokenResponse> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return await response.json();
}

/**
 * Revoke access token
 */
export async function revokeAccessToken(
  config: AzureOAuthConfig,
  token: string
): Promise<void> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    token,
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/logout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to revoke token: ${error}`);
  }
}

/**
 * Validate Azure AD token
 */
export async function validateAzureToken(
  config: AzureOAuthConfig,
  token: string
): Promise<boolean> {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Create or update user from Azure AD
 */
export async function createOrUpdateUserFromAzure(
  azureUser: AzureUserInfo,
  accessToken: string
): Promise<any> {
  const existingUser = await prisma.user.findUnique({
    where: { email: azureUser.mail || azureUser.userPrincipalName },
  });

  if (existingUser) {
    // Update existing user
    return await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        name: azureUser.displayName,
        updatedAt: new Date(),
      },
    });
  } else {
    // Create new user
    return await prisma.user.create({
      data: {
        email: azureUser.mail || azureUser.userPrincipalName,
        name: azureUser.displayName,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Log Azure OAuth event
 */
export async function logAzureOAuthEvent(
  userId: string,
  action: string,
  metadata: any
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action,
      resourceType: 'oauth',
      resourceId: userId,
      userId,
      metadata: JSON.stringify(metadata),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });
}
