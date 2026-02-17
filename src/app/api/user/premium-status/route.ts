import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ isPremium: false }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { 
        tenant: {
          select: { plan: true }
        }
      }
    });

    const isPremium = user?.tenant ? user.tenant.plan !== 'sandbox' : false;
    return NextResponse.json({ isPremium });
  } catch (error) {
    console.error('Error fetching premium status:', error);
    return NextResponse.json({ isPremium: false }, { status: 500 });
  }
} 