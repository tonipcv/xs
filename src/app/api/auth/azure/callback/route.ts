/**
 * Azure AD OAuth Callback
 * Handle OAuth callback from Azure AD
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForToken,
  getAzureUserInfo,
  createOrUpdateUserFromAzure,
  logAzureOAuthEvent,
} from '@/lib/auth/azure-oauth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/auth/error?error=${error}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/auth/error?error=missing_code', request.url)
      );
    }

    // Verify state to prevent CSRF
    // In production, validate state against stored value

    const config = {
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      redirectUri: `${process.env.NEXTAUTH_URL}/api/auth/azure/callback`,
    };

    // Exchange code for token
    const tokenResponse = await exchangeCodeForToken(config, code);

    // Get user info from Microsoft Graph
    const azureUser = await getAzureUserInfo(tokenResponse.access_token);

    // Create or update user in database
    const user = await createOrUpdateUserFromAzure(
      azureUser,
      tokenResponse.access_token
    );

    // Log OAuth event
    await logAzureOAuthEvent(user.id, 'AZURE_OAUTH_LOGIN', {
      azureId: azureUser.id,
      email: azureUser.mail || azureUser.userPrincipalName,
      timestamp: new Date(),
    });

    // Set session cookie
    // In production, use proper session management

    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error: any) {
    console.error('Azure OAuth callback error:', error);
    return NextResponse.redirect(
      new URL(`/auth/error?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}
