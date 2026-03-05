// Stub for backward compatibility after Sprint 1 cleanup
export class EpsilonBudgetTracker {
  async checkBudget(userId: string, epsilon: number) {
    console.warn('Epsilon budget check stubbed');
    return { available: true, remaining: 1.0 };
  }

  async consumeBudget(userId: string, epsilon: number) {
    console.warn('Epsilon budget consumption stubbed');
    return { success: true };
  }

  async resetBudget(userId: string) {
    console.warn('Epsilon budget reset stubbed');
    return { success: true };
  }

  // New stubs matching dataset streaming usage
  async canExecuteQuery(tenantId: string, datasetId: string, epsilon: number) {
    console.warn('Epsilon canExecuteQuery stubbed');
    return { allowed: true, reason: null as string | null };
  }

  async consumeBudgetDetailed(
    tenantId: string,
    datasetId: string,
    epsilon: number,
    actorId: string,
    action: string,
    requestId: string
  ) {
    console.warn('Epsilon consumeBudget (detailed) stubbed');
    return { success: true };
  }

  async getBudget(tenantId: string, datasetId: string) {
    console.warn('Epsilon getBudget stubbed');
    return {
      total: 10.0,
      consumed: 0.5,
      remaining: 9.5,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  async close() {
    console.warn('Epsilon tracker close stubbed');
  }
}

export const epsilonTracker = new EpsilonBudgetTracker();
