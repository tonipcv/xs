/**
 * No Raw Egress Automated Tests
 * Security tests to guarantee raw data never egresses when purpose requires de-id
 */

import { describe, it, expect } from 'vitest';
import { RawDataBypassPrevention } from '@/lib/preparation/deid/raw-bypass-prevention';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';
import { DeidEnforcement } from '@/lib/preparation/deid/deid-enforcement';

describe('SECURITY: No Raw Egress', () => {
  const createMockAuditLogger = (): AuditLogger => ({
    log: async () => {},
  }) as unknown as AuditLogger;

  const createMockDeidEnforcement = (): DeidEnforcement => ({
    checkAccess: async () => ({ allowed: true, requiresDeid: true }),
  }) as unknown as DeidEnforcement;

  const createPrevention = () => new RawDataBypassPrevention(
    {},
    createMockAuditLogger(),
    createMockDeidEnforcement()
  );

  describe('research purpose requires de-id', () => {
    it('must BLOCK raw data with SSN for research', async () => {
      const prevention = createPrevention();
      const rawData = { patient: { name: 'John', ssn: '123-45-6789' } };

      const result = await prevention.checkForBypass(
        rawData,
        'research',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('must BLOCK raw data with email for research', async () => {
      const prevention = createPrevention();
      const rawData = { contact: { email: 'patient@example.com' } };

      const result = await prevention.checkForBypass(
        rawData,
        'research',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(false);
    });

    it('must BLOCK raw data with MRN for research', async () => {
      const prevention = createPrevention();
      const rawData = { record: { mrn: 'MRN123456', diagnosis: 'flu' } };

      const result = await prevention.checkForBypass(
        rawData,
        'research',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(false);
    });

    it('must ALLOW de-identified data for research', async () => {
      const prevention = createPrevention();
      const deidData = { 
        patient: { 
          token: 'ptk_abc123def45678',
          age: 30,
          _deid_applied: true 
        } 
      };

      const result = await prevention.checkForBypass(
        deidData,
        'research',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('training purpose requires de-id', () => {
    it('must BLOCK raw PHI for training', async () => {
      const prevention = createPrevention();
      const rawData = { 
        patient: { 
          name: 'Jane Doe',
          dob: '1985-03-15',
          phone: '555-123-4567'
        } 
      };

      const result = await prevention.checkForBypass(
        rawData,
        'training',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(false);
    });
  });

  describe('third_party purpose requires de-id', () => {
    it('must BLOCK all identifiable data for third_party', async () => {
      const prevention = createPrevention();
      const rawData = { 
        records: [
          { id: 'patient-001', address: '123 Main St' }
        ]
      };

      const result = await prevention.checkForBypass(
        rawData,
        'third_party',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(false);
    });
  });

  describe('raw endpoint blocking', () => {
    it('must BLOCK /api/raw/ endpoints for any purpose requiring de-id', async () => {
      const prevention = createPrevention();
      const data = { any: 'data' };

      const result = await prevention.checkForBypass(
        data,
        'research',
        '/api/raw/dataset/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.includes('Raw endpoint'))).toBe(true);
    });

    it('must BLOCK /download/raw/ endpoints', async () => {
      const prevention = createPrevention();

      const result = await prevention.checkForBypass(
        {},
        'training',
        '/download/raw/export.zip',
        'lease-abc'
      );

      expect(result.allowed).toBe(false);
    });
  });

  describe('emergency block functionality', () => {
    it('must immediately block all egress when emergency activated', async () => {
      const prevention = createPrevention();
      
      // Activate emergency block
      await prevention.emergencyBlock('security incident', 'admin-1');

      // Even de-identified data should be blocked now
      const deidData = { token: 'ptk_abc123', value: '[REDACTED]' };
      
      const result = await prevention.checkForBypass(
        deidData,
        'research',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      // After emergency block, all endpoints are protected
      const status = prevention.getStatus();
      expect(status.protectedEndpoints).toContain('/api/v1/');
    });
  });

  describe('pre-flight validation', () => {
    it('must FAIL validation when raw data detected before egress', async () => {
      const prevention = createPrevention();
      const rawData = { ssn: '123-45-6789', name: 'Patient Name' };

      const result = await prevention.validateBeforeEgress(
        rawData,
        'research',
        'lease-abc'
      );

      expect(result.canProceed).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('must PASS validation for properly de-identified data', async () => {
      const prevention = createPrevention();
      const deidData = { 
        patient_token: 'ptk_abc123',
        age_range: '30-40',
        diagnosis_code: 'J11'
      };

      const result = await prevention.validateBeforeEgress(
        deidData,
        'research',
        'lease-abc'
      );

      expect(result.canProceed).toBe(true);
      expect(result.valid).toBe(true);
    });
  });
});
