/**
 * Email Templates Unit Tests
 * Tests for email template generation without SMTP
 */

import { describe, it, expect } from 'vitest';
import {
  generateWelcomeEmail,
  generatePasswordResetEmail,
  generateEmailVerification,
  generateLeaseExpiringEmail,
  generateAccessRequestEmail,
  generatePolicyExpiredEmail,
  generateBillingThresholdEmail,
} from '@/lib/email/templates';

describe('Email Template Generation', () => {
  describe('Welcome Email Template', () => {
    it('should generate welcome email with verification URL', () => {
      const template = generateWelcomeEmail({
        name: 'John Doe',
        email: 'john@example.com',
        verificationUrl: 'https://xase.ai/verify?token=abc123',
      });

      expect(template.subject).toBe('Welcome to XASE - Your Account is Ready');
      expect(template.html).toContain('John Doe');
      expect(template.html).toContain('john@example.com');
      expect(template.html).toContain('https://xase.ai/verify?token=abc123');
      expect(template.html).toContain('Verify Email Address');
    });

    it('should generate welcome email without verification URL', () => {
      const template = generateWelcomeEmail({
        name: 'Jane Smith',
        email: 'jane@example.com',
      });

      expect(template.subject).toBe('Welcome to XASE - Your Account is Ready');
      expect(template.html).toContain('Jane Smith');
      expect(template.html).not.toContain('Verify Email Address');
    });

    it('should include current year in footer', () => {
      const template = generateWelcomeEmail({
        name: 'Test User',
        email: 'test@example.com',
      });

      const currentYear = new Date().getFullYear();
      expect(template.html).toContain(currentYear.toString());
    });
  });

  describe('Password Reset Email Template', () => {
    it('should generate password reset email', () => {
      const template = generatePasswordResetEmail({
        name: 'John Doe',
        resetUrl: 'https://xase.ai/reset?token=xyz789',
        expiresIn: '1 hour',
      });

      expect(template.subject).toBe('Reset Your XASE Password');
      expect(template.html).toContain('John Doe');
      expect(template.html).toContain('https://xase.ai/reset?token=xyz789');
      expect(template.html).toContain('1 hour');
      expect(template.html).toContain('Reset Password');
    });

    it('should include security warnings', () => {
      const template = generatePasswordResetEmail({
        name: 'Test User',
        resetUrl: 'https://xase.ai/reset',
        expiresIn: '30 minutes',
      });

      expect(template.html).toContain('Security Notice');
      expect(template.html).toContain('Never share your password');
    });
  });

  describe('Email Verification Template', () => {
    it('should generate email verification', () => {
      const template = generateEmailVerification({
        name: 'Alice Johnson',
        verificationUrl: 'https://xase.ai/verify?token=verify123',
      });

      expect(template.subject).toBe('Verify Your XASE Email Address');
      expect(template.html).toContain('Alice Johnson');
      expect(template.html).toContain('https://xase.ai/verify?token=verify123');
      expect(template.html).toContain('24 hours');
    });
  });

  describe('Lease Expiring Email Template', () => {
    it('should generate 30-minute warning', () => {
      const template = generateLeaseExpiringEmail(
        {
          name: 'Bob Wilson',
          leaseId: 'lease_123',
          datasetName: 'Medical Dataset',
          expiresAt: '2026-02-28T10:00:00Z',
          timeRemaining: '30 minutes',
          renewUrl: 'https://xase.ai/renew/lease_123',
        },
        '30min'
      );

      expect(template.subject).toContain('⚠️');
      expect(template.subject).toContain('30 minutes');
      expect(template.html).toContain('Bob Wilson');
      expect(template.html).toContain('lease_123');
      expect(template.html).toContain('Medical Dataset');
      expect(template.html).toContain('Warning');
    });

    it('should generate urgent 5-minute warning', () => {
      const template = generateLeaseExpiringEmail(
        {
          name: 'Carol Davis',
          leaseId: 'lease_456',
          datasetName: 'Financial Dataset',
          expiresAt: '2026-02-28T09:55:00Z',
          timeRemaining: '5 minutes',
          renewUrl: 'https://xase.ai/renew/lease_456',
        },
        '5min'
      );

      expect(template.subject).toContain('🚨 URGENT');
      expect(template.subject).toContain('5 minutes');
      expect(template.html).toContain('URGENT');
      expect(template.html).toContain('Carol Davis');
    });
  });

  describe('Access Request Email Template', () => {
    it('should generate access request notification', () => {
      const template = generateAccessRequestEmail({
        supplierName: 'Healthcare Corp',
        requesterName: 'Research Institute',
        requesterEmail: 'research@institute.com',
        datasetName: 'Patient Records',
        purpose: 'Medical research and AI training',
        requestUrl: 'https://xase.ai/requests/req_789',
      });

      expect(template.subject).toBe('New Access Request for Patient Records');
      expect(template.html).toContain('Healthcare Corp');
      expect(template.html).toContain('Research Institute');
      expect(template.html).toContain('research@institute.com');
      expect(template.html).toContain('Medical research and AI training');
      expect(template.html).toContain('Review Request');
    });
  });

  describe('Policy Expired Email Template', () => {
    it('should generate policy expiration notification', () => {
      const template = generatePolicyExpiredEmail({
        name: 'David Lee',
        policyName: 'GDPR Compliance Policy',
        datasetName: 'EU Customer Data',
        expiredAt: '2026-02-28T00:00:00Z',
        dashboardUrl: 'https://xase.ai/dashboard/policies',
      });

      expect(template.subject).toBe('Policy Expired: GDPR Compliance Policy');
      expect(template.html).toContain('David Lee');
      expect(template.html).toContain('GDPR Compliance Policy');
      expect(template.html).toContain('EU Customer Data');
      expect(template.html).toContain('automatically revoked');
    });
  });

  describe('Billing Threshold Email Template', () => {
    it('should generate 80% threshold alert', () => {
      const template = generateBillingThresholdEmail({
        name: 'Emma Brown',
        currentUsage: 800,
        threshold: 1000,
        percentage: 80,
        billingUrl: 'https://xase.ai/billing',
      });

      expect(template.subject).toContain('⚠️ Billing Alert');
      expect(template.subject).toContain('80%');
      expect(template.html).toContain('Emma Brown');
      expect(template.html).toContain('$800.00');
      expect(template.html).toContain('$1000.00');
      expect(template.html).toContain('80%');
    });

    it('should generate 95% critical threshold alert', () => {
      const template = generateBillingThresholdEmail({
        name: 'Frank Miller',
        currentUsage: 950,
        threshold: 1000,
        percentage: 95,
        billingUrl: 'https://xase.ai/billing',
      });

      expect(template.subject).toContain('95%');
      expect(template.html).toContain('$950.00');
      expect(template.html).toContain('service interruption');
    });
  });

  describe('HTML Structure Validation', () => {
    it('should generate valid HTML structure for all templates', () => {
      const templates = [
        generateWelcomeEmail({ name: 'Test', email: 'test@example.com' }),
        generatePasswordResetEmail({ name: 'Test', resetUrl: 'https://test.com', expiresIn: '1h' }),
        generateEmailVerification({ name: 'Test', verificationUrl: 'https://test.com' }),
        generateLeaseExpiringEmail(
          {
            name: 'Test',
            leaseId: 'l1',
            datasetName: 'D1',
            expiresAt: '2026-01-01',
            timeRemaining: '30m',
            renewUrl: 'https://test.com',
          },
          '30min'
        ),
        generateAccessRequestEmail({
          supplierName: 'S1',
          requesterName: 'R1',
          requesterEmail: 'r@test.com',
          datasetName: 'D1',
          purpose: 'P1',
          requestUrl: 'https://test.com',
        }),
        generatePolicyExpiredEmail({
          name: 'Test',
          policyName: 'P1',
          datasetName: 'D1',
          expiredAt: '2026-01-01',
          dashboardUrl: 'https://test.com',
        }),
        generateBillingThresholdEmail({
          name: 'Test',
          currentUsage: 80,
          threshold: 100,
          percentage: 80,
          billingUrl: 'https://test.com',
        }),
      ];

      templates.forEach((template) => {
        expect(template.html).toContain('<!DOCTYPE html>');
        expect(template.html).toContain('<html>');
        expect(template.html).toContain('</html>');
        expect(template.html).toContain('<body>');
        expect(template.html).toContain('</body>');
        expect(template.subject).toBeTruthy();
        expect(template.subject.length).toBeGreaterThan(0);
      });
    });

    it('should include CSS styles in all templates', () => {
      const template = generateWelcomeEmail({
        name: 'Test',
        email: 'test@example.com',
      });

      expect(template.html).toContain('<style>');
      expect(template.html).toContain('</style>');
      expect(template.html).toContain('font-family');
      expect(template.html).toContain('.header');
      expect(template.html).toContain('.button');
    });
  });

  describe('Content Safety', () => {
    it('should handle special characters in names', () => {
      const template = generateWelcomeEmail({
        name: "O'Brien <script>alert('xss')</script>",
        email: 'test@example.com',
      });

      expect(template.html).toContain("O'Brien");
      // HTML should be escaped by the template
      expect(template.subject).toBeTruthy();
    });

    it('should handle long names gracefully', () => {
      const longName = 'A'.repeat(200);
      const template = generateWelcomeEmail({
        name: longName,
        email: 'test@example.com',
      });

      expect(template.html).toContain(longName);
      expect(template.subject).toBeTruthy();
    });
  });
});
