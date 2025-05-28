// middleware.ts
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;
  
  // Normalize pathname to lowercase for consistent matching
  const normalizedPath = pathname.toLowerCase();

  console.log('Middleware - Path:', pathname);
  console.log('Middleware - Token:', token ? 'Existe' : 'Não existe');

  // Rotas públicas que não precisam de autenticação
  const publicRoutes = ['/login', '/register', '/forgot-password'];
  if (publicRoutes.includes(normalizedPath)) {
    // Se estiver logado, redireciona para a home
    if (token) {
      console.log('Middleware - Usuário logado tentando acessar rota pública');
      return NextResponse.redirect(new URL('/whatsapp', request.url));
    }
    return NextResponse.next();
  }

  // Se não estiver logado, redireciona para login
  if (!token && normalizedPath !== '/login') {
    console.log('Middleware - Usuário não logado, redirecionando para login');
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verifica acesso à área restrita
  if (normalizedPath.startsWith('/series-restrito')) {
    if (!token?.isPremium) {
      console.log('Middleware - Usuário não premium tentando acessar área restrita');
      return NextResponse.redirect(new URL('/planos', request.url));
    }
  }

  // Verifica acesso à página de planos
  if (normalizedPath === '/planos') {
    if (token?.isPremium) {
      console.log('Middleware - Usuário premium tentando acessar planos');
      return NextResponse.redirect(new URL('/series-restrito', request.url));
    }
    return NextResponse.next(); // Allow access to /planos for non-premium users
  }

  // Redireciona a rota raiz (/) para o WhatsApp
  if (normalizedPath === '/') {
    return NextResponse.redirect(new URL('/whatsapp', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/register',
    '/planos',
    '/series-restrito/:path*',
    '/ia',
    '/IA',
    '/pedidos',
    '/whatsapp/:path*',
    '/ai-agent/:path*',
    '/profile',
    '/',
  ],
};
