// middleware.ts
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

function sameHost(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  try {
    const ha = a.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    const hb = b.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    return ha === hb;
  } catch {
    return false;
  }
}

function generateCsrfToken(): string {
  try {
    // Edge runtime supports Web Crypto
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  // Fallback
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function applySecurityHeaders(res: NextResponse) {
  // Generate nonce for inline scripts (if needed in the future)
  const nonce = crypto.randomUUID();
  
  // Strict CSP for production, slightly relaxed for development
  const isDev = process.env.NODE_ENV === 'development';
  const sidecar = (process.env.NEXT_PUBLIC_SIDECAR_ORIGIN || process.env.XASE_SIDECAR_ORIGIN || process.env.SIDECAR_ORIGIN || '').trim();
  const sidecarConnect = sidecar ? ` ${sidecar}` : '';
  
  const csp = [
    "default-src 'self'",
    // In development, allow unsafe-eval for Next.js HMR and allow Stripe & Facebook Pixel script hosts
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.stripe.com https://connect.facebook.net"
      : "script-src 'self' 'unsafe-inline' blob: https://js.stripe.com https://*.stripe.com",
    isDev
      ? "style-src 'self' 'unsafe-inline'" // Allow inline styles only in dev
      : "style-src 'self' 'unsafe-inline'",
    // Allow images from https plus Facebook tracking beacons
    isDev
      ? "img-src 'self' data: blob: https: https://www.facebook.com https://connect.facebook.net"
      : "img-src 'self' data: blob: https:",
    // Allow Stripe & Facebook connections in dev
    isDev
      ? ("connect-src 'self' https: http://localhost:* ws: wss: https://js.stripe.com https://*.stripe.com https://connect.facebook.net https://www.facebook.com" + sidecarConnect)
      : ("connect-src 'self' https: https://js.stripe.com https://*.stripe.com" + sidecarConnect),
    "font-src 'self' data:",
    // Allow Stripe (and optionally Facebook) iframes in dev if used
    isDev
      ? "frame-src 'self' https://js.stripe.com https://*.stripe.com https://www.facebook.com"
      : "frame-src 'self' https://js.stripe.com https://*.stripe.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  return res;
}

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;
  
  // Normalize pathname to lowercase for consistent matching
  const normalizedPath = pathname.toLowerCase();

  const reqId = request.headers.get('x-vercel-id') || request.headers.get('x-request-id') || String(Date.now()) + ':' + Math.random().toString(36).slice(2);
  const env = process.env.NODE_ENV || 'unknown';
  const host = request.headers.get('host') || '';
  console.log(JSON.stringify({ tag: 'mw_request', reqId, env, host, path: pathname, hasToken: !!token }));

  // Ensure CSRF cookie is present (double-submit cookie strategy)
  const csrfCookie = request.cookies.get('x-csrf-token')?.value;
  if (!csrfCookie) {
    const csrf = generateCsrfToken();
    const res = NextResponse.next();
    res.cookies.set('x-csrf-token', csrf, {
      httpOnly: false, // double-submit cookie must be readable by client to send header
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    applySecurityHeaders(res);
    return res;
  }

  // Rotas públicas que não precisam de autenticação
  const publicRoutes = ['/login', '/register', '/forgot-password'];
  if (publicRoutes.includes(normalizedPath)) {
    // Se estiver logado, redireciona para a home
    if (token) {
      // Redirect logged users to their appropriate dashboard
      return applySecurityHeaders(NextResponse.redirect(new URL('/app/dashboard', request.url)));
    }

  // Verifica acesso às rotas administrativas
  if (normalizedPath.startsWith('/admin')) {
    const isAdmin = Boolean((token as any)?.isAdmin) || ['OWNER','ADMIN'].includes(((token as any)?.xaseRole as string) || '');
    if (!isAdmin) {
      // Se não houver token, já terá sido redirecionado acima; aqui tratamos caso tenha token mas sem privilégio
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      const res = NextResponse.redirect(loginUrl);
      res.headers.set('X-Auth-Reason', 'not_admin');
      res.headers.set('X-User-Has-Token', String(!!token));
      res.headers.set('X-User-Role', String((token as any)?.xaseRole || (token as any)?.role || 'unknown'));
      res.headers.set('X-Req-Id', reqId);
      res.headers.set('X-Env', env);
      res.headers.set('X-Path', pathname);
      console.log(JSON.stringify({ tag: 'mw_redirect', reqId, reason: 'not_admin', from: pathname, to: '/login', callbackUrl: pathname, role: (token as any)?.xaseRole || (token as any)?.role || null }));
      return applySecurityHeaders(res);
    }
  }
    return applySecurityHeaders(NextResponse.next());
  }

  // Se não estiver logado, redireciona para login
  if (!token && normalizedPath !== '/login') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const res = NextResponse.redirect(loginUrl);
    res.headers.set('X-Auth-Reason', 'no_token');
    res.headers.set('X-Req-Id', reqId);
    res.headers.set('X-Env', env);
    res.headers.set('X-Path', pathname);
    console.log(JSON.stringify({ tag: 'mw_redirect', reqId, reason: 'no_token', from: pathname, to: '/login', callbackUrl: pathname }));
    return applySecurityHeaders(res);
  }

  // Verifica acesso à área restrita
  if (normalizedPath.startsWith('/series-restrito')) {
    if (!token?.isPremium) {
      const url = new URL('/planos', request.url);
      const res = NextResponse.redirect(url);
      res.headers.set('X-Redirect-Reason', 'not_premium');
      res.headers.set('X-Req-Id', reqId);
      res.headers.set('X-Env', env);
      res.headers.set('X-Path', pathname);
      console.log(JSON.stringify({ tag: 'mw_redirect', reqId, reason: 'not_premium', from: pathname, to: '/planos' }));
      return applySecurityHeaders(res);
    }
  }

  // Verifica acesso à página de planos
  if (normalizedPath === '/planos') {
    if (token?.isPremium) {
      const url = new URL('/series-restrito', request.url);
      const res = NextResponse.redirect(url);
      res.headers.set('X-Redirect-Reason', 'premium_to_restricted');
      res.headers.set('X-Req-Id', reqId);
      res.headers.set('X-Env', env);
      res.headers.set('X-Path', pathname);
      console.log(JSON.stringify({ tag: 'mw_redirect', reqId, reason: 'premium_to_restricted', from: pathname, to: '/series-restrito' }));
      return applySecurityHeaders(res);
    }
    return applySecurityHeaders(NextResponse.next()); // Allow access to /planos for non-premium users
  }

  // Redirect root (/) to dashboard (default)
  if (normalizedPath === '/') {
    const url = new URL('/app/dashboard', request.url);
    const res = NextResponse.redirect(url);
    res.headers.set('X-Redirect-Reason', 'root_redirect');
    res.headers.set('X-Req-Id', reqId);
    res.headers.set('X-Env', env);
    res.headers.set('X-Path', pathname);
    console.log(JSON.stringify({ tag: 'mw_redirect', reqId, reason: 'root_redirect', from: pathname, to: '/app/dashboard' }));
    return applySecurityHeaders(res);
  }

  // Redirect /xase (legacy) to dashboard
  if (normalizedPath === '/xase') {
    const url = new URL('/app/dashboard', request.url);
    const res = NextResponse.redirect(url);
    res.headers.set('X-Redirect-Reason', 'legacy_xase_redirect');
    res.headers.set('X-Req-Id', reqId);
    res.headers.set('X-Env', env);
    res.headers.set('X-Path', pathname);
    console.log(JSON.stringify({ tag: 'mw_redirect', reqId, reason: 'legacy_xase_redirect', from: pathname, to: '/app/dashboard' }));
    return applySecurityHeaders(res);
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/login',
    '/register',
    '/planos',
    '/series-restrito/:path*',
    '/xase/:path*',
    '/api/v1/:path*',
    '/admin/:path*',
    '/profile',
    '/',
  ],
};
