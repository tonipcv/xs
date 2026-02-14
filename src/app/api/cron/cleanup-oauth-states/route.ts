import { NextRequest, NextResponse } from 'next/server';
import { oauthStateService } from '@/lib/services/oauth-state.service';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.XASE_CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deletedCount = await oauthStateService.cleanupExpiredStates();

    return NextResponse.json({
      success: true,
      deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('OAuth state cleanup error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed', message: error.message },
      { status: 500 }
    );
  }
}
