import { NextAuthOptions, User } from 'next-auth'
import { JWT } from 'next-auth/jwt'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { compare } from 'bcryptjs'
import { sendEmail } from '@/lib/email'
import { generateEmailOtpCode, isEmailOtpExpired, verifyTotp } from '@/lib/otp'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        otp: { label: 'One-Time Code', type: 'text' },
        totp: { label: 'Authenticator Code', type: 'text' }
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Credenciais inválidas')
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            image: true,
          }
        })

        if (!user || !user.password) {
          throw new Error('Usuário não encontrado')
        }

        const isCorrectPassword = await compare(
          credentials.password,
          user.password
        )

        if (!isCorrectPassword) {
          throw new Error('Senha incorreta')
        }

        // Login direto com email + senha (OTP/2FA removido)
        return {
          id: user.id,
          name: user.name || "",
          email: user.email,
          image: user.image || null,
          isPremium: false,
        }
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/login',
  },
  debug: process.env.NODE_ENV === 'development',
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) {
        token.isPremium = user.isPremium;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: JWT }) {
      if (session.user) {
        session.user.isPremium = token.isPremium as boolean;
        session.user.id = token.id as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      const appBase = process.env.NEXT_PUBLIC_APP_URL || baseUrl;
      // Post-login default
      if (url === baseUrl || url === `${baseUrl}/` || url.startsWith(`${baseUrl}/login`)) {
        return `${appBase}/app/dashboard`;
      }
      // If url is absolute within our base, allow
      if (url.startsWith(appBase)) return url;
      // If url is relative, resolve against appBase
      if (url.startsWith('/')) return `${appBase}${url}`;
      // Fallback
      return appBase;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
} 