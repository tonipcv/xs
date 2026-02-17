import { NextAuthOptions, User } from "next-auth"
import { JWT } from "next-auth/jwt"
import { prisma } from "@/lib/prisma"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { verifyTotp } from "@/lib/otp"

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
        totp: { label: 'Authenticator Code', type: 'text' },
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
            tenantId: true,
            xaseRole: true,
            twoFactorEnabled: true,
            totpSecret: true,
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

        // If 2FA is enabled, require TOTP code
        if (user.twoFactorEnabled && user.totpSecret) {
          const totp = (credentials as any)?.totp as string | undefined
          if (!totp) {
            // Special marker to tell the client to ask for TOTP
            throw new Error('__2FA_REQUIRED__')
          }
          if (!verifyTotp(totp, user.totpSecret)) {
            throw new Error('Código 2FA inválido')
          }
        }

        return {
          id: user.id,
          name: user.name || "",
          email: user.email,
          image: user.image || null,
          tenantId: user.tenantId,
          xaseRole: user.xaseRole,
        } as User & { tenantId: string | null; xaseRole: string | null }
      }
    })
  ],
  pages: {
    signIn: '/login',
  },
  debug: process.env.NODE_ENV === 'development',
  session: {
    strategy: "jwt",
    maxAge: 2 * 60 * 60, // 2 hours
  },
  jwt: {
    maxAge: 2 * 60 * 60, // 2 hours
  },
  callbacks: {
    async jwt({ token, user, account }: { token: JWT; user?: User; account?: any }) {
      if (user) {
        token.id = user.id;
        token.tenantId = (user as any).tenantId;
        token.xaseRole = (user as any).xaseRole;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: JWT }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).xaseRole = token.xaseRole;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      const appBase = process.env.NEXT_PUBLIC_APP_URL || baseUrl;
      // Post-login: always send user to dashboard (absolute URL)
      if (url === baseUrl || url === `${baseUrl}/` || url.startsWith(`${baseUrl}/login`)) {
        return `${appBase}/app/dashboard`;
      }
      // If url is absolute within our base, allow
      if (url.startsWith(appBase)) return url;
      // If url is a relative path, resolve against appBase
      if (url.startsWith('/')) return `${appBase}${url}`;
      // Fallback to base
      return appBase;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
} 