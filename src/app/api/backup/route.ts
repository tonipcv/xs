/**
 * Backup Management API
 * Create, restore, and manage backups
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { 
  createFullBackup, 
  createIncrementalBackup,
  listBackups,
  verifyBackup,
  cleanupOldBackups 
} from '@/lib/backup/backup-service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/backup
 * List all backups
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        xaseRole: true,
      },
    });

    // Only owners can manage backups
    if (user?.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only owners can manage backups.' },
        { status: 403 }
      );
    }

    const backups = await listBackups();

    return NextResponse.json({
      backups,
      total: backups.length,
    });
  } catch (error: any) {
    console.error('Error listing backups:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/backup
 * Create a new backup
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        xaseRole: true,
      },
    });

    if (user?.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { type = 'full' } = body;

    let backup;
    
    if (type === 'incremental') {
      const backups = await listBackups();
      const lastBackup = backups[0];
      
      if (!lastBackup) {
        return NextResponse.json(
          { error: 'No previous backup found. Create a full backup first.' },
          { status: 400 }
        );
      }

      backup = await createIncrementalBackup(lastBackup.timestamp);
    } else {
      backup = await createFullBackup();
    }

    return NextResponse.json({
      success: true,
      backup,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating backup:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/backup
 * Cleanup old backups
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        xaseRole: true,
      },
    });

    if (user?.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const retentionDays = parseInt(url.searchParams.get('retentionDays') || '30');

    const deletedCount = await cleanupOldBackups(retentionDays);

    return NextResponse.json({
      success: true,
      deletedCount,
      retentionDays,
    });
  } catch (error: any) {
    console.error('Error cleaning up backups:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
