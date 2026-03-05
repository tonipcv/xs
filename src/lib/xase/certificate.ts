// Stub for backward compatibility after Sprint 1 cleanup
export async function generateCertificate(data: unknown) {
  console.warn('Certificate generation stubbed');
  return { certificate: 'stub-cert', privateKey: 'stub-key' };
}

export async function verifyCertificate(cert: string) {
  console.warn('Certificate verification stubbed');
  return { valid: true };
}
