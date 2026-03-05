// Stub for backward compatibility after Sprint 1 cleanup
export class PolicyEngine {
  async evaluatePolicy(policyId: string, context: unknown) {
    console.warn('Policy evaluation stubbed');
    return { allowed: true, reason: 'stub' };
  }

  async applyRewriteRules(data: unknown, rules: unknown[]) {
    console.warn('Rewrite rules stubbed');
    return data;
  }
}

export const policyEngine = new PolicyEngine();

export async function validatePolicy(policy: unknown) {
  return policyEngine.evaluatePolicy('', policy);
}
