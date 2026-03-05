// Stub for backward compatibility after Sprint 1 cleanup
// TODO: Implement proper OIDC provider or remove if not needed

export class OIDCProvider {
  async handleCallback(code: string, state: string) {
    console.warn('OIDC callback stubbed');
    return {
      accessToken: 'stub-token',
      idToken: 'stub-id-token',
      user: {},
    };
  }

  async validateToken(token: string) {
    console.warn('OIDC token validation stubbed');
    return { valid: false };
  }

  async exchangeCodeForTokens(code: string) {
    console.warn('OIDC code exchange stubbed');
    return {
      access_token: 'stub-access-token',
      id_token: 'stub-id-token',
      refresh_token: 'stub-refresh-token',
    };
  }

  async verifyIdToken(idToken: string) {
    console.warn('OIDC ID token verification stubbed');
    return {
      sub: 'stub-user-id',
      email: 'stub@example.com',
      name: 'Stub User',
    };
  }
}

export const oidcProvider = new OIDCProvider();

export class OIDCProviderFactory {
  static create(config: unknown) {
    console.warn('OIDC provider factory stubbed');
    return new OIDCProvider();
  }

  static createAuth0Provider(domain: string, clientId: string, clientSecret: string, redirectUri: string) {
    console.warn('Auth0 provider stubbed');
    return new OIDCProvider();
  }

  static createKeycloakProvider(domain: string, realm: string, clientId: string, clientSecret: string, redirectUri: string) {
    console.warn('Keycloak provider stubbed');
    return new OIDCProvider();
  }

  static createOktaProvider(domain: string, clientId: string, clientSecret: string, redirectUri: string) {
    console.warn('Okta provider stubbed');
    return new OIDCProvider();
  }
}
