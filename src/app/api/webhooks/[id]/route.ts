/**
 * Webhook Management API - Individual Webhook Operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

/**
 * GET /api/webhooks/:id
 * Get a specific webhook
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const webhook = await prisma.webhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ webhook });
  } catch (error: any) {
    console.error('Error fetching webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/webhooks/:id
 * Update a webhook
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const webhook = await prisma.webhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { url, events, isActive, description } = body;

    // Validate URL if provided
    if (url) {
      try {
        new URL(url);
      } catch {
        return NextResponse.json(
          { error: 'Invalid URL format' },
          { status: 400 }
        );
      }
    }

    // Validate events if provided
    if (events) {
      const validEvents = [
        'policy.created',
        'policy.revoked',
        'policy.updated',
        'consent.revoked',
        'consent.granted',
        'lease.issued',
        'lease.expired',
        'lease.expiring_soon',
        'lease.revoked',
        'billing.threshold_exceeded',
        'billing.payment_succeeded',
        'billing.payment_failed',
        'dataset.published',
        'dataset.updated',
        'dataset.deleted',
        'access.requested',
        'access.granted',
        'access.denied',
      ];

      const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        return NextResponse.json(
          { error: `Invalid event types: ${invalidEvents.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Update webhook
    const updatedWebhook = await prisma.webhook.update({
      where: { id: params.id },
      data: {
        ...(url && { url }),
        ...(events && { events }),
        ...(typeof isActive === 'boolean' && { isActive }),
        ...(description !== undefined && { description }),
      },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        action: 'WEBHOOK_UPDATED',
        resourceType: 'webhook',
        resourceId: params.id,
        metadata: JSON.stringify(body),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return NextResponse.json({ webhook: updatedWebhook });
  } catch (error: any) {
    console.error('Error updating webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const webhook = await prisma.webhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    await prisma.webhook.delete({
      where: { id: params.id },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        action: 'WEBHOOK_DELETED',
        resourceType: 'webhook',
        resourceId: params.id,
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
