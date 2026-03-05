// Stub for backward compatibility after Sprint 1 cleanup
export async function enforceAccess(leaseId: string, action: string) {
  console.warn('Access enforcement stubbed');
  return { allowed: true };
}

export async function checkPermission(userId: string, resource: string, action: string) {
  console.warn('Permission check stubbed');
  return true;
}

export function extractRequestContext(request: unknown) {
  console.warn('Request context extraction stubbed');
  return { userId: null, tenantId: null, ip: null };
}
