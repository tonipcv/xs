export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { validateApiKey } from '@/lib/xase/auth';

export async function GET(request: NextRequest) {
  try {
    // Try API key auth first
    const apiKey = request.headers.get('x-api-key') || '';
    const auth = await validateApiKey(apiKey);
    
    let userEmail: string | null = null;
    
    if (auth.valid && auth.tenantId) {
      // Find user by tenantId from API key
      const user = await prisma.user.findFirst({
        where: { tenantId: auth.tenantId },
        select: { email: true },
      });
      userEmail = user?.email || null;
    }
    
    // Fall back to session auth
    if (!userEmail) {
      const session = await getServerSession();
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userEmail = session.user.email;
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        name: true,
        email: true,
        tenantId: true,
        xaseRole: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error(`Get user error: ${error?.message || String(error)}`);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}
