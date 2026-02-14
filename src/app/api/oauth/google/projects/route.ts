import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { oauthStateService } from '@/lib/services/oauth-state.service';

async function refreshGoogleToken(refreshToken: string, clientId?: string, clientSecret?: string) {
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId || process.env.GCS_CLIENT_ID!,
    client_secret: clientSecret || process.env.GCS_CLIENT_SECRET!,
  });
  const resp = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to refresh token: ${text}`);
  }
  const data = await resp.json();
  return data.access_token as string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const state = searchParams.get('state');
    if (!state) {
      return NextResponse.json({ error: 'Missing state' }, { status: 400 });
    }

    const st = await oauthStateService.getState(state);
    if (!st.valid || !st.tenantId || !st.provider) {
      return NextResponse.json({ error: 'Invalid or expired state' }, { status: 400 });
    }

    // Only allow for Google providers
    if (!(st.provider === 'GCS' || st.provider === 'BIGQUERY')) {
      return NextResponse.json({ error: 'Unsupported provider for project listing' }, { status: 400 });
    }

    const oauth = st.metadata?.oauth as { accessToken?: string; refreshToken?: string } | undefined;
    if (!oauth?.accessToken) {
      return NextResponse.json({ error: 'Missing OAuth access token in state' }, { status: 400 });
    }

    let accessToken = oauth.accessToken;

    const list = async (token: string) => {
      const url = 'https://cloudresourcemanager.googleapis.com/v1/projects';
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return resp;
    };

    let resp = await list(accessToken);
    if (resp.status === 401 && oauth.refreshToken) {
      try {
        accessToken = await refreshGoogleToken(oauth.refreshToken);
        await oauthStateService.updateStateMetadata(state, { ...st.metadata, oauth: { ...oauth, accessToken } });
        resp = await list(accessToken);
      } catch (e) {
        // fallthrough, return original 401 if refresh fails
      }
    }

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || `Failed to list projects (${resp.status})` }, { status: resp.status });
    }

    const data = await resp.json();
    const items = Array.isArray(data.projects) ? data.projects : [];
    const projects = items.map((p: any) => ({
      projectId: p.projectId,
      displayName: p.name,
      state: p.state,
    }));

    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error('List projects error:', error);
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}
