/**
 * XASE Email Service
 * Comprehensive SMTP email sending with templates and retry logic
 */

import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import {
  generateWelcomeEmail,
  generatePasswordResetEmail,
  generateEmailVerification,
  generateLeaseExpiringEmail,
  generateAccessRequestEmail,
  generatePolicyExpiredEmail,
  generateBillingThresholdEmail,
  type WelcomeEmailData,
  type PasswordResetEmailData,
  type EmailVerificationData,
  type LeaseExpiringEmailData,
  type AccessRequestEmailData,
  type PolicyExpiredEmailData,
  type BillingThresholdEmailData,
} from './email/templates'

let transporter: Transporter | null = null
let isConfigured = false

function getTransporter(): Transporter {
  if (!transporter) {
    const smtpHost = process.env.SMTP_HOST
    const smtpPort = process.env.SMTP_PORT
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      console.warn('SMTP not configured. Emails will not be sent.')
      isConfigured = false
      throw new Error('SMTP configuration missing')
    }

    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    })

    isConfigured = true
  }

  return transporter
}

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  retries?: number
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string }> {
  const { to, subject, html, text, retries = 3 } = options

  if (!isConfigured) {
    try {
      getTransporter()
    } catch (error) {
      console.error('Email not sent - SMTP not configured:', { to, subject })
      return { success: false }
    }
  }

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const transport = getTransporter()
      
      if (attempt === 1) {
        await transport.verify()
      }

      const info = await transport.sendMail({
        from: {
          name: process.env.EMAIL_FROM_NAME || 'XASE',
          address: process.env.EMAIL_FROM_ADDRESS || 'no-reply@xase.ai',
        },
        to,
        subject,
        html,
        text,
      })

      console.log('Email sent successfully:', {
        to,
        subject,
        messageId: info.messageId,
        attempt,
      })

      return { success: true, messageId: info.messageId }
    } catch (error) {
      lastError = error as Error
      console.error(`Email send attempt ${attempt}/${retries} failed:`, {
        to,
        subject,
        error: lastError.message,
      })

      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  console.error('Email failed after all retries:', {
    to,
    subject,
    error: lastError?.message,
  })

  return { success: false }
}

export async function sendWelcomeEmail(to: string, data: WelcomeEmailData): Promise<{ success: boolean }> {
  const template = generateWelcomeEmail(data)
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  })
}

export async function sendPasswordResetEmail(to: string, data: PasswordResetEmailData): Promise<{ success: boolean }> {
  const template = generatePasswordResetEmail(data)
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  })
}

export async function sendEmailVerification(to: string, data: EmailVerificationData): Promise<{ success: boolean }> {
  const template = generateEmailVerification(data)
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  })
}

export async function sendLeaseExpiringEmail(
  to: string,
  data: LeaseExpiringEmailData,
  urgency: '30min' | '5min'
): Promise<{ success: boolean }> {
  const template = generateLeaseExpiringEmail(data, urgency)
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  })
}

export async function sendAccessRequestEmail(to: string, data: AccessRequestEmailData): Promise<{ success: boolean }> {
  const template = generateAccessRequestEmail(data)
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  })
}

export async function sendPolicyExpiredEmail(to: string, data: PolicyExpiredEmailData): Promise<{ success: boolean }> {
  const template = generatePolicyExpiredEmail(data)
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  })
}

export async function sendBillingThresholdEmail(to: string, data: BillingThresholdEmailData): Promise<{ success: boolean }> {
  const template = generateBillingThresholdEmail(data)
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  })
}

export async function verifyEmailConfiguration(): Promise<boolean> {
  try {
    const transport = getTransporter()
    await transport.verify()
    console.log('SMTP configuration verified successfully')
    return true
  } catch (error) {
    console.error('SMTP configuration verification failed:', error)
    return false
  }
} 