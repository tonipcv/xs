/**
 * RBAC Member Management System
 * Manage organization members, roles, and permissions
 * F2-002: RBAC UI - Gestão de Membros da Organização
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { sendEmail } from '@/lib/email/email-service';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export type XaseRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | 'CUSTOM';

export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'execute';
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isCustom: boolean;
  tenantId: string;
}

export interface Member {
  id: string;
  userId: string;
  tenantId: string;
  role: XaseRole;
  customRoleId?: string;
  permissions: string[];
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  status: 'pending' | 'active' | 'suspended';
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface InviteRequest {
  email: string;
  role: XaseRole;
  customRoleId?: string;
  tenantId: string;
  invitedBy: string;
  message?: string;
}

/**
 * Default permissions for built-in roles
 */
const DEFAULT_PERMISSIONS: Record<XaseRole, string[]> = {
  OWNER: [
    'datasets:create',
    'datasets:read',
    'datasets:update',
    'datasets:delete',
    'policies:create',
    'policies:read',
    'policies:update',
    'policies:delete',
    'leases:create',
    'leases:read',
    'leases:revoke',
    'members:invite',
    'members:read',
    'members:update',
    'members:remove',
    'roles:create',
    'roles:read',
    'roles:update',
    'roles:delete',
    'billing:read',
    'billing:update',
    'audit:read',
    'audit:export',
    'settings:read',
    'settings:update',
    'webhooks:create',
    'webhooks:read',
    'webhooks:update',
    'webhooks:delete',
  ],
  ADMIN: [
    'datasets:create',
    'datasets:read',
    'datasets:update',
    'datasets:delete',
    'policies:create',
    'policies:read',
    'policies:update',
    'policies:delete',
    'leases:create',
    'leases:read',
    'leases:revoke',
    'members:invite',
    'members:read',
    'billing:read',
    'audit:read',
    'settings:read',
    'webhooks:read',
  ],
  MEMBER: [
    'datasets:create',
    'datasets:read',
    'datasets:update',
    'policies:read',
    'leases:create',
    'leases:read',
    'billing:read',
    'audit:read',
  ],
  VIEWER: [
    'datasets:read',
    'policies:read',
    'leases:read',
    'billing:read',
    'audit:read',
  ],
  CUSTOM: [], // Custom roles have their own permissions
};

/**
 * Invite member to organization
 */
export async function inviteMember(request: InviteRequest): Promise<string> {
  const { email, role, customRoleId, tenantId, invitedBy, message } = request;

  // Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email },
  });

  // Check if already a member
  if (user) {
    const existingMember = await prisma.auditLog.findFirst({
      where: {
        action: 'MEMBER_ADDED',
        resourceType: 'member',
        tenantId,
        userId: user.id,
      },
    });

    if (existingMember) {
      throw new Error('User is already a member of this organization');
    }
  }

  // Generate invite token
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Store invite
  await redis.setex(
    `invite:${inviteToken}`,
    7 * 24 * 60 * 60, // 7 days
    JSON.stringify({
      inviteId,
      email,
      role,
      customRoleId,
      tenantId,
      invitedBy,
      createdAt: new Date().toISOString(),
    })
  );

  // Get tenant info
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  // Get inviter info
  const inviter = await prisma.user.findUnique({
    where: { id: invitedBy },
  });

  // Send invite email
  const inviteUrl = `${process.env.NEXTAUTH_URL}/invite/accept?token=${inviteToken}`;

  await sendEmail({
    to: email,
    subject: `You've been invited to join ${tenant?.name || 'XASE Sheets'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited!</h2>
        
        <p>${inviter?.name || 'Someone'} has invited you to join <strong>${tenant?.name || 'their organization'}</strong> on XASE Sheets.</p>
        
        <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Organization:</strong> ${tenant?.name || 'N/A'}<br>
          <strong>Role:</strong> ${role}<br>
          <strong>Invited by:</strong> ${inviter?.name || 'N/A'} (${inviter?.email || 'N/A'})
        </div>
        
        ${message ? `<p><em>Message from ${inviter?.name}:</em><br>"${message}"</p>` : ''}
        
        <p>Click the button below to accept the invitation:</p>
        
        <div style="margin: 30px 0;">
          <a href="${inviteUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        
        <p>This invitation will expire in 7 days.</p>
        
        <p>If you don't want to accept this invitation, you can safely ignore this email.</p>
        
        <p>Best regards,<br>The XASE Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        
        <p style="color: #666; font-size: 12px;">
          If the button doesn't work, copy and paste this URL into your browser:<br>
          <a href="${inviteUrl}">${inviteUrl}</a>
        </p>
      </div>
    `,
  });

  // Log invite
  await prisma.auditLog.create({
    data: {
      action: 'MEMBER_INVITED',
      resourceType: 'member',
      resourceId: inviteId,
      tenantId,
      userId: invitedBy,
      metadata: JSON.stringify({
        email,
        role,
        customRoleId,
        inviteToken: inviteToken.substring(0, 8) + '...',
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  return inviteToken;
}

/**
 * Accept member invitation
 */
export async function acceptInvitation(
  inviteToken: string,
  userId: string
): Promise<Member> {
  // Get invite data
  const inviteData = await redis.get(`invite:${inviteToken}`);

  if (!inviteData) {
    throw new Error('Invalid or expired invitation');
  }

  const invite = JSON.parse(inviteData);

  // Verify user email matches invite
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.email !== invite.email) {
    throw new Error('User email does not match invitation');
  }

  // Get permissions for role
  const permissions = invite.customRoleId
    ? await getCustomRolePermissions(invite.customRoleId)
    : DEFAULT_PERMISSIONS[invite.role as XaseRole] || [];

  // Add member
  const memberId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await prisma.auditLog.create({
    data: {
      action: 'MEMBER_ADDED',
      resourceType: 'member',
      resourceId: memberId,
      tenantId: invite.tenantId,
      userId,
      metadata: JSON.stringify({
        role: invite.role,
        customRoleId: invite.customRoleId,
        permissions,
        invitedBy: invite.invitedBy,
        invitedAt: invite.createdAt,
        joinedAt: new Date().toISOString(),
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Delete invite token
  await redis.del(`invite:${inviteToken}`);

  // Invalidate member cache
  await redis.del(`members:${invite.tenantId}`);

  return {
    id: memberId,
    userId,
    tenantId: invite.tenantId,
    role: invite.role,
    customRoleId: invite.customRoleId,
    permissions,
    invitedBy: invite.invitedBy,
    invitedAt: new Date(invite.createdAt),
    joinedAt: new Date(),
    status: 'active',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  };
}

/**
 * List organization members
 */
export async function listMembers(tenantId: string): Promise<Member[]> {
  // Check cache first
  const cacheKey = `members:${tenantId}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch from database
  const memberLogs = await prisma.auditLog.findMany({
    where: {
      action: 'MEMBER_ADDED',
      resourceType: 'member',
      tenantId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  const members: Member[] = memberLogs.map((log) => {
    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    return {
      id: log.resourceId || '',
      userId: log.userId || '',
      tenantId: log.tenantId || '',
      role: meta.role || 'VIEWER',
      customRoleId: meta.customRoleId,
      permissions: meta.permissions || [],
      invitedBy: meta.invitedBy,
      invitedAt: meta.invitedAt ? new Date(meta.invitedAt) : undefined,
      joinedAt: meta.joinedAt ? new Date(meta.joinedAt) : log.timestamp,
      status: meta.status || 'active',
      user: log.user || { id: '', name: null, email: '' },
    };
  });

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(members));

  return members;
}

/**
 * Update member role
 */
export async function updateMemberRole(
  memberId: string,
  tenantId: string,
  newRole: XaseRole,
  customRoleId?: string,
  updatedBy?: string
): Promise<void> {
  // Get current member
  const currentMember = await prisma.auditLog.findFirst({
    where: {
      action: 'MEMBER_ADDED',
      resourceType: 'member',
      resourceId: memberId,
      tenantId,
    },
  });

  if (!currentMember) {
    throw new Error('Member not found');
  }

  const currentMeta = typeof currentMember.metadata === 'string' 
    ? JSON.parse(currentMember.metadata) 
    : currentMember.metadata;

  // Get new permissions
  const permissions = customRoleId
    ? await getCustomRolePermissions(customRoleId)
    : DEFAULT_PERMISSIONS[newRole] || [];

  // Update member
  await prisma.auditLog.create({
    data: {
      action: 'MEMBER_ROLE_UPDATED',
      resourceType: 'member',
      resourceId: memberId,
      tenantId,
      userId: updatedBy,
      metadata: JSON.stringify({
        previousRole: currentMeta.role,
        newRole,
        customRoleId,
        permissions,
        updatedAt: new Date().toISOString(),
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Invalidate cache
  await redis.del(`members:${tenantId}`);
}

/**
 * Remove member from organization
 */
export async function removeMember(
  memberId: string,
  tenantId: string,
  removedBy: string
): Promise<void> {
  const member = await prisma.auditLog.findFirst({
    where: {
      action: 'MEMBER_ADDED',
      resourceType: 'member',
      resourceId: memberId,
      tenantId,
    },
  });

  if (!member) {
    throw new Error('Member not found');
  }

  await prisma.auditLog.create({
    data: {
      action: 'MEMBER_REMOVED',
      resourceType: 'member',
      resourceId: memberId,
      tenantId,
      userId: removedBy,
      metadata: JSON.stringify({
        removedUserId: member.userId,
        removedAt: new Date().toISOString(),
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Invalidate cache
  await redis.del(`members:${tenantId}`);
}

/**
 * Create custom role
 */
export async function createCustomRole(
  tenantId: string,
  name: string,
  description: string,
  permissions: string[],
  createdBy: string
): Promise<Role> {
  const roleId = `role_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await prisma.auditLog.create({
    data: {
      action: 'CUSTOM_ROLE_CREATED',
      resourceType: 'role',
      resourceId: roleId,
      tenantId,
      userId: createdBy,
      metadata: JSON.stringify({
        name,
        description,
        permissions,
        createdAt: new Date().toISOString(),
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  return {
    id: roleId,
    name,
    description,
    permissions: permissions.map((p) => ({
      id: p,
      name: p,
      description: '',
      resource: p.split(':')[0],
      action: p.split(':')[1] as any,
    })),
    isCustom: true,
    tenantId,
  };
}

/**
 * Get custom role permissions
 */
async function getCustomRolePermissions(roleId: string): Promise<string[]> {
  const role = await prisma.auditLog.findFirst({
    where: {
      action: 'CUSTOM_ROLE_CREATED',
      resourceType: 'role',
      resourceId: roleId,
    },
  });

  if (!role) {
    return [];
  }

  const meta = typeof role.metadata === 'string' ? JSON.parse(role.metadata) : role.metadata;
  return meta.permissions || [];
}

/**
 * Check if user has permission
 */
export async function hasPermission(
  userId: string,
  tenantId: string,
  permission: string
): Promise<boolean> {
  const members = await listMembers(tenantId);
  const member = members.find((m) => m.userId === userId);

  if (!member) {
    return false;
  }

  return member.permissions.includes(permission);
}

/**
 * Get member by user ID
 */
export async function getMemberByUserId(
  userId: string,
  tenantId: string
): Promise<Member | null> {
  const members = await listMembers(tenantId);
  return members.find((m) => m.userId === userId) || null;
}
