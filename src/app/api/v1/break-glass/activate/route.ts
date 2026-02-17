import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { 
        id: true, 
        tenantId: true,
        email: true,
        role: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Admin role required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { reason, duration } = body;

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json(
        { error: 'Reason is required' },
        { status: 400 }
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (duration || 1));

    const breakGlassSession = await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'BREAK_GLASS_ACTIVATED',
        resourceType: 'EMERGENCY_ACCESS',
        resourceId: `bg-${Date.now()}`,
        metadata: {
          reason,
          duration: duration || 1,
          expiresAt: expiresAt.toISOString(),
          userEmail: user.email,
        },
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: breakGlassSession.id,
      expiresAt: expiresAt.toISOString(),
      message: 'Break-glass emergency access activated',
    });
  } catch (error) {
    console.error('Break-glass activation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
