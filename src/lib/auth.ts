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
      // If redirecting after login, check organization type
      if (url === baseUrl || url === `${baseUrl}/` || url.startsWith(`${baseUrl}/login`)) {
        try {
          // This is a post-login redirect, determine the right dashboard
          // We'll use a default and let the client-side handle the actual redirect
          return `${baseUrl}/xase/voice`;
        } catch (error) {
          console.error('Redirect error:', error);
          return `${baseUrl}/xase/voice`;
        }
      }
      // Allow callback URLs
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
} 