/**
 * Webhooks Management API
 * Endpoints for creating, listing, and managing webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

/**
 * GET /api/webhooks
 * List all webhooks for the authenticated tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get tenant ID from session
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

    const webhooks = await prisma.webhook.findMany({
      where: {
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
        // Don't expose secret
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ webhooks });
  } catch (error: any) {
    console.error('Error fetching webhooks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webhooks
 * Create a new webhook
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { url, events, description } = body;

    // Validate input
    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'URL and events are required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Validate event types
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

    // Generate webhook secret
    const secret = crypto.randomBytes(32).toString('hex');

    // Create webhook
    const webhook = await prisma.webhook.create({
      data: {
        tenantId: user.tenantId,
        url,
        secret,
        events,
        description,
        isActive: true,
      },
      select: {
        id: true,
        url: true,
        secret: true, // Return secret only on creation
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
        action: 'WEBHOOK_CREATED',
        resourceType: 'webhook',
        resourceId: webhook.id,
        metadata: JSON.stringify({ url, events }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating webhook:', error);
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
export async function DELETE(request: NextRequest) {
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

    const url = new URL(request.url);
    const webhookId = url.pathname.split('/').pop();

    if (!webhookId) {
      return NextResponse.json(
        { error: 'Webhook ID required' },
        { status: 400 }
      );
    }

    // Verify webhook belongs to tenant
    const webhook = await prisma.webhook.findFirst({
      where: {
        id: webhookId,
        tenantId: user.tenantId,
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Delete webhook (cascade will delete deliveries)
    await prisma.webhook.delete({
      where: { id: webhookId },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        action: 'WEBHOOK_DELETED',
        resourceType: 'webhook',
        resourceId: webhookId,
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
