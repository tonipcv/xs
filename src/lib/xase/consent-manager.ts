// Stub for backward compatibility after Sprint 1 cleanup
// TODO: Implement proper consent management

export class ConsentManager {
  async getConsentStatus(userId: string, purpose: string) {
    console.warn('Consent status check stubbed');
    return { granted: false, timestamp: null };
  }

  async grantConsent(data: unknown) {
    console.warn('Consent grant stubbed');
    return true;
  }

  async revokeConsent(data: unknown) {
    console.warn('Consent revocation stubbed');
    return true;
  }

  async checkConsent(resourceId: string) {
    console.warn('Consent check stubbed');
    return { granted: false };
  }

  static async grantConsent(data: unknown) {
    console.warn('Consent grant stubbed (static)');
    return true;
  }

  static async revokeConsent(data: unknown) {
    console.warn('Consent revocation stubbed (static)');
    return true;
  }

  static async checkConsent(resourceId: string) {
    console.warn('Consent check stubbed (static)');
    return { granted: false };
  }
}

export const consentManager = new ConsentManager();
