/**
 * GDPR Article 15 - Data Subject Access Request (DSAR)
 * Returns all personal data held about a user
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

/**
 * POST /api/compliance/gdpr/dsar
 * Request all personal data for the authenticated user
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

    // Get user data
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        accounts: true,
        sessions: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Collect all personal data
    const personalData: any = {
      requestId: `dsar_${Date.now()}`,
      requestDate: new Date().toISOString(),
      dataSubject: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        language: user.language,
        region: user.region,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accounts: user.accounts.map(account => ({
        provider: account.provider,
        type: account.type,
        createdAt: account.id,
      })),
      sessions: user.sessions.map(session => ({
        expires: session.expires,
        createdAt: session.id,
      })),
    };

    // Get tenant data if user belongs to a tenant
    if (user.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });

      if (tenant) {
        personalData.organization = {
          id: tenant.id,
          name: tenant.name,
          role: user.xaseRole,
        };
      }

      // Get datasets created by user
      const datasets = await prisma.dataset.findMany({
        where: { tenantId: user.tenantId },
        select: {
          id: true,
          name: true,
          description: true,
          datasetId: true,
          createdAt: true,
        },
      });

      personalData.datasets = datasets;

      // Get policies created by user
      const policies = await prisma.accessPolicy.findMany({
        where: { clientTenantId: user.tenantId },
        select: {
          id: true,
          policyId: true,
          name: true,
          createdAt: true,
        },
      });

      personalData.policies = policies;

      // Get leases
      const leases = await prisma.accessLease.findMany({
        where: { clientTenantId: user.tenantId },
        select: {
          id: true,
          leaseId: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
        },
      });

      personalData.leases = leases;

      // Get audit logs
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          OR: [
            { tenantId: user.tenantId },
            { userId: user.id },
          ],
        },
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          timestamp: true,
          status: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 1000, // Limit to last 1000 entries
      });

      personalData.auditLogs = auditLogs;

      // Get billing data
      const billingSnapshots = await prisma.billingSnapshot.findMany({
        where: { tenantId: user.tenantId },
        select: {
          period: true,
          audioMinutes: true,
          bytesTotal: true,
          snapshotDate: true,
        },
        orderBy: {
          snapshotDate: 'desc',
        },
        take: 12, // Last 12 months
      });

      personalData.billing = billingSnapshots;
    }

    // Log the DSAR request
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'GDPR_DSAR_REQUESTED',
        resourceType: 'user',
        resourceId: user.id,
        metadata: JSON.stringify({
          requestId: personalData.requestId,
          dataCategories: Object.keys(personalData),
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: personalData,
      metadata: {
        regulation: 'GDPR',
        article: 'Article 15',
        description: 'Data Subject Access Request',
        exportFormat: 'JSON',
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error processing DSAR:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/compliance/gdpr/dsar/:requestId
 * Retrieve a previously generated DSAR
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

    const url = new URL(request.url);
    const requestId = url.pathname.split('/').pop();

    // In production, you would retrieve this from a secure storage
    // For now, return instructions
    return NextResponse.json({
      message: 'DSAR retrieval',
      requestId,
      status: 'To retrieve a DSAR, make a POST request to generate a new one',
    });
  } catch (error: any) {
    console.error('Error retrieving DSAR:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
