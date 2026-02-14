import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { CloudProvider } from '@prisma/client';
import { oauthStateService } from '@/lib/services/oauth-state.service';

const OAUTH_CONFIGS = {
  AWS_S3: {
    authUrl: 'https://signin.aws.amazon.com/oauth',
    clientId: process.env.AWS_OAUTH_CLIENT_ID,
    scope: 's3:ListBucket s3:GetObject s3:PutObject',
  },
  GCS: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: process.env.GCS_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write https://www.googleapis.com/auth/cloud-platform',
  },
  AZURE_BLOB: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    clientId: process.env.AZURE_CLIENT_ID,
    scope: 'https://storage.azure.com/user_impersonation',
  },
  SNOWFLAKE: {
    authUrl: process.env.SNOWFLAKE_ACCOUNT_URL + '/oauth/authorize',
    clientId: process.env.SNOWFLAKE_CLIENT_ID,
    scope: 'session:role:accountadmin',
  },
  BIGQUERY: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: process.env.GCS_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/bigquery https://www.googleapis.com/auth/cloud-platform',
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider: providerParam } = await params;
    const provider = providerParam.toUpperCase() as CloudProvider;
    const config = OAUTH_CONFIGS[provider];

    if (!config || !config.clientId) {
      return NextResponse.json(
        { error: 'Provider not configured' },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const redirectPath = searchParams.get('redirect') || '/xase/data-holder/connectors';
    const tenantId = searchParams.get('tenantId');
    const projectId = searchParams.get('projectId') || undefined;
    const name = searchParams.get('name') || undefined;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID required' },
        { status: 400 }
      );
    }

    const state = await oauthStateService.createState({
      tenantId,
      provider,
      redirectPath,
      metadata: {
        ...(projectId ? { projectId } : {}),
        ...(name ? { name } : {}),
      },
    });

    const callbackUrl = `${process.env.NEXTAUTH_URL}/api/oauth/${provider.toLowerCase()}/callback`;

    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error('OAuth authorize error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    );
  }
}
