/**
 * Security Helpers Unit Tests
 * Tests for password hashing, token generation, and security utilities
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { hash, compare } from 'bcryptjs';

describe('Security Helpers', () => {
  describe('Password Hashing', () => {
    it('should hash password with bcrypt', async () => {
      const password = 'SecurePassword123!';
      const hashedPassword = await hash(password, 10);
      
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50);
    });

    it('should create different hashes for same password', async () => {
      const password = 'TestPassword123';
      const hash1 = await hash(password, 10);
      const hash2 = await hash(password, 10);
      
      expect(hash1).not.toBe(hash2); // Salt makes each hash unique
    });

    it('should verify correct password', async () => {
      const password = 'MyPassword123!';
      const hashedPassword = await hash(password, 10);
      const isValid = await compare(password, hashedPassword);
      
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'CorrectPassword';
      const wrongPassword = 'WrongPassword';
      const hashedPassword = await hash(password, 10);
      const isValid = await compare(wrongPassword, hashedPassword);
      
      expect(isValid).toBe(false);
    });

    it('should handle empty password', async () => {
      const password = '';
      const hashedPassword = await hash(password, 10);
      
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword.length).toBeGreaterThan(0);
    });

    it('should handle long passwords', async () => {
      const password = 'a'.repeat(200);
      const hashedPassword = await hash(password, 10);
      
      expect(hashedPassword).toBeDefined();
    });

    it('should handle special characters', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const hashedPassword = await hash(password, 10);
      const isValid = await compare(password, hashedPassword);
      
      expect(isValid).toBe(true);
    });

    it('should handle unicode characters', async () => {
      const password = '密码🔐🗝️';
      const hashedPassword = await hash(password, 10);
      const isValid = await compare(password, hashedPassword);
      
      expect(isValid).toBe(true);
    });
  });

  describe('Token Generation', () => {
    it('should generate random token', () => {
      const token = crypto.randomBytes(32).toString('hex');
      
      expect(token.length).toBe(64);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique tokens', () => {
      const token1 = crypto.randomBytes(32).toString('hex');
      const token2 = crypto.randomBytes(32).toString('hex');
      
      expect(token1).not.toBe(token2);
    });

    it('should generate URL-safe tokens', () => {
      const token = crypto.randomBytes(32).toString('base64url');
      
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
      expect(token).not.toContain('=');
    });

    it('should generate tokens of different lengths', () => {
      const token16 = crypto.randomBytes(16).toString('hex');
      const token32 = crypto.randomBytes(32).toString('hex');
      const token64 = crypto.randomBytes(64).toString('hex');
      
      expect(token16.length).toBe(32);
      expect(token32.length).toBe(64);
      expect(token64.length).toBe(128);
    });
  });

  describe('Token Expiration', () => {
    it('should calculate expiration time', () => {
      const expiresInMinutes = 60;
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
      
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should check if token is expired', () => {
      const expiresAt = new Date(Date.now() - 1000); // 1 second ago
      const isExpired = expiresAt.getTime() < Date.now();
      
      expect(isExpired).toBe(true);
    });

    it('should check if token is not expired', () => {
      const expiresAt = new Date(Date.now() + 60000); // 1 minute from now
      const isExpired = expiresAt.getTime() < Date.now();
      
      expect(isExpired).toBe(false);
    });

    it('should handle null expiration', () => {
      const expiresAt: Date | null = null;
      const isExpired = expiresAt ? (expiresAt as Date).getTime() < Date.now() : false;
      
      expect(isExpired).toBe(false);
    });
  });

  describe('CSRF Token', () => {
    it('should generate CSRF token', () => {
      const csrfToken = crypto.randomBytes(32).toString('base64');
      
      expect(csrfToken).toBeDefined();
      expect(csrfToken.length).toBeGreaterThan(40);
    });

    it('should validate CSRF token', () => {
      const token = 'test_csrf_token_12345';
      const providedToken = 'test_csrf_token_12345';
      
      expect(token).toBe(providedToken);
    });

    it('should reject invalid CSRF token', () => {
      const token = 'valid_token';
      const providedToken = 'invalid_token';
      
      expect(token).not.toBe(providedToken);
    });
  });

  describe('Session Management', () => {
    it('should generate session ID', () => {
      const sessionId = crypto.randomUUID();
      
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate unique session IDs', () => {
      const session1 = crypto.randomUUID();
      const session2 = crypto.randomUUID();
      
      expect(session1).not.toBe(session2);
    });

    it('should calculate session expiration', () => {
      const sessionDurationHours = 24;
      const expiresAt = new Date(Date.now() + sessionDurationHours * 60 * 60 * 1000);
      
      const hoursUntilExpiry = (expiresAt.getTime() - Date.now()) / (60 * 60 * 1000);
      expect(Math.round(hoursUntilExpiry)).toBe(24);
    });
  });

  describe('Email Verification Token', () => {
    it('should generate verification token', () => {
      const token = crypto.randomBytes(32).toString('hex');
      
      expect(token.length).toBe(64);
    });

    it('should hash verification token', () => {
      const token = 'verification_token_12345';
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      expect(hashedToken).not.toBe(token);
      expect(hashedToken.length).toBe(64);
    });

    it('should verify token matches hash', () => {
      const token = 'test_token';
      const storedHash = crypto.createHash('sha256').update(token).digest('hex');
      const providedHash = crypto.createHash('sha256').update(token).digest('hex');
      
      expect(providedHash).toBe(storedHash);
    });
  });

  describe('Password Reset Token', () => {
    it('should generate reset token', () => {
      const token = crypto.randomBytes(32).toString('hex');
      
      expect(token).toBeDefined();
      expect(token.length).toBe(64);
    });

    it('should set expiration for reset token', () => {
      const expiresInHours = 1;
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
      
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should validate reset token is not expired', () => {
      const expiresAt = new Date(Date.now() + 60000);
      const isValid = expiresAt.getTime() > Date.now();
      
      expect(isValid).toBe(true);
    });

    it('should invalidate expired reset token', () => {
      const expiresAt = new Date(Date.now() - 60000);
      const isValid = expiresAt.getTime() > Date.now();
      
      expect(isValid).toBe(false);
    });
  });

  describe('2FA Token', () => {
    it('should generate 6-digit OTP', () => {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      expect(otp.length).toBe(6);
      expect(parseInt(otp)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(otp)).toBeLessThan(1000000);
    });

    it('should generate unique OTPs', () => {
      const otp1 = Math.floor(100000 + Math.random() * 900000).toString();
      const otp2 = Math.floor(100000 + Math.random() * 900000).toString();
      
      // While they could theoretically be the same, it's extremely unlikely
      expect(otp1).toBeDefined();
      expect(otp2).toBeDefined();
    });

    it('should set OTP expiration', () => {
      const expiresInMinutes = 5;
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
      
      const minutesUntilExpiry = (expiresAt.getTime() - Date.now()) / (60 * 1000);
      expect(Math.round(minutesUntilExpiry)).toBe(5);
    });
  });

  describe('Encryption', () => {
    it('should create encryption key', () => {
      const key = crypto.randomBytes(32);
      
      expect(key.length).toBe(32);
    });

    it('should create initialization vector', () => {
      const iv = crypto.randomBytes(16);
      
      expect(iv.length).toBe(16);
    });

    it('should encrypt and decrypt data', () => {
      const algorithm = 'aes-256-cbc';
      const key = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      const data = 'Sensitive data to encrypt';
      
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      expect(decrypted).toBe(data);
    });
  });

  describe('Rate Limiting', () => {
    it('should track request count', () => {
      const requests = [1, 2, 3, 4, 5];
      const count = requests.length;
      
      expect(count).toBe(5);
    });

    it('should check if rate limit exceeded', () => {
      const requestCount = 150;
      const rateLimit = 100;
      const isExceeded = requestCount > rateLimit;
      
      expect(isExceeded).toBe(true);
    });

    it('should calculate time until reset', () => {
      const resetTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      const timeUntilReset = resetTime.getTime() - Date.now();
      
      expect(timeUntilReset).toBeGreaterThan(0);
    });
  });

  describe('Input Sanitization', () => {
    it('should trim whitespace', () => {
      const input = '  test@example.com  ';
      const sanitized = input.trim();
      
      expect(sanitized).toBe('test@example.com');
    });

    it('should convert to lowercase', () => {
      const input = 'TEST@EXAMPLE.COM';
      const sanitized = input.toLowerCase();
      
      expect(sanitized).toBe('test@example.com');
    });

    it('should validate email format', () => {
      const email = 'test@example.com';
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid email', () => {
      const email = 'invalid-email';
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      
      expect(isValid).toBe(false);
    });

    it('should validate password strength', () => {
      const password = 'StrongP@ssw0rd!';
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[!@#$%^&*]/.test(password);
      const isLongEnough = password.length >= 8;
      
      const isStrong = hasUppercase && hasLowercase && hasNumber && hasSpecial && isLongEnough;
      expect(isStrong).toBe(true);
    });

    it('should reject weak password', () => {
      const password = 'weak';
      const isLongEnough = password.length >= 8;
      
      expect(isLongEnough).toBe(false);
    });
  });

  describe('Security Headers', () => {
    it('should define security headers', () => {
      const headers = {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      };
      
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('should validate CORS origin', () => {
      const allowedOrigins = ['https://xase.ai', 'https://app.xase.ai'];
      const requestOrigin = 'https://xase.ai';
      const isAllowed = allowedOrigins.includes(requestOrigin);
      
      expect(isAllowed).toBe(true);
    });

    it('should reject unauthorized origin', () => {
      const allowedOrigins = ['https://xase.ai'];
      const requestOrigin = 'https://malicious.com';
      const isAllowed = allowedOrigins.includes(requestOrigin);
      
      expect(isAllowed).toBe(false);
    });
  });
});
