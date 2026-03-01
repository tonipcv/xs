/**
 * GDPR Article 17 - Right to Erasure (Right to be Forgotten)
 * Deletes all personal data for a user
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

/**
 * POST /api/compliance/gdpr/erasure
 * Request deletion of all personal data
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
        id: true,
        email: true,
        tenantId: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { confirmEmail, reason } = body;

    // Require email confirmation
    if (confirmEmail !== user.email) {
      return NextResponse.json(
        { error: 'Email confirmation does not match' },
        { status: 400 }
      );
    }

    const erasureId = `erasure_${Date.now()}`;

    // Log the erasure request before deletion
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'GDPR_ERASURE_REQUESTED',
        resourceType: 'user',
        resourceId: user.id,
        metadata: JSON.stringify({
          erasureId,
          email: user.email,
          reason: reason || 'User requested data deletion',
          timestamp: new Date().toISOString(),
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    // Start erasure process
    const deletedData: any = {
      erasureId,
      requestDate: new Date().toISOString(),
      dataSubject: user.email,
      deletedItems: {},
    };

    // Delete user sessions
    const deletedSessions = await prisma.session.deleteMany({
      where: { userId: user.id },
    });
    deletedData.deletedItems.sessions = deletedSessions.count;

    // Delete user accounts (OAuth connections)
    const deletedAccounts = await prisma.account.deleteMany({
      where: { userId: user.id },
    });
    deletedData.deletedItems.accounts = deletedAccounts.count;

    // Anonymize audit logs (keep for compliance but remove PII)
    const updatedAuditLogs = await prisma.auditLog.updateMany({
      where: { userId: user.id },
      data: {
        userId: null,
        metadata: JSON.stringify({ anonymized: true }),
      },
    });
    deletedData.deletedItems.auditLogsAnonymized = updatedAuditLogs.count;

    // If user is part of a tenant, handle tenant-specific data
    if (user.tenantId) {
      // Check if user is the only member of the tenant
      const tenantUsers = await prisma.user.count({
        where: { tenantId: user.tenantId },
      });

      if (tenantUsers === 1) {
        // User is the only member - delete entire tenant and all associated data
        
        // Delete API keys
        const deletedApiKeys = await prisma.apiKey.deleteMany({
          where: { tenantId: user.tenantId },
        });
        deletedData.deletedItems.apiKeys = deletedApiKeys.count;

        // Delete billing snapshots
        const deletedBilling = await prisma.billingSnapshot.deleteMany({
          where: { tenantId: user.tenantId },
        });
        deletedData.deletedItems.billingSnapshots = deletedBilling.count;

        // Delete datasets (this will cascade to related records)
        const deletedDatasets = await prisma.dataset.deleteMany({
          where: { tenantId: user.tenantId },
        });
        deletedData.deletedItems.datasets = deletedDatasets.count;

        // Delete policies
        const deletedPolicies = await prisma.accessPolicy.deleteMany({
          where: { clientTenantId: user.tenantId },
        });
        deletedData.deletedItems.policies = deletedPolicies.count;

        // Delete leases
        const deletedLeases = await prisma.accessLease.deleteMany({
          where: { clientTenantId: user.tenantId },
        });
        deletedData.deletedItems.leases = deletedLeases.count;

        // Delete tenant
        await prisma.tenant.delete({
          where: { id: user.tenantId },
        });
        deletedData.deletedItems.tenant = 1;
      } else {
        // Multiple users in tenant - just remove this user
        deletedData.deletedItems.tenant = 0;
        deletedData.note = 'User removed from organization. Organization data retained for other members.';
      }
    }

    // Finally, delete the user
    await prisma.user.delete({
      where: { id: user.id },
    });
    deletedData.deletedItems.user = 1;

    // Create final audit log (without userId since user is deleted)
    await prisma.auditLog.create({
      data: {
        tenantId: null,
        userId: null,
        action: 'GDPR_ERASURE_COMPLETED',
        resourceType: 'user',
        resourceId: erasureId,
        metadata: JSON.stringify({
          erasureId,
          originalEmail: user.email,
          deletedItems: deletedData.deletedItems,
          completedAt: new Date().toISOString(),
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      erasureId,
      message: 'All personal data has been permanently deleted',
      deletedItems: deletedData.deletedItems,
      metadata: {
        regulation: 'GDPR',
        article: 'Article 17',
        description: 'Right to Erasure',
        completedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error processing erasure request:', error);
    
    // Log the error
    try {
      await prisma.auditLog.create({
        data: {
          action: 'GDPR_ERASURE_FAILED',
          resourceType: 'user',
          resourceId: 'unknown',
          metadata: JSON.stringify({
            error: error.message,
            timestamp: new Date().toISOString(),
          }),
          status: 'FAILED',
          errorMessage: error.message,
          timestamp: new Date(),
        },
      });
    } catch {}

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/compliance/gdpr/erasure/:erasureId
 * Check status of an erasure request
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const erasureId = url.pathname.split('/').pop();

    if (!erasureId) {
      return NextResponse.json(
        { error: 'Erasure ID required' },
        { status: 400 }
      );
    }

    // Look up erasure in audit logs
    const erasureLog = await prisma.auditLog.findFirst({
      where: {
        action: 'GDPR_ERASURE_COMPLETED',
        resourceId: erasureId,
      },
      select: {
        metadata: true,
        timestamp: true,
        status: true,
      },
    });

    if (!erasureLog) {
      return NextResponse.json(
        { error: 'Erasure request not found' },
        { status: 404 }
      );
    }

    const metadata = JSON.parse(erasureLog.metadata || '{}');

    return NextResponse.json({
      erasureId,
      status: erasureLog.status,
      completedAt: erasureLog.timestamp,
      deletedItems: metadata.deletedItems,
    });
  } catch (error: any) {
    console.error('Error checking erasure status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
