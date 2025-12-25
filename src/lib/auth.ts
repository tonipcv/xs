import { NextAuthOptions } from 'next-auth'
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
      async authorize(credentials) {
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
            emailOtpCode: true,
            emailOtpExpires: true,
            twoFactorEnabled: true,
            totpSecret: true,
            isPremium: true,
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

        // TOTP habilitado: exigir totp/otp
        if (user.twoFactorEnabled) {
          const totp = (credentials as any).totp || (credentials as any).otp
          if (!totp || !user.totpSecret) {
            throw new Error('TOTP_REQUIRED')
          }
          const ok = verifyTotp(String(totp), user.totpSecret)
          if (!ok) throw new Error('TOTP_INVALID')
          return {
            id: user.id,
            name: user.name || "",
            email: user.email,
            image: user.image,
            isPremium: user.isPremium || false
          }
        }

        // Fluxo OTP e-mail (dois passos)
        const otp = (credentials as any).otp
        if (otp) {
          if (!user.emailOtpCode || !user.emailOtpExpires || isEmailOtpExpired(user.emailOtpExpires)) {
            throw new Error('OTP_EXPIRED')
          }
          if (String(otp) !== user.emailOtpCode) throw new Error('OTP_INVALID')
          await prisma.user.update({ where: { id: user.id }, data: { emailOtpCode: null, emailOtpExpires: null } })
          return {
            id: user.id,
            name: user.name || "",
            email: user.email,
            image: user.image,
            isPremium: user.isPremium || false
          }
        }

        const code = generateEmailOtpCode()
        const expires = new Date(Date.now() + 10 * 60 * 1000)
        await prisma.user.update({ where: { id: user.id }, data: { emailOtpCode: code, emailOtpExpires: expires } })
        try {
          await sendEmail({
            to: user.email!,
            subject: 'Seu código de login',
            html: `<p>Seu código de login é:</p><p style="font-size:24px;font-weight:bold;">${code}</p><p>Expira em 10 minutos.</p>`
          })
        } catch {}
        throw new Error('OTP_REQUIRED')
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
    async jwt({ token, user }) {
      if (user) {
        token.isPremium = user.isPremium;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.isPremium = token.isPremium as boolean;
        session.user.id = token.id as string;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
} 