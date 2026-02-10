/**
 * XASE CORE - Checkpoints API (Removed)
 *
 * GET /api/xase/v1/checkpoints - Feature removed
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      error: 'Checkpoints feature has been removed',
      checkpoints: [],
      pagination: { page: 1, limit: 0, total: 0, pages: 0 },
    },
    { status: 410 }
  );
}
