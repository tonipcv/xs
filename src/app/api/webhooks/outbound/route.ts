/**
 * Outbound Webhooks API
 * Manage external webhook integrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  registerWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  getWebhookStats,
} from '@/lib/webhooks/outbound-webhooks';

/**
 * GET /api/webhooks/outbound
 * List all webhooks
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get('id');

    if (webhookId) {
      const stats = await getWebhookStats(webhookId);
      return NextResponse.json({ stats });
    }

    const webhooks = await listWebhooks();
    return NextResponse.json({ webhooks });
  } catch (error: any) {
    console.error('Error fetching webhooks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch webhooks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webhooks/outbound
 * Register new webhook
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { url, events, headers, retryConfig } = body;

    if (!url || !events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: 'Missing required fields: url, events' },
        { status: 400 }
      );
    }

    const webhook = await registerWebhook({
      url,
      events,
      active: true,
      headers,
      retryConfig,
    });

    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error: any) {
    console.error('Error registering webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to register webhook' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/webhooks/outbound
 * Update webhook
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    const webhook = await updateWebhook(id, updates);

    return NextResponse.json({ webhook });
  } catch (error: any) {
    console.error('Error updating webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update webhook' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/webhooks/outbound
 * Delete webhook
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    await deleteWebhook(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}
