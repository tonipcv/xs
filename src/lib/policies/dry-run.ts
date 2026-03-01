/**
 * Policy Dry-Run System
 * GT-004: Test policies before publishing
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface PolicyDryRunResult {
  policyId: string;
  policyName: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  affectedDatasets: number;
  affectedUsers: number;
  estimatedImpact: {
    newAccessGrants: number;
    accessRevocations: number;
    costIncrease: number;
    costDecrease: number;
  };
  simulatedScenarios: SimulatedScenario[];
}

export interface SimulatedScenario {
  scenario: string;
  userId: string;
  datasetId: string;
  action: 'grant' | 'revoke' | 'maintain';
  reason: string;
  currentAccess: boolean;
  newAccess: boolean;
}

/**
 * Perform dry-run of policy
 */
export async function performPolicyDryRun(policyId: string): Promise<PolicyDryRunResult> {
  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
  });

  if (!policy) {
    throw new Error('Policy not found');
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const scenarios: SimulatedScenario[] = [];

  // Validate policy structure
  const validationErrors = validatePolicyStructure(policy);
  errors.push(...validationErrors);

  // Get affected datasets
  const datasets = await prisma.dataset.findMany({
    where: {
      tenantId: policy.tenantId,
    },
  });

  // Get affected users
  const users = await prisma.user.findMany({
    take: 100, // Limit for simulation
  });

  // Simulate policy application
  for (const dataset of datasets) {
    for (const user of users) {
      const scenario = await simulatePolicyApplication(policy, dataset, user);
      if (scenario) {
        scenarios.push(scenario);
      }
    }
  }

  // Calculate impact
  const impact = calculateImpact(scenarios);

  // Generate warnings
  if (impact.accessRevocations > 10) {
    warnings.push(`Policy will revoke access for ${impact.accessRevocations} users`);
  }

  if (impact.costIncrease > 1000) {
    warnings.push(`Policy may increase costs by $${impact.costIncrease}`);
  }

  return {
    policyId: policy.id,
    policyName: policy.name,
    valid: errors.length === 0,
    errors,
    warnings,
    affectedDatasets: datasets.length,
    affectedUsers: users.length,
    estimatedImpact: impact,
    simulatedScenarios: scenarios.slice(0, 20), // Return top 20 scenarios
  };
}

/**
 * Validate policy structure
 */
function validatePolicyStructure(policy: any): string[] {
  const errors: string[] = [];

  if (!policy.name || policy.name.trim().length === 0) {
    errors.push('Policy name is required');
  }

  if (!policy.rules || typeof policy.rules !== 'object') {
    errors.push('Policy rules are required');
  }

  // Validate rules structure
  try {
    const rules = JSON.parse(policy.rules as string);
    
    if (!rules.conditions) {
      errors.push('Policy must have conditions');
    }

    if (!rules.actions) {
      errors.push('Policy must have actions');
    }

    // Validate conditions
    if (rules.conditions && !Array.isArray(rules.conditions)) {
      errors.push('Conditions must be an array');
    }

    // Validate actions
    if (rules.actions && !Array.isArray(rules.actions)) {
      errors.push('Actions must be an array');
    }
  } catch (error) {
    errors.push('Invalid policy rules JSON');
  }

  return errors;
}

/**
 * Simulate policy application
 */
async function simulatePolicyApplication(
  policy: any,
  dataset: any,
  user: any
): Promise<SimulatedScenario | null> {
  try {
    const rules = JSON.parse(policy.rules as string);

    // Check current access
    const currentAccess = await checkCurrentAccess(user.id, dataset.id);

    // Evaluate policy conditions
    const conditionsMet = evaluateConditions(rules.conditions, user, dataset);

    // Determine new access
    const newAccess = conditionsMet;

    // Only return scenario if access changes
    if (currentAccess !== newAccess) {
      return {
        scenario: `${user.email} access to ${dataset.name}`,
        userId: user.id,
        datasetId: dataset.id,
        action: newAccess ? 'grant' : 'revoke',
        reason: conditionsMet ? 'Conditions met' : 'Conditions not met',
        currentAccess,
        newAccess,
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check current access
 */
async function checkCurrentAccess(userId: string, datasetId: string): Promise<boolean> {
  const lease = await prisma.lease.findFirst({
    where: {
      userId,
      datasetId,
      status: 'ACTIVE',
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  return !!lease;
}

/**
 * Evaluate policy conditions
 */
function evaluateConditions(conditions: any[], user: any, dataset: any): boolean {
  if (!conditions || conditions.length === 0) {
    return true;
  }

  // Simple evaluation - in production, use a proper rule engine
  for (const condition of conditions) {
    if (condition.field === 'user.email' && condition.operator === 'contains') {
      if (!user.email.includes(condition.value)) {
        return false;
      }
    }

    if (condition.field === 'dataset.type' && condition.operator === 'equals') {
      if (dataset.dataType !== condition.value) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Calculate impact
 */
function calculateImpact(scenarios: SimulatedScenario[]): {
  newAccessGrants: number;
  accessRevocations: number;
  costIncrease: number;
  costDecrease: number;
} {
  const grants = scenarios.filter(s => s.action === 'grant').length;
  const revocations = scenarios.filter(s => s.action === 'revoke').length;

  // Estimate costs (simplified)
  const avgCostPerAccess = 10; // $10 per access
  const costIncrease = grants * avgCostPerAccess;
  const costDecrease = revocations * avgCostPerAccess;

  return {
    newAccessGrants: grants,
    accessRevocations: revocations,
    costIncrease,
    costDecrease,
  };
}

/**
 * Compare two policies
 */
export async function comparePolicies(
  policyId1: string,
  policyId2: string
): Promise<{
  differences: string[];
  impactDelta: any;
}> {
  const result1 = await performPolicyDryRun(policyId1);
  const result2 = await performPolicyDryRun(policyId2);

  const differences: string[] = [];

  if (result1.affectedDatasets !== result2.affectedDatasets) {
    differences.push(`Affected datasets: ${result1.affectedDatasets} vs ${result2.affectedDatasets}`);
  }

  if (result1.affectedUsers !== result2.affectedUsers) {
    differences.push(`Affected users: ${result1.affectedUsers} vs ${result2.affectedUsers}`);
  }

  const impactDelta = {
    grantsDelta: result2.estimatedImpact.newAccessGrants - result1.estimatedImpact.newAccessGrants,
    revocationsDelta: result2.estimatedImpact.accessRevocations - result1.estimatedImpact.accessRevocations,
    costDelta: result2.estimatedImpact.costIncrease - result1.estimatedImpact.costIncrease,
  };

  return {
    differences,
    impactDelta,
  };
}

/**
 * Generate policy recommendations
 */
export async function generatePolicyRecommendations(policyId: string): Promise<string[]> {
  const result = await performPolicyDryRun(policyId);
  const recommendations: string[] = [];

  if (result.estimatedImpact.accessRevocations > 50) {
    recommendations.push('Consider gradual rollout to minimize disruption');
  }

  if (result.estimatedImpact.costIncrease > 5000) {
    recommendations.push('Review budget allocation before applying this policy');
  }

  if (result.errors.length > 0) {
    recommendations.push('Fix validation errors before publishing');
  }

  if (result.warnings.length > 0) {
    recommendations.push('Review warnings and consider policy adjustments');
  }

  return recommendations;
}
