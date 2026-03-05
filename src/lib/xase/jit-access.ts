// Stub for backward compatibility after Sprint 1 cleanup
export class JITAccessManager {
  async requestAccess(userId: string, resource: string, duration: number) {
    console.warn('JIT access request stubbed');
    return { accessId: 'stub-access', expiresAt: Date.now() + duration };
  }

  async revokeAccess(accessId: string) {
    console.warn('JIT access revocation stubbed');
    return { success: true };
  }

  async validateAccess(accessId: string) {
    console.warn('JIT access validation stubbed');
    return { valid: false };
  }
}

export const jitAccess = new JITAccessManager();

// Static-style API for compatibility with callers using JITAccessManager.requestAccess({...})
export namespace JITAccessManager {
  export type AccessRequest = {
    userId: string
    tenantId: string
    resourceType: string
    resourceId: string
    permissions: string[] | string
    reason: string
    duration?: number
    requiresApproval?: boolean
  }

  export async function requestAccess(payload: AccessRequest) {
    console.warn('JITAccessManager.requestAccess (static) stubbed');
    const duration = payload.duration ?? 3600
    return {
      id: 'jit_' + Math.random().toString(36).slice(2),
      accessId: 'stub-access',
      userId: payload.userId,
      tenantId: payload.tenantId,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [payload.permissions],
      reason: payload.reason,
      requiresApproval: !!payload.requiresApproval,
      approved: !payload.requiresApproval,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
    }
  }
}
