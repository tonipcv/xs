// Stub for backward compatibility after Sprint 1 cleanup
export async function generateTimestamp(data: unknown) {
  console.warn('Timestamp generation stubbed');
  return { timestamp: Date.now(), signature: 'stub-sig' };
}

export async function verifyTimestamp(timestamp: unknown, signature: string) {
  console.warn('Timestamp verification stubbed');
  return { valid: true };
}

export async function getTimestamp(data: unknown) {
  return generateTimestamp(data);
}
