import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { oauthStateService } from '@/lib/services/oauth-state.service';
import { cloudIntegrationService } from '@/lib/services/cloud-integration.service';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { state, projectId } = body || {};

    if (!state || !projectId) {
      return NextResponse.json({ error: 'Missing state or projectId' }, { status: 400 });
    }

    const st = await oauthStateService.getState(state);
    if (!st.valid || !st.tenantId || !st.provider) {
      return NextResponse.json({ error: 'Invalid or expired state' }, { status: 400 });
    }

    if (!(st.provider === 'GCS' || st.provider === 'BIGQUERY')) {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    }

    const oauth = st.metadata?.oauth as { accessToken?: string; refreshToken?: string; scope?: string } | undefined;
    if (!oauth?.accessToken) {
      return NextResponse.json({ error: 'Missing OAuth tokens in state' }, { status: 400 });
    }

    const name = `${st.provider} Integration ${new Date().toLocaleDateString()}`;

    await cloudIntegrationService.createIntegration({
      tenantId: st.tenantId,
      name,
      provider: st.provider,
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      scopes: oauth.scope?.split(' '),
      metadata: { projectId },
    });

    await oauthStateService.deleteState(state);

    const redirectPath = st.redirectPath || '/app/datasets/browse';
    const redirectUrl = `${process.env.NEXTAUTH_URL}${redirectPath}?success=true&provider=${st.provider}`;

    return NextResponse.json({ ok: true, redirectUrl });
  } catch (error: any) {
    console.error('Select project error:', error);
    return NextResponse.json({ error: 'Failed to select project' }, { status: 500 });
  }
}
