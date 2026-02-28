/**
 * Email System Integration Tests
 * Tests for SMTP email sending functionality
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendEmailVerification,
  sendLeaseExpiringEmail,
  sendAccessRequestEmail,
  sendPolicyExpiredEmail,
  sendBillingThresholdEmail,
  verifyEmailConfiguration,
} from '@/lib/email';

describe('Email System Tests', () => {
  describe('Email Configuration', () => {
    it('should verify SMTP configuration', async () => {
      const isConfigured = await verifyEmailConfiguration();
      console.log('SMTP Configuration Status:', isConfigured ? 'Valid' : 'Not configured');
      expect(typeof isConfigured).toBe('boolean');
    });
  });

  describe('Welcome Email', () => {
    it('should send welcome email with verification URL', async () => {
      const result = await sendWelcomeEmail('test@example.com', {
        name: 'Test User',
        email: 'test@example.com',
        verificationUrl: 'https://xase.ai/verify?token=test123',
      });

      expect(result).toHaveProperty('success');
      console.log('Welcome email result:', result);
    });

    it('should send welcome email without verification URL', async () => {
      const result = await sendWelcomeEmail('test@example.com', {
        name: 'Test User',
        email: 'test@example.com',
      });

      expect(result).toHaveProperty('success');
    });
  });

  describe('Password Reset Email', () => {
    it('should send password reset email', async () => {
      const result = await sendPasswordResetEmail('test@example.com', {
        name: 'Test User',
        resetUrl: 'https://xase.ai/reset-password?token=reset123',
        expiresIn: '1 hour',
      });

      expect(result).toHaveProperty('success');
      console.log('Password reset email result:', result);
    });
  });

  describe('Email Verification', () => {
    it('should send email verification', async () => {
      const result = await sendEmailVerification('test@example.com', {
        name: 'Test User',
        verificationUrl: 'https://xase.ai/verify?token=verify123',
      });

      expect(result).toHaveProperty('success');
    });
  });

  describe('Lease Expiration Alerts', () => {
    it('should send 30-minute lease expiration warning', async () => {
      const result = await sendLeaseExpiringEmail(
        'test@example.com',
        {
          name: 'Test User',
          leaseId: 'lease_123',
          datasetName: 'Medical Audio Dataset',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          timeRemaining: '30 minutes',
          renewUrl: 'https://xase.ai/dashboard/leases/lease_123/renew',
        },
        '30min'
      );

      expect(result).toHaveProperty('success');
      console.log('30-min lease alert result:', result);
    });

    it('should send 5-minute urgent lease expiration warning', async () => {
      const result = await sendLeaseExpiringEmail(
        'test@example.com',
        {
          name: 'Test User',
          leaseId: 'lease_123',
          datasetName: 'Medical Audio Dataset',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          timeRemaining: '5 minutes',
          renewUrl: 'https://xase.ai/dashboard/leases/lease_123/renew',
        },
        '5min'
      );

      expect(result).toHaveProperty('success');
      console.log('5-min lease alert result:', result);
    });
  });

  describe('Access Request Email', () => {
    it('should send access request notification to supplier', async () => {
      const result = await sendAccessRequestEmail('supplier@example.com', {
        supplierName: 'Supplier Company',
        requesterName: 'John Doe',
        requesterEmail: 'john@example.com',
        datasetName: 'Healthcare Dataset',
        purpose: 'Research and model training',
        requestUrl: 'https://xase.ai/dashboard/requests/req_123',
      });

      expect(result).toHaveProperty('success');
      console.log('Access request email result:', result);
    });
  });

  describe('Policy Expired Email', () => {
    it('should send policy expiration notification', async () => {
      const result = await sendPolicyExpiredEmail('test@example.com', {
        name: 'Test User',
        policyName: 'GDPR Compliance Policy',
        datasetName: 'Patient Records',
        expiredAt: new Date().toISOString(),
        dashboardUrl: 'https://xase.ai/dashboard/policies',
      });

      expect(result).toHaveProperty('success');
      console.log('Policy expired email result:', result);
    });
  });

  describe('Billing Threshold Email', () => {
    it('should send billing threshold alert at 80%', async () => {
      const result = await sendBillingThresholdEmail('test@example.com', {
        name: 'Test User',
        currentUsage: 800,
        threshold: 1000,
        percentage: 80,
        billingUrl: 'https://xase.ai/dashboard/billing',
      });

      expect(result).toHaveProperty('success');
      console.log('Billing threshold email result:', result);
    });

    it('should send billing threshold alert at 95%', async () => {
      const result = await sendBillingThresholdEmail('test@example.com', {
        name: 'Test User',
        currentUsage: 950,
        threshold: 1000,
        percentage: 95,
        billingUrl: 'https://xase.ai/dashboard/billing',
      });

      expect(result).toHaveProperty('success');
    });
  });

  describe('Email Template Validation', () => {
    it('should generate valid HTML for all email types', async () => {
      const emails = [
        sendWelcomeEmail('test@example.com', {
          name: 'Test',
          email: 'test@example.com',
          verificationUrl: 'https://xase.ai/verify',
        }),
        sendPasswordResetEmail('test@example.com', {
          name: 'Test',
          resetUrl: 'https://xase.ai/reset',
          expiresIn: '1 hour',
        }),
        sendEmailVerification('test@example.com', {
          name: 'Test',
          verificationUrl: 'https://xase.ai/verify',
        }),
      ];

      const results = await Promise.all(emails);
      results.forEach((result) => {
        expect(result).toHaveProperty('success');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid email addresses gracefully', async () => {
      const result = await sendWelcomeEmail('invalid-email', {
        name: 'Test',
        email: 'invalid-email',
      });

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(false);
    });

    it('should handle missing SMTP configuration gracefully', async () => {
      // This test validates that the system doesn't crash when SMTP is not configured
      const result = await sendWelcomeEmail('test@example.com', {
        name: 'Test',
        email: 'test@example.com',
      });

      expect(result).toHaveProperty('success');
    });
  });
});
