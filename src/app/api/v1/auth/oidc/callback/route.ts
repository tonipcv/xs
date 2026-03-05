/**
 * OIDC CALLBACK ENDPOINT
 * 
 * Handles OAuth2/OIDC callback from identity provider
 */

import { NextRequest, NextResponse } from 'next/server'
import { OIDCProviderFactory } from '@/lib/xase/oidc-provider'
import { SessionManager } from '@/lib/xase/session-manager'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Check for errors
    if (error) {
      return NextResponse.json(
        { error: 'Authentication failed', details: error },
        { status: 400 }
      )
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: 'Missing code or state parameter' },
        { status: 400 }
      )
    }

    // Verify state (CSRF protection)
    // In production, state should be stored in session/cookie and validated here
    // For now, basic validation that state exists and is not empty
    if (!state || state.length < 16) {
      return NextResponse.json(
        { error: 'Invalid state parameter' },
        { status: 400 }
      )
    }

    // Get OIDC provider config from environment
    const provider = process.env.OIDC_PROVIDER || 'auth0'
    const domain = process.env.OIDC_DOMAIN!
    const clientId = process.env.OIDC_CLIENT_ID!
    const clientSecret = process.env.OIDC_CLIENT_SECRET!
    const redirectUri = process.env.OIDC_REDIRECT_URI!

    // Create OIDC provider
    let oidcProvider
    switch (provider) {
      case 'auth0':
        oidcProvider = OIDCProviderFactory.createAuth0Provider(domain, clientId, clientSecret, redirectUri)
        break
      case 'keycloak':
        const realm = process.env.OIDC_REALM || 'master'
        oidcProvider = OIDCProviderFactory.createKeycloakProvider(realm, domain, clientId, clientSecret, redirectUri)
        break
      default:
        return NextResponse.json({ error: 'Unsupported OIDC provider' }, { status: 500 })
    }

    // Exchange code for tokens
    const tokens = await oidcProvider.exchangeCodeForTokens(code)

    // Verify ID token
    const user = await oidcProvider.verifyIdToken(tokens.id_token)

    // Find or create user
    let dbUser = await prisma.user.findUnique({
      where: { email: user.email },
    })

    if (!dbUser) {
      // Create new user
      dbUser = await prisma.user.create({
        data: {
          email: user.email,
          name: user.name,
          tenantId: (user as any).tenant_id || 'default',
          emailVerified: (user as any).email_verified ? new Date() : null,
        },
      })
    }

    // Create session
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'
    const deviceId = `device_${Date.now()}`

    const session = await SessionManager.createSession(
      dbUser.id,
      { tenantId: dbUser.tenantId || 'default', deviceId, ipAddress, userAgent }
    )

    // Return session token
    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        tenantId: dbUser.tenantId,
      },
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: (tokens as any).expires_in || 3600,
      },
    })
  } catch (error) {
    console.error('[OIDC Callback] Error:', error)
    return NextResponse.json(
      { error: 'Authentication failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
