/**
 * EMAIL TEMPLATES
 * Manage email templates with variable substitution
 */

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  html: string
  text?: string
  variables: string[]
}

export interface EmailData {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
}

export class EmailTemplates {
  private static templates: Map<string, EmailTemplate> = new Map()

  /**
   * Register template
   */
  static register(template: EmailTemplate): void {
    this.templates.set(template.id, template)
  }

  /**
   * Get template
   */
  static get(id: string): EmailTemplate | undefined {
    return this.templates.get(id)
  }

  /**
   * Render template
   */
  static render(
    templateId: string,
    variables: Record<string, any>
  ): { subject: string; html: string; text?: string } | null {
    const template = this.templates.get(templateId)
    if (!template) return null

    const subject = this.replaceVariables(template.subject, variables)
    const html = this.replaceVariables(template.html, variables)
    const text = template.text
      ? this.replaceVariables(template.text, variables)
      : undefined

    return { subject, html, text }
  }

  /**
   * Replace variables in string
   */
  private static replaceVariables(
    template: string,
    variables: Record<string, any>
  ): string {
    let result = template

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
      result = result.replace(regex, String(value))
    }

    return result
  }

  /**
   * Create email data
   */
  static createEmail(
    templateId: string,
    to: string,
    variables: Record<string, any>,
    from?: string
  ): EmailData | null {
    const rendered = this.render(templateId, variables)
    if (!rendered) return null

    return {
      to,
      from,
      ...rendered,
    }
  }

  /**
   * Register default templates
   */
  static registerDefaultTemplates(): void {
    this.register({
      id: 'welcome',
      name: 'Welcome Email',
      subject: 'Welcome to {{appName}}!',
      html: `
        <h1>Welcome {{userName}}!</h1>
        <p>Thank you for joining {{appName}}.</p>
        <p>Your account has been created successfully.</p>
        <a href="{{loginUrl}}">Login to your account</a>
      `,
      text: 'Welcome {{userName}}! Thank you for joining {{appName}}.',
      variables: ['userName', 'appName', 'loginUrl'],
    })

    this.register({
      id: 'password_reset',
      name: 'Password Reset',
      subject: 'Reset your password',
      html: `
        <h1>Password Reset Request</h1>
        <p>Hi {{userName}},</p>
        <p>We received a request to reset your password.</p>
        <a href="{{resetUrl}}">Reset Password</a>
        <p>This link will expire in {{expiryHours}} hours.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      text: 'Hi {{userName}}, click this link to reset your password: {{resetUrl}}',
      variables: ['userName', 'resetUrl', 'expiryHours'],
    })

    this.register({
      id: 'verification',
      name: 'Email Verification',
      subject: 'Verify your email',
      html: `
        <h1>Verify Your Email</h1>
        <p>Hi {{userName}},</p>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="{{verifyUrl}}">Verify Email</a>
        <p>Verification code: <strong>{{code}}</strong></p>
      `,
      text: 'Hi {{userName}}, verify your email: {{verifyUrl}} Code: {{code}}',
      variables: ['userName', 'verifyUrl', 'code'],
    })

    this.register({
      id: 'alert',
      name: 'System Alert',
      subject: '[{{severity}}] {{title}}',
      html: `
        <h1>System Alert</h1>
        <p><strong>Severity:</strong> {{severity}}</p>
        <p><strong>Title:</strong> {{title}}</p>
        <p><strong>Message:</strong> {{message}}</p>
        <p><strong>Time:</strong> {{timestamp}}</p>
        <a href="{{dashboardUrl}}">View Dashboard</a>
      `,
      text: '[{{severity}}] {{title}}: {{message}}',
      variables: ['severity', 'title', 'message', 'timestamp', 'dashboardUrl'],
    })

    this.register({
      id: 'invoice',
      name: 'Invoice',
      subject: 'Invoice #{{invoiceNumber}} - {{amount}}',
      html: `
        <h1>Invoice #{{invoiceNumber}}</h1>
        <p>Hi {{customerName}},</p>
        <p>Thank you for your business!</p>
        <p><strong>Amount:</strong> {{amount}}</p>
        <p><strong>Due Date:</strong> {{dueDate}}</p>
        <a href="{{invoiceUrl}}">View Invoice</a>
      `,
      text: 'Invoice #{{invoiceNumber}} for {{amount}}. Due: {{dueDate}}',
      variables: ['invoiceNumber', 'customerName', 'amount', 'dueDate', 'invoiceUrl'],
    })
  }

  /**
   * List all templates
   */
  static list(): EmailTemplate[] {
    return Array.from(this.templates.values())
  }

  /**
   * Validate template variables
   */
  static validateVariables(
    templateId: string,
    variables: Record<string, any>
  ): { valid: boolean; missing: string[] } {
    const template = this.templates.get(templateId)
    if (!template) {
      return { valid: false, missing: [] }
    }

    const missing = template.variables.filter(v => !(v in variables))

    return {
      valid: missing.length === 0,
      missing,
    }
  }

  /**
   * Preview template
   */
  static preview(
    templateId: string,
    variables: Record<string, any>
  ): string | null {
    const rendered = this.render(templateId, variables)
    if (!rendered) return null

    return `
      <div style="border: 1px solid #ccc; padding: 20px; margin: 20px;">
        <h3>Subject: ${rendered.subject}</h3>
        <hr>
        ${rendered.html}
      </div>
    `
  }
}

// Initialize default templates
EmailTemplates.registerDefaultTemplates()
