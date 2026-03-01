/**
 * Email Service - SMTP Implementation
 * Complete email sending functionality for all platform events
 */

import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

// Create SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

/**
 * Send email via SMTP
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const from = options.from || process.env.SMTP_FROM || 'noreply@xase.ai';
    
    const mailOptions = {
      from,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      cc: options.cc?.join(', '),
      bcc: options.bcc?.join(', '),
      attachments: options.attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent:', info.messageId);
    
    // Log email sent
    await prisma.auditLog.create({
      data: {
        action: 'EMAIL_SENT',
        resourceType: 'email',
        resourceId: info.messageId,
        metadata: JSON.stringify({
          to: options.to,
          subject: options.subject,
          messageId: info.messageId,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    
    // Log email failure
    await prisma.auditLog.create({
      data: {
        action: 'EMAIL_FAILED',
        resourceType: 'email',
        resourceId: 'failed',
        metadata: JSON.stringify({
          to: options.to,
          subject: options.subject,
          error: (error as Error).message,
        }),
        status: 'FAILED',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return false;
  }
}

/**
 * Send welcome email (1.10)
 */
export async function sendWelcomeEmail(
  email: string,
  name: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Welcome to XASE Sheets!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0070f3;">Welcome to XASE Sheets!</h1>
        
        <p>Hi ${name},</p>
        
        <p>Thank you for joining XASE Sheets, the secure data marketplace for AI training.</p>
        
        <h2>Getting Started</h2>
        <ul>
          <li>Upload your first dataset</li>
          <li>Configure access policies</li>
          <li>Publish to the marketplace</li>
          <li>Start earning from your data</li>
        </ul>
        
        <div style="margin: 30px 0;">
          <a href="${process.env.NEXTAUTH_URL}/dashboard" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Go to Dashboard
          </a>
        </div>
        
        <p>If you have any questions, feel free to reach out to our support team.</p>
        
        <p>Best regards,<br>The XASE Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        
        <p style="color: #666; font-size: 12px;">
          XASE Sheets - Secure Data Marketplace<br>
          <a href="${process.env.NEXTAUTH_URL}">${process.env.NEXTAUTH_URL}</a>
        </p>
      </div>
    `,
  });
}

/**
 * Send password recovery email (1.4)
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string
): Promise<boolean> {
  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`;
  
  return sendEmail({
    to: email,
    subject: 'Reset Your Password - XASE Sheets',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        
        <p>We received a request to reset your password for your XASE Sheets account.</p>
        
        <p>Click the button below to reset your password:</p>
        
        <div style="margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p>This link will expire in 1 hour.</p>
        
        <p>If you didn't request this, you can safely ignore this email.</p>
        
        <p>Best regards,<br>The XASE Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        
        <p style="color: #666; font-size: 12px;">
          If the button doesn't work, copy and paste this URL into your browser:<br>
          <a href="${resetUrl}">${resetUrl}</a>
        </p>
      </div>
    `,
  });
}

/**
 * Send email verification (1.6)
 */
export async function sendEmailVerification(
  email: string,
  verificationToken: string
): Promise<boolean> {
  const verifyUrl = `${process.env.NEXTAUTH_URL}/verify-email?token=${verificationToken}`;
  
  return sendEmail({
    to: email,
    subject: 'Verify Your Email - XASE Sheets',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Verify Your Email Address</h2>
        
        <p>Please verify your email address to complete your XASE Sheets registration.</p>
        
        <div style="margin: 30px 0;">
          <a href="${verifyUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email
          </a>
        </div>
        
        <p>This link will expire in 24 hours.</p>
        
        <p>Best regards,<br>The XASE Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        
        <p style="color: #666; font-size: 12px;">
          If the button doesn't work, copy and paste this URL into your browser:<br>
          <a href="${verifyUrl}">${verifyUrl}</a>
        </p>
      </div>
    `,
  });
}

/**
 * Send lease expiring alert - 30 minutes (5.12)
 */
export async function sendLeaseExpiringAlert30Min(
  email: string,
  leaseId: string,
  datasetName: string,
  expiresAt: Date
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: '⚠️ Your Data Lease Expires in 30 Minutes',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff9800;">⚠️ Lease Expiring Soon</h2>
        
        <p>Your data access lease is about to expire:</p>
        
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Dataset:</strong> ${datasetName}<br>
          <strong>Lease ID:</strong> ${leaseId}<br>
          <strong>Expires:</strong> ${expiresAt.toLocaleString()}<br>
          <strong>Time Remaining:</strong> 30 minutes
        </div>
        
        <p>To continue accessing this dataset, you can renew your lease:</p>
        
        <div style="margin: 30px 0;">
          <a href="${process.env.NEXTAUTH_URL}/leases/${leaseId}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Renew Lease
          </a>
        </div>
        
        <p>Best regards,<br>The XASE Team</p>
      </div>
    `,
  });
}

/**
 * Send lease expiring alert - 5 minutes (5.12)
 */
export async function sendLeaseExpiringAlert5Min(
  email: string,
  leaseId: string,
  datasetName: string,
  expiresAt: Date
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: '🚨 URGENT: Your Data Lease Expires in 5 Minutes',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f44336;">🚨 URGENT: Lease Expiring</h2>
        
        <p><strong>Your data access lease expires in 5 minutes!</strong></p>
        
        <div style="background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
          <strong>Dataset:</strong> ${datasetName}<br>
          <strong>Lease ID:</strong> ${leaseId}<br>
          <strong>Expires:</strong> ${expiresAt.toLocaleString()}<br>
          <strong>Time Remaining:</strong> 5 minutes
        </div>
        
        <p>Renew now to avoid interruption:</p>
        
        <div style="margin: 30px 0;">
          <a href="${process.env.NEXTAUTH_URL}/leases/${leaseId}" style="background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Renew Now
          </a>
        </div>
        
        <p>Best regards,<br>The XASE Team</p>
      </div>
    `,
  });
}

/**
 * Send new access request notification to supplier (4.10)
 */
export async function sendAccessRequestNotification(
  supplierEmail: string,
  datasetName: string,
  clientName: string,
  purpose: string,
  requestId: string
): Promise<boolean> {
  return sendEmail({
    to: supplierEmail,
    subject: '📋 New Access Request for Your Dataset',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Access Request</h2>
        
        <p>You have received a new access request for your dataset:</p>
        
        <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Dataset:</strong> ${datasetName}<br>
          <strong>Requested by:</strong> ${clientName}<br>
          <strong>Purpose:</strong> ${purpose}<br>
          <strong>Request ID:</strong> ${requestId}
        </div>
        
        <p>Review and approve or deny this request:</p>
        
        <div style="margin: 30px 0;">
          <a href="${process.env.NEXTAUTH_URL}/requests/${requestId}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Review Request
          </a>
        </div>
        
        <p>Best regards,<br>The XASE Team</p>
      </div>
    `,
  });
}

/**
 * Send policy expired notification (3.14)
 */
export async function sendPolicyExpiredNotification(
  email: string,
  policyId: string,
  datasetName: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: '⚠️ Access Policy Expired',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff9800;">Policy Expired</h2>
        
        <p>An access policy for your dataset has expired:</p>
        
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Dataset:</strong> ${datasetName}<br>
          <strong>Policy ID:</strong> ${policyId}
        </div>
        
        <p>Active leases using this policy will continue until their expiration, but no new leases can be issued.</p>
        
        <p>To allow new access, create a new policy:</p>
        
        <div style="margin: 30px 0;">
          <a href="${process.env.NEXTAUTH_URL}/policies/create" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Create New Policy
          </a>
        </div>
        
        <p>Best regards,<br>The XASE Team</p>
      </div>
    `,
  });
}

/**
 * Send billing threshold exceeded alert (7.11)
 */
export async function sendBillingThresholdAlert(
  email: string,
  currentUsage: number,
  threshold: number,
  billingPeriod: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: '💰 Billing Threshold Exceeded',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff9800;">Billing Alert</h2>
        
        <p>Your usage has exceeded the configured billing threshold:</p>
        
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Current Usage:</strong> $${currentUsage.toFixed(2)}<br>
          <strong>Threshold:</strong> $${threshold.toFixed(2)}<br>
          <strong>Billing Period:</strong> ${billingPeriod}<br>
          <strong>Percentage:</strong> ${((currentUsage / threshold) * 100).toFixed(1)}%
        </div>
        
        <p>Review your usage and billing details:</p>
        
        <div style="margin: 30px 0;">
          <a href="${process.env.NEXTAUTH_URL}/billing" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Billing
          </a>
        </div>
        
        <p>Best regards,<br>The XASE Team</p>
      </div>
    `,
  });
}

/**
 * Test SMTP connection
 */
export async function testEmailConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log('✅ SMTP connection successful');
    return true;
  } catch (error) {
    console.error('❌ SMTP connection failed:', error);
    return false;
  }
}
