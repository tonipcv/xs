// Stub for backward compatibility after Sprint 1 cleanup
export async function validatePolicy(policy: unknown) {
  console.warn('Policy validation stubbed');
  return { valid: true, errors: [] };
}

export async function validateRewriteRules(rules: unknown[]) {
  console.warn('Rewrite rules validation stubbed');
  return { valid: true, errors: [] };
}
