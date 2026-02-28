/**
 * Email Templates for XASE Platform
 * All critical email types with HTML templates
 */

export interface EmailTemplate {
  subject: string;
  html: string;
}

export interface WelcomeEmailData {
  name: string;
  email: string;
  verificationUrl?: string;
}

export interface PasswordResetEmailData {
  name: string;
  resetUrl: string;
  expiresIn: string;
}

export interface EmailVerificationData {
  name: string;
  verificationUrl: string;
}

export interface LeaseExpiringEmailData {
  name: string;
  leaseId: string;
  datasetName: string;
  expiresAt: string;
  timeRemaining: string;
  renewUrl: string;
}

export interface AccessRequestEmailData {
  supplierName: string;
  requesterName: string;
  requesterEmail: string;
  datasetName: string;
  purpose: string;
  requestUrl: string;
}

export interface PolicyExpiredEmailData {
  name: string;
  policyName: string;
  datasetName: string;
  expiredAt: string;
  dashboardUrl: string;
}

export interface BillingThresholdEmailData {
  name: string;
  currentUsage: number;
  threshold: number;
  percentage: number;
  billingUrl: string;
}

const baseStyles = `
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }
    .content {
      background: #ffffff;
      padding: 30px;
      border: 1px solid #e5e7eb;
      border-top: none;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
    }
    .button:hover {
      background: #5568d3;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #6b7280;
      font-size: 14px;
    }
    .alert {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
    }
    .alert-danger {
      background: #fee2e2;
      border-left: 4px solid #ef4444;
    }
    .info-box {
      background: #f3f4f6;
      padding: 15px;
      border-radius: 6px;
      margin: 15px 0;
    }
  </style>
`;

export function generateWelcomeEmail(data: WelcomeEmailData): EmailTemplate {
  return {
    subject: 'Welcome to XASE - Your Account is Ready',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1>Welcome to XASE</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.name}!</h2>
          <p>Welcome to XASE - the secure data marketplace for healthcare and financial AI.</p>
          
          <p>Your account has been successfully created with the email: <strong>${data.email}</strong></p>
          
          ${data.verificationUrl ? `
            <div class="alert">
              <strong>Action Required:</strong> Please verify your email address to activate all features.
            </div>
            <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
          ` : ''}
          
          <div class="info-box">
            <h3>Getting Started</h3>
            <ul>
              <li>Explore the marketplace for datasets</li>
              <li>Create and publish your own datasets</li>
              <li>Set up governance policies</li>
              <li>Manage access leases</li>
            </ul>
          </div>
          
          <p>If you have any questions, our support team is here to help.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} XASE. All rights reserved.</p>
          <p>This is an automated message, please do not reply.</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function generatePasswordResetEmail(data: PasswordResetEmailData): EmailTemplate {
  return {
    subject: 'Reset Your XASE Password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.name},</h2>
          <p>We received a request to reset your password for your XASE account.</p>
          
          <p>Click the button below to create a new password:</p>
          
          <a href="${data.resetUrl}" class="button">Reset Password</a>
          
          <div class="alert">
            <strong>Security Notice:</strong> This link will expire in ${data.expiresIn}.
          </div>
          
          <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
          
          <div class="info-box">
            <p><strong>For your security:</strong></p>
            <ul>
              <li>Never share your password with anyone</li>
              <li>Use a strong, unique password</li>
              <li>Enable two-factor authentication</li>
            </ul>
          </div>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} XASE. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function generateEmailVerification(data: EmailVerificationData): EmailTemplate {
  return {
    subject: 'Verify Your XASE Email Address',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1>Email Verification</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.name},</h2>
          <p>Please verify your email address to complete your XASE account setup.</p>
          
          <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
          
          <p>This verification link will expire in 24 hours.</p>
          
          <p>If you didn't create a XASE account, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} XASE. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function generateLeaseExpiringEmail(data: LeaseExpiringEmailData, urgency: '30min' | '5min'): EmailTemplate {
  const isUrgent = urgency === '5min';
  
  return {
    subject: `${isUrgent ? '🚨 URGENT: ' : '⚠️ '}Your Data Lease Expires in ${data.timeRemaining}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1>${isUrgent ? '🚨 Urgent' : '⚠️ Warning'}: Lease Expiring Soon</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.name},</h2>
          
          <div class="${isUrgent ? 'alert-danger' : 'alert'}">
            <strong>${isUrgent ? 'URGENT:' : 'Warning:'}</strong> Your data access lease will expire in <strong>${data.timeRemaining}</strong>.
          </div>
          
          <div class="info-box">
            <p><strong>Lease Details:</strong></p>
            <ul>
              <li><strong>Lease ID:</strong> ${data.leaseId}</li>
              <li><strong>Dataset:</strong> ${data.datasetName}</li>
              <li><strong>Expires At:</strong> ${data.expiresAt}</li>
            </ul>
          </div>
          
          <p>After expiration, all active sessions will be terminated and access will be revoked.</p>
          
          <a href="${data.renewUrl}" class="button">Renew Lease Now</a>
          
          <p>If you no longer need access, no action is required.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} XASE. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function generateAccessRequestEmail(data: AccessRequestEmailData): EmailTemplate {
  return {
    subject: `New Access Request for ${data.datasetName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1>New Data Access Request</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.supplierName},</h2>
          <p>You have received a new access request for your dataset.</p>
          
          <div class="info-box">
            <p><strong>Request Details:</strong></p>
            <ul>
              <li><strong>Dataset:</strong> ${data.datasetName}</li>
              <li><strong>Requester:</strong> ${data.requesterName}</li>
              <li><strong>Email:</strong> ${data.requesterEmail}</li>
              <li><strong>Purpose:</strong> ${data.purpose}</li>
            </ul>
          </div>
          
          <a href="${data.requestUrl}" class="button">Review Request</a>
          
          <p>You can approve, reject, or negotiate terms for this request.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} XASE. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function generatePolicyExpiredEmail(data: PolicyExpiredEmailData): EmailTemplate {
  return {
    subject: `Policy Expired: ${data.policyName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1>Policy Expiration Notice</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.name},</h2>
          
          <div class="alert">
            <strong>Notice:</strong> A governance policy has expired.
          </div>
          
          <div class="info-box">
            <p><strong>Policy Details:</strong></p>
            <ul>
              <li><strong>Policy:</strong> ${data.policyName}</li>
              <li><strong>Dataset:</strong> ${data.datasetName}</li>
              <li><strong>Expired At:</strong> ${data.expiredAt}</li>
            </ul>
          </div>
          
          <p>All leases associated with this policy have been automatically revoked. No new leases can be issued until you create a new policy.</p>
          
          <a href="${data.dashboardUrl}" class="button">Go to Dashboard</a>
          
          <p>To restore access, please create and activate a new governance policy.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} XASE. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function generateBillingThresholdEmail(data: BillingThresholdEmailData): EmailTemplate {
  return {
    subject: `⚠️ Billing Alert: ${data.percentage}% of Threshold Reached`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1>⚠️ Billing Threshold Alert</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.name},</h2>
          
          <div class="alert">
            <strong>Alert:</strong> Your usage has reached <strong>${data.percentage}%</strong> of your billing threshold.
          </div>
          
          <div class="info-box">
            <p><strong>Usage Summary:</strong></p>
            <ul>
              <li><strong>Current Usage:</strong> $${data.currentUsage.toFixed(2)}</li>
              <li><strong>Threshold:</strong> $${data.threshold.toFixed(2)}</li>
              <li><strong>Percentage:</strong> ${data.percentage}%</li>
            </ul>
          </div>
          
          <p>To avoid service interruption, please review your usage and consider upgrading your plan or adjusting your threshold.</p>
          
          <a href="${data.billingUrl}" class="button">View Billing Dashboard</a>
          
          <div class="info-box">
            <p><strong>What happens when I reach 100%?</strong></p>
            <p>When you reach your billing threshold, new lease requests may be restricted until you increase your limit or upgrade your plan.</p>
          </div>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} XASE. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
  };
}
