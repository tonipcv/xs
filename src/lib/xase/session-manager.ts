// Stub for backward compatibility after Sprint 1 cleanup
// TODO: Use NextAuth session management instead

export class SessionManager {
  async createSession(userId: string, data: unknown) {
    console.warn('Session creation stubbed');
    return { sessionId: 'stub-session' };
  }

  static async createSession(userId: string, data: unknown) {
    console.warn('Session creation stubbed (static)');
    return { sessionId: 'stub-session' };
  }

  async getSession(sessionId: string) {
    console.warn('Session retrieval stubbed');
    return null;
  }

  async destroySession(sessionId: string) {
    console.warn('Session destruction stubbed');
    return true;
  }
}

export const sessionManager = new SessionManager();
