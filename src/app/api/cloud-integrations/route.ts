// @ts-nocheck
export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cloudIntegrationService } from '@/lib/services/cloud-integration.service';
import { prisma } from '@/lib/prisma';
import { CloudProvider } from '@prisma/client';
import { encryptToken } from '@/lib/services/encryption';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const integrations = await cloudIntegrationService.getIntegrationsByTenant(user.tenantId);

    const sanitizedIntegrations = integrations.map(integration => ({
      id: integration.id,
      name: integration.name,
      provider: integration.provider,
      status: integration.status,
      scopes: integration.scopes,
      accountName: integration.accountName,
      projectId: integration.projectId,
      subscriptionId: integration.subscriptionId,
      region: integration.region,
      lastTestedAt: integration.lastTestedAt,
      lastTestStatus: integration.lastTestStatus,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    }));

    return NextResponse.json({ integrations: sanitizedIntegrations });
  } catch (error: any) {
    console.error('Get integrations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const body = await request.json();
    const provider = (body.provider || '').toUpperCase() as CloudProvider;
    const name = (body.name || '').trim() || `${provider} Integration`;

    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }

    // Minimal AWS_S3 support with access keys
    if (provider === 'AWS_S3') {
      const accessKeyId = (body.accessKeyId || '').trim();
      const secretAccessKey = (body.secretAccessKey || '').trim();
      const region = (body.region || '').trim() || 'us-east-1';
      if (!accessKeyId || !secretAccessKey) {
        return NextResponse.json({ error: 'accessKeyId and secretAccessKey are required' }, { status: 400 });
      }

      const credentialsJson = JSON.stringify({ accessKeyId, secretAccessKey });
      const integration = await prisma.cloudIntegration.create({
        data: {
          tenantId: user.tenantId,
          name,
          provider,
          encryptedAccessToken: encryptToken(credentialsJson),
          scopes: [],
          region,
          status: 'ACTIVE',
        },
      });

      return NextResponse.json({ id: integration.id });
    }

    // Fallback to service for other providers (expects appropriate fields)
    const result = await cloudIntegrationService.createIntegration({
      tenantId: user.tenantId,
      name,
      provider,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresIn: body.expiresIn,
      scopes: body.scopes,
      metadata: {
        accountName: body.accountName,
        projectId: body.projectId,
        subscriptionId: body.subscriptionId,
        region: body.region,
      },
    });

    return NextResponse.json({ id: result.id });
  } catch (error: any) {
    console.error('Create integration error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create integration' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get('id');

    if (!integrationId) {
      return NextResponse.json(
        { error: 'Integration ID required' },
        { status: 400 }
      );
    }

    await cloudIntegrationService.deleteIntegration(integrationId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete integration error:', error);
    return NextResponse.json(
      { error: 'Failed to delete integration' },
      { status: 500 }
    );
  }
}
