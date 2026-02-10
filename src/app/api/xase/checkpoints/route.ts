import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      error: 'Checkpoints feature has been removed',
      checkpoints: [],
      total: 0,
      hasMore: false,
      nextCursor: null,
    },
    { status: 410 }
  );
}
