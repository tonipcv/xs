// Stub for backward compatibility after Sprint 1 cleanup
export class AdvancedRateLimiter {
  async checkLimit(key: string, limit: number, window: number) {
    console.warn('Rate limiting stubbed');
    return { allowed: true, remaining: limit };
  }

  async consumeToken(key: string) {
    console.warn('Token consumption stubbed');
    return { success: true };
  }

  async resetLimit(key: string) {
    console.warn('Limit reset stubbed');
    return { success: true };
  }
}

export const rateLimiter = new AdvancedRateLimiter();

export async function getRateLimitStatus(key: string) {
  return rateLimiter.checkLimit(key, 100, 60);
}
