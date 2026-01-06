/**
 * XASE CORE - Checkpoint Cron Endpoint (Removed)
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Checkpoints feature has been removed' },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      service: 'Xase Checkpoint Cron',
      status: 'removed',
      endpoint: 'POST /api/xase/v1/cron/checkpoint',
    },
    { status: 410 }
  );
}
