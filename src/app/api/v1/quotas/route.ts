import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }

    // For now, return mock quota data
    // In production, this would fetch from database based on tenant
    return NextResponse.json({
      quotas: {
        storage: { limit: 1000000000000, used: 50000000000 }, // 1TB limit, 50GB used
        compute: { limit: 1000, used: 120 }, // 1000 hours limit, 120 used
        apiCalls: { limit: 1000000, used: 50000 }, // 1M calls limit, 50K used
      },
      usage: {
        storageBytes: 50000000000,
        computeHours: 120,
        apiCalls: 50000,
      }
    }, { status: 200 });
  } catch (error) {
    console.error('Error fetching quotas:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
