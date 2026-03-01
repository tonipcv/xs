/**
 * Team Member Management API
 * RBAC endpoints for managing organization members
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * GET /api/team/members
 * List all members of the tenant
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
        tenantId: true,
        xaseRole: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Get all members of the tenant
    const members = await prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        xaseRole: true,
        language: true,
        region: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json({
      members,
      total: members.length,
    });
  } catch (error: any) {
    console.error('Error fetching team members:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/team/members
 * Invite a new member to the tenant
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
        tenantId: true,
        xaseRole: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Only admins and owners can invite members
    if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only admins can invite members.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, role, name } = body;

    // Validate input
    if (!email || !role) {
      return NextResponse.json(
        { error: 'Email and role are required' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['VIEWER', 'EDITOR', 'ADMIN'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      if (existingUser.tenantId === user.tenantId) {
        return NextResponse.json(
          { error: 'User is already a member of this organization' },
          { status: 400 }
        );
      } else if (existingUser.tenantId) {
        return NextResponse.json(
          { error: 'User is already a member of another organization' },
          { status: 400 }
        );
      }
    }

    // Generate invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpiry = new Date();
    invitationExpiry.setDate(invitationExpiry.getDate() + 7); // 7 days

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });

    // Create invitation record in audit log
    const invitationId = `invite_${Date.now()}`;
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'MEMBER_INVITED',
        resourceType: 'invitation',
        resourceId: invitationId,
        metadata: JSON.stringify({
          invitationId,
          email,
          role,
          name,
          token: invitationToken,
          expiresAt: invitationExpiry.toISOString(),
          invitedBy: session.user.email,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    // Send invitation email
    const invitationUrl = `${process.env.NEXTAUTH_URL}/invite/${invitationToken}`;
    
    await sendEmail({
      to: email,
      subject: `You've been invited to join ${tenant?.name || 'XASE Sheets'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You've been invited!</h2>
          
          <p>Hello${name ? ` ${name}` : ''},</p>
          
          <p>${session.user.name || session.user.email} has invited you to join <strong>${tenant?.name || 'their organization'}</strong> on XASE Sheets.</p>
          
          <p><strong>Your role:</strong> ${role}</p>
          
          <div style="margin: 30px 0;">
            <a href="${invitationUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          
          <p>This invitation will expire in 7 days.</p>
          
          <p>If you didn't expect this invitation, you can safely ignore this email.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          
          <p style="color: #666; font-size: 12px;">
            XASE Sheets - Secure Data Marketplace<br>
            <a href="${invitationUrl}">${invitationUrl}</a>
          </p>
        </div>
      `,
    }).catch(err => {
      console.error('Failed to send invitation email:', err);
    });

    return NextResponse.json({
      success: true,
      invitationId,
      email,
      role,
      expiresAt: invitationExpiry.toISOString(),
      invitationUrl,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error inviting member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
