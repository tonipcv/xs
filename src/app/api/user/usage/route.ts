import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/auth.config';
import { getUserUsage } from '@/lib/usage';

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const usage = await getUserUsage(session.user.id);
    
    return NextResponse.json(usage);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
      { status: 500 }
    );
  }
}
