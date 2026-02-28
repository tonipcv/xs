/**
 * Cron Job: Lease Expiration Alerts
 * Sends email notifications for leases expiring in 30 minutes and 5 minutes
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendLeaseExpiringEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    const thirtyFiveMinutesFromNow = new Date(now.getTime() + 35 * 60 * 1000);
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    const leases30Min = await prisma.accessLease.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          gte: thirtyMinutesFromNow,
          lte: thirtyFiveMinutesFromNow,
        },
        alert30minSent: false,
        deletedAt: null,
      },
      include: {
        dataset: {
          select: {
            name: true,
            tenant: {
              include: {
                users: {
                  select: {
                    email: true,
                    name: true,
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    const leases5Min = await prisma.accessLease.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          gte: fiveMinutesFromNow,
          lte: tenMinutesFromNow,
        },
        alert5minSent: false,
        deletedAt: null,
      },
      include: {
        dataset: {
          select: {
            name: true,
            tenant: {
              include: {
                users: {
                  select: {
                    email: true,
                    name: true,
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    const results = {
      sent30Min: 0,
      sent5Min: 0,
      failed: 0,
    };

    for (const lease of leases30Min) {
      const user = lease.dataset.tenant.users[0];
      if (!user) continue;

      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                       process.env.NEXTAUTH_URL || 
                       'https://xase.ai';
        
        await sendLeaseExpiringEmail(
          user.email,
          {
            name: user.name || 'User',
            leaseId: lease.id,
            datasetName: lease.dataset.name,
            expiresAt: lease.expiresAt.toISOString(),
            timeRemaining: '30 minutes',
            renewUrl: `${baseUrl}/dashboard/leases/${lease.id}/renew`,
          },
          '30min'
        );

        await prisma.accessLease.update({
          where: { id: lease.id },
          data: { alert30minSent: true },
        });

        results.sent30Min++;
      } catch (error) {
        console.error(`Failed to send 30min alert for lease ${lease.id}:`, error);
        results.failed++;
      }
    }

    for (const lease of leases5Min) {
      const user = lease.dataset.tenant.users[0];
      if (!user) continue;

      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                       process.env.NEXTAUTH_URL || 
                       'https://xase.ai';
        
        await sendLeaseExpiringEmail(
          user.email,
          {
            name: user.name || 'User',
            leaseId: lease.id,
            datasetName: lease.dataset.name,
            expiresAt: lease.expiresAt.toISOString(),
            timeRemaining: '5 minutes',
            renewUrl: `${baseUrl}/dashboard/leases/${lease.id}/renew`,
          },
          '5min'
        );

        await prisma.accessLease.update({
          where: { id: lease.id },
          data: { alert5minSent: true },
        });

        results.sent5Min++;
      } catch (error) {
        console.error(`Failed to send 5min alert for lease ${lease.id}:`, error);
        results.failed++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    });
  } catch (error) {
    console.error('Lease expiration alerts cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
