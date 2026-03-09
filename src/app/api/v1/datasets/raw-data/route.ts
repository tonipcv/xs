import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }

    // Raw data endpoint should not exist - return 404
    // This endpoint is intentionally disabled for security
    // All data access must go through prepared data leases
    return NextResponse.json(
      { error: 'Raw data access disabled. Use prepared data via leases.' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error in raw-data endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
