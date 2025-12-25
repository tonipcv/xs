import { NextAuthOptions } from "next-auth"
import { prisma } from "@/lib/prisma"
import CredentialsProvider from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { sendEmail } from "@/lib/email"
import { generateEmailOtpCode, isEmailOtpExpired, verifyTotp } from "@/lib/otp"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        otp: { label: 'One-Time Code', type: 'text', placeholder: '000000' },
        totp: { label: 'Authenticator Code', type: 'text', placeholder: '000000' }
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
            totpSecret: true
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

        // Se TOTP estiver habilitado, exigir código do autenticador
        if (user.twoFactorEnabled) {
          const totp = (credentials as any).totp || (credentials as any).otp
          if (!totp || !user.totpSecret) {
            throw new Error('TOTP_REQUIRED')
          }
          const ok = verifyTotp(String(totp), user.totpSecret)
          if (!ok) {
            throw new Error('TOTP_INVALID')
          }
          return {
            id: user.id,
            name: user.name || "",
            email: user.email,
            image: user.image
          } as any
        }

        // Fluxo de OTP por e-mail (dois passos)
        const otp = (credentials as any).otp
        if (otp) {
          // Validar OTP recebido
          if (!user.emailOtpCode || !user.emailOtpExpires || isEmailOtpExpired(user.emailOtpExpires)) {
            throw new Error('OTP_EXPIRED')
          }
          if (String(otp) !== user.emailOtpCode) {
            throw new Error('OTP_INVALID')
          }
          // Limpar OTP após uso
          await prisma.user.update({
            where: { id: user.id },
            data: { emailOtpCode: null, emailOtpExpires: null }
          })
          return {
            id: user.id,
            name: user.name || "",
            email: user.email,
            image: user.image
          } as any
        }

        // Primeira etapa: gerar e enviar OTP por email e sinalizar requisito
        const code = generateEmailOtpCode()
        const expires = new Date(Date.now() + 10 * 60 * 1000) // 10 min
        await prisma.user.update({
          where: { id: user.id },
          data: { emailOtpCode: code, emailOtpExpires: expires }
        })
        try {
          await sendEmail({
            to: user.email!,
            subject: 'Seu código de login',
            html: `
              <p>Seu código de login é:</p>
              <p style="font-size: 24px; font-weight: bold;">${code}</p>
              <p>Este código expira em 10 minutos.</p>
            `
          })
        } catch (e) {
          // se email falhar, ainda assim forçamos novo pedido
        }
        throw new Error('OTP_REQUIRED')
      }
    })
  ],
  pages: {
    signIn: '/login',
  },
  debug: process.env.NODE_ENV === 'development',
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
} 