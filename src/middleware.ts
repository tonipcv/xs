// middleware.ts
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;
  
  // Normalize pathname to lowercase for consistent matching
  const normalizedPath = pathname.toLowerCase();

  const reqId = request.headers.get('x-vercel-id') || request.headers.get('x-request-id') || String(Date.now()) + ':' + Math.random().toString(36).slice(2);
  const env = process.env.NODE_ENV || 'unknown';
  const host = request.headers.get('host') || '';
  console.log(JSON.stringify({ tag: 'mw_request', reqId, env, host, path: pathname, hasToken: !!token }));

  // Rotas públicas que não precisam de autenticação
  const publicRoutes = ['/login', '/register', '/forgot-password'];
  if (publicRoutes.includes(normalizedPath)) {
    // Se estiver logado, redireciona para a home
    if (token) {
      const url = new URL('/xase', request.url);
      const res = NextResponse.redirect(url);
      res.headers.set('X-Redirect-Reason', 'logged_in_public_route');
      res.headers.set('X-Req-Id', reqId);
      res.headers.set('X-Env', env);
      res.headers.set('X-Path', pathname);
      console.log(JSON.stringify({ tag: 'mw_redirect', reqId, reason: 'logged_in_public_route', from: pathname, to: '/xase' }));
      return res;
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
      return res;
    }
  }
    return NextResponse.next();
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
    return res;
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
      return res;
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
      return res;
    }
    return NextResponse.next(); // Allow access to /planos for non-premium users
  }

  // Redireciona a rota raiz (/) para o Xase
  if (normalizedPath === '/') {
    const url = new URL('/xase', request.url);
    const res = NextResponse.redirect(url);
    res.headers.set('X-Redirect-Reason', 'root_redirect');
    res.headers.set('X-Req-Id', reqId);
    res.headers.set('X-Env', env);
    res.headers.set('X-Path', pathname);
    console.log(JSON.stringify({ tag: 'mw_redirect', reqId, reason: 'root_redirect', from: pathname, to: '/xase' }));
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/register',
    '/planos',
    '/series-restrito/:path*',
    '/xase/:path*',
    '/admin/:path*',
    '/profile',
    '/',
  ],
};
