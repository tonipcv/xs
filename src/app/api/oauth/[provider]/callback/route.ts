import { NextRequest, NextResponse } from 'next/server';
import { CloudProvider } from '@prisma/client';
import { oauthStateService } from '@/lib/services/oauth-state.service';
import { cloudIntegrationService } from '@/lib/services/cloud-integration.service';

const OAUTH_CONFIGS = {
  AWS_S3: {
    tokenUrl: 'https://signin.aws.amazon.com/oauth/token',
    clientId: process.env.AWS_OAUTH_CLIENT_ID,
    clientSecret: process.env.AWS_OAUTH_CLIENT_SECRET,
  },
  GCS: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GCS_CLIENT_ID,
    clientSecret: process.env.GCS_CLIENT_SECRET,
  },
  AZURE_BLOB: {
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
  SNOWFLAKE: {
    tokenUrl: process.env.SNOWFLAKE_ACCOUNT_URL + '/oauth/token-request',
    clientId: process.env.SNOWFLAKE_CLIENT_ID,
    clientSecret: process.env.SNOWFLAKE_CLIENT_SECRET,
  },
  BIGQUERY: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GCS_CLIENT_ID,
    clientSecret: process.env.GCS_CLIENT_SECRET,
  },
};

async function exchangeCodeForToken(
  provider: CloudProvider,
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}> {
  const config = OAUTH_CONFIGS[provider];
  if (!config) {
    throw new Error('Provider not configured');
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId!,
      client_secret: config.clientSecret!,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/xase/data-holder/connectors?error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: 'Missing code or state' },
        { status: 400 }
      );
    }

    const stateValidation = await oauthStateService.validateAndConsume(state);
    if (!stateValidation.valid) {
      return NextResponse.json(
        { error: 'Invalid or expired state' },
        { status: 400 }
      );
    }

    const { provider: providerParam } = await params;
    const provider = providerParam.toUpperCase() as CloudProvider;
    const callbackUrl = `${process.env.NEXTAUTH_URL}/api/oauth/${provider.toLowerCase()}/callback`;

    const tokens = await exchangeCodeForToken(provider, code, callbackUrl);

    const nameFromState = (stateValidation.metadata?.name as string | undefined)?.trim();
    const integrationName = nameFromState && nameFromState.length > 0
      ? nameFromState
      : `${provider} Integration ${new Date().toLocaleDateString()}`;

    // ProjectId handling for Google providers using OAuth
    const projectIdFromState = stateValidation.metadata?.projectId as string | undefined;
    if ((provider === 'GCS' || provider === 'BIGQUERY')) {
      const isOAuthAccessToken = typeof tokens.accessToken === 'string' && tokens.accessToken.startsWith('ya29.');
      if (isOAuthAccessToken && !projectIdFromState) {
        // No projectId provided: create a temporary state carrying tokens and redirect to Project Picker
        const pickerState = await oauthStateService.createState({
          tenantId: stateValidation.tenantId!,
          provider,
          redirectPath: stateValidation.redirectPath || '/xase/data-holder/connectors',
          metadata: {
            oauth: {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              scope: tokens.scope,
              // optional timestamp for reference
              createdAt: Date.now(),
            },
          },
        });

        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/xase/data-holder/gcp-project-picker?state=${encodeURIComponent(pickerState)}&provider=${provider}`
        );
      }
    }

    await cloudIntegrationService.createIntegration({
      tenantId: stateValidation.tenantId!,
      name: integrationName,
      provider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      scopes: tokens.scope?.split(' '),
      metadata: projectIdFromState ? { projectId: projectIdFromState } : undefined,
    });

    const redirectPath = stateValidation.redirectPath || '/xase/data-holder/connectors';
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}${redirectPath}?success=true&provider=${provider}`
    );
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/xase/data-holder/connectors?error=${encodeURIComponent(error.message)}`
    );
  }
}
