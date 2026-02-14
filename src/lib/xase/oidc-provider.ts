/**
 * OIDC PROVIDER
 * 
 * Integration with enterprise OIDC providers (Auth0, Keycloak, Okta)
 * Supports SSO, SAML, and OAuth2/OIDC flows
 */

import { JWTPayload, jwtVerify, createRemoteJWKSet } from 'jose'

export interface OIDCConfig {
  provider: 'auth0' | 'keycloak' | 'okta' | 'azure-ad'
  issuer: string
  clientId: string
  clientSecret: string
  jwksUri: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userInfoEndpoint: string
  redirectUri: string
  scopes: string[]
}

export interface OIDCUser {
  sub: string // Subject (user ID)
  email: string
  email_verified: boolean
  name: string
  given_name?: string
  family_name?: string
  picture?: string
  locale?: string
  groups?: string[]
  roles?: string[]
  tenant_id?: string
  org_id?: string
}

export interface OIDCTokens {
  access_token: string
  id_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope: string
}

/**
 * OIDC Provider Client
 */
export class OIDCProvider {
  private config: OIDCConfig
  private jwksCache: Map<string, any> = new Map()
  private jwksCacheTTL = 3600000 // 1 hour

  constructor(config: OIDCConfig) {
    this.config = config
  }

  /**
   * Generate authorization URL for OAuth2 flow
   */
  getAuthorizationUrl(state: string, nonce: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      nonce,
    })

    return `${this.config.authorizationEndpoint}?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<OIDCTokens> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }

    return await response.json()
  }

  /**
   * Verify and decode ID token
   */
  async verifyIdToken(idToken: string, nonce?: string): Promise<OIDCUser> {
    try {
      // Create JWKS function for jose
      const JWKS = createRemoteJWKSet(new URL(this.config.jwksUri))

      // Verify token
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: this.config.issuer,
        audience: this.config.clientId,
      })

      // Verify nonce if provided
      if (nonce && payload.nonce !== nonce) {
        throw new Error('Nonce mismatch')
      }

      // Extract user info
      return this.extractUserInfo(payload)
    } catch (error: any) {
      throw new Error(`ID token verification failed: ${error.message}`)
    }
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(accessToken: string): Promise<JWTPayload> {
    try {
      // Create JWKS function for jose
      const JWKS = createRemoteJWKSet(new URL(this.config.jwksUri))

      const { payload } = await jwtVerify(accessToken, JWKS, {
        issuer: this.config.issuer,
      })

      return payload
    } catch (error: any) {
      throw new Error(`Access token verification failed: ${error.message}`)
    }
  }

  /**
   * Get user info from userinfo endpoint
   */
  async getUserInfo(accessToken: string): Promise<OIDCUser> {
    const response = await fetch(this.config.userInfoEndpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch user info')
    }

    const userInfo = await response.json()
    return this.extractUserInfo(userInfo)
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<OIDCTokens> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    return await response.json()
  }

  /**
   * Revoke token
   */
  async revokeToken(token: string, tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token'): Promise<void> {
    const revocationEndpoint = this.config.issuer + '/oauth/revoke'

    await fetch(revocationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        token,
        token_type_hint: tokenTypeHint,
      }),
    })
  }

  /**
   * Get JWKS (JSON Web Key Set)
   */
  private async getJWKS(): Promise<any> {
    const cached = this.jwksCache.get(this.config.jwksUri)
    if (cached && Date.now() - cached.timestamp < this.jwksCacheTTL) {
      return cached.jwks
    }

    const response = await fetch(this.config.jwksUri)
    if (!response.ok) {
      throw new Error('Failed to fetch JWKS')
    }

    const jwks = await response.json()

    // Cache JWKS
    this.jwksCache.set(this.config.jwksUri, {
      jwks,
      timestamp: Date.now(),
    })

    return jwks
  }

  /**
   * Extract user info from JWT payload or userinfo response
   */
  private extractUserInfo(data: any): OIDCUser {
    return {
      sub: data.sub,
      email: data.email || data.preferred_username,
      email_verified: data.email_verified ?? false,
      name: data.name || `${data.given_name || ''} ${data.family_name || ''}`.trim(),
      given_name: data.given_name,
      family_name: data.family_name,
      picture: data.picture,
      locale: data.locale,
      groups: data.groups || data['cognito:groups'] || [],
      roles: data.roles || data['https://xase.ai/roles'] || [],
      tenant_id: data.tenant_id || data['https://xase.ai/tenant_id'],
      org_id: data.org_id || data['https://xase.ai/org_id'],
    }
  }
}

/**
 * OIDC Provider Factory
 */
export class OIDCProviderFactory {
  static createAuth0Provider(domain: string, clientId: string, clientSecret: string, redirectUri: string): OIDCProvider {
    return new OIDCProvider({
      provider: 'auth0',
      issuer: `https://${domain}/`,
      clientId,
      clientSecret,
      jwksUri: `https://${domain}/.well-known/jwks.json`,
      authorizationEndpoint: `https://${domain}/authorize`,
      tokenEndpoint: `https://${domain}/oauth/token`,
      userInfoEndpoint: `https://${domain}/userinfo`,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
    })
  }

  static createKeycloakProvider(
    realm: string,
    baseUrl: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): OIDCProvider {
    const issuer = `${baseUrl}/realms/${realm}`
    return new OIDCProvider({
      provider: 'keycloak',
      issuer,
      clientId,
      clientSecret,
      jwksUri: `${issuer}/protocol/openid-connect/certs`,
      authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
      tokenEndpoint: `${issuer}/protocol/openid-connect/token`,
      userInfoEndpoint: `${issuer}/protocol/openid-connect/userinfo`,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
    })
  }

  static createOktaProvider(domain: string, clientId: string, clientSecret: string, redirectUri: string): OIDCProvider {
    return new OIDCProvider({
      provider: 'okta',
      issuer: `https://${domain}/oauth2/default`,
      clientId,
      clientSecret,
      jwksUri: `https://${domain}/oauth2/default/v1/keys`,
      authorizationEndpoint: `https://${domain}/oauth2/default/v1/authorize`,
      tokenEndpoint: `https://${domain}/oauth2/default/v1/token`,
      userInfoEndpoint: `https://${domain}/oauth2/default/v1/userinfo`,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
    })
  }

  static createAzureADProvider(
    tenantId: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): OIDCProvider {
    const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`
    return new OIDCProvider({
      provider: 'azure-ad',
      issuer,
      clientId,
      clientSecret,
      jwksUri: `${issuer}/discovery/keys`,
      authorizationEndpoint: `${issuer}/authorize`,
      tokenEndpoint: `${issuer}/token`,
      userInfoEndpoint: 'https://graph.microsoft.com/oidc/userinfo',
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
    })
  }
}
