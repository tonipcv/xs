// Stub for backward compatibility after Sprint 1 cleanup
// TODO: Implement proper bearer token management

export async function generateBearerToken(userId: string) {
  console.warn('Bearer token generation stubbed');
  return `stub-bearer-${userId}-${Date.now()}`;
}

export async function validateBearerToken(token: string) {
  console.warn('Bearer token validation stubbed');
  return { valid: false, userId: null };
}

export async function revokeBearerToken(token: string) {
  console.warn('Bearer token revocation stubbed');
  return true;
}

export function generateRandomId(length?: number) {
  if (length) {
    return Math.random().toString(36).substring(2, 2 + length);
  }
  return `random-${Date.now()}-${Math.random()}`;
}

export async function issueCliToken(userId: string, scopes?: string[], expiresIn?: number) {
  console.warn('CLI token issuance stubbed');
  return { token: `cli-${userId}-${Date.now()}`, expiresIn: expiresIn || 3600 };
}

export async function validateBearer(token: string) {
  console.warn('Bearer validation stubbed');
  return { valid: false, userId: null as string | null, tenantId: null as string | null };
}
