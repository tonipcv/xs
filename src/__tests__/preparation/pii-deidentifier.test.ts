import { describe, it, expect, vi } from 'vitest';
import { PIIDeidentifier, DeidentificationConfig } from '@/lib/preparation/deid/pii-deidentifier';

describe('PIIDeidentifier', () => {
  const deidentifier = new PIIDeidentifier();

  describe('mask strategy', () => {
    it('should mask SSN with asterisks', () => {
      const text = 'Patient SSN is 123-45-6789';
      const result = deidentifier.deidentify(text, { strategy: 'mask' });

      expect(result.text).not.toContain('123-45-6789');
      expect(result.text).toContain('*********');
      expect(result.strategy).toBe('mask');
      expect(result.maskedCount).toBeGreaterThan(0);
    });

    it('should mask phone numbers', () => {
      const text = 'Call me at 555-123-4567';
      const result = deidentifier.deidentify(text, { strategy: 'mask' });

      expect(result.text).not.toContain('555-123-4567');
      expect(result.entities.some((e) => e.type === 'phone')).toBe(true);
    });

    it('should mask email addresses', () => {
      const text = 'Email: john.doe@example.com';
      const result = deidentifier.deidentify(text, { strategy: 'mask' });

      expect(result.text).not.toContain('john.doe@example.com');
      expect(result.entities.some((e) => e.type === 'email')).toBe(true);
    });

    it('should mask with asterisks', () => {
      const text = 'Contact: 555-123-4567';
      const result = deidentifier.deidentify(text, {
        strategy: 'mask',
      });

      // Phone number should be fully masked
      expect(result.text).not.toContain('555');
      expect(result.text).toContain('***');
    });
  });

  describe('redact strategy', () => {
    it('should replace PII with type labels', () => {
      const text = 'Patient John Doe, SSN: 123-45-6789';
      const result = deidentifier.deidentify(text, { strategy: 'redact' });

      expect(result.text).toContain('[NAME]');
      expect(result.text).toContain('[SSN]');
      expect(result.text).not.toContain('John Doe');
      expect(result.text).not.toContain('123-45-6789');
    });
  });

  describe('hash strategy', () => {
    it('should hash PII values', () => {
      const text = 'Patient ID: ABC12345';
      const result = deidentifier.deidentify(text, { strategy: 'hash' });

      expect(result.text).not.toContain('ABC12345');
      // Hash is 8 hex characters
      expect(result.text).toMatch(/[a-f0-9]{8}/);
    });
  });

  describe('tokenize strategy', () => {
    it('should tokenize PII with type prefix', () => {
      const text = 'Email: john@example.com';
      const result = deidentifier.deidentify(text, { strategy: 'tokenize' });

      expect(result.text).toContain('<EMAIL_');
      expect(result.text).not.toContain('john@example.com');
    });
  });

  describe('synthetic strategy', () => {
    it('should generate synthetic SSN', () => {
      const text = 'SSN: 123-45-6789';
      const result = deidentifier.deidentify(text, { strategy: 'synthetic' });

      expect(result.text).toContain('XXX-XX-');
      expect(result.text).not.toContain('123-45-6789');
    });

    it('should generate synthetic phone', () => {
      const text = 'Phone: (555) 123-4567';
      const result = deidentifier.deidentify(text, { strategy: 'synthetic' });

      expect(result.text).toContain('(XXX) XXX-');
      expect(result.text).not.toContain('555');
    });
  });

  describe('entity detection', () => {
    it('should detect MRN (Medical Record Number)', () => {
      const text = 'MRN: 123456789';
      const result = deidentifier.deidentify(text, { strategy: 'redact' });

      expect(result.entities.some((e) => e.type === 'mrn')).toBe(true);
    });

    it('should detect dates of birth', () => {
      const text = 'DOB: 05/15/1985';
      const result = deidentifier.deidentify(text, { strategy: 'redact' });

      expect(result.entities.some((e) => e.type === 'dob')).toBe(true);
    });

    it('should filter by entity types when specified', () => {
      const text = 'Name: John, Phone: 555-123-4567, Email: john@example.com';
      const result = deidentifier.deidentify(text, {
        strategy: 'redact',
        entityTypes: ['phone'],
      });

      expect(result.text).toContain('[PHONE]');
      expect(result.text).toContain('John'); // Not masked
      expect(result.text).toContain('john@example.com'); // Not masked
    });
  });

  describe('report generation', () => {
    it('should generate de-identification report', () => {
      const text = 'Patient John Doe (SSN: 123-45-6789, Phone: 555-123-4567)';
      const result = deidentifier.deidentify(text, { strategy: 'mask' });

      expect(result.report.namesRemoved).toBeGreaterThanOrEqual(0);
      expect(result.report.idsRemoved).toBeGreaterThanOrEqual(1);
      expect(result.report.contactRemoved).toBeGreaterThanOrEqual(1);
      expect(result.maskedCount).toBe(result.entities.length);
    });
  });

  describe('validation', () => {
    it('should validate successful de-identification', () => {
      const text = 'SSN: 123-45-6789';
      const result = deidentifier.deidentify(text, { strategy: 'mask' });
      const validation = deidentifier.validateDeidentification(text, result);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should detect unremoved PII', () => {
      const text = 'SSN: 123-45-6789';
      // Simulate incomplete de-identification
      const result = {
        text: 'SSN: 123-45-6789', // Not actually masked
        entities: [{ type: 'ssn' as const, value: '123-45-6789', start: 5, end: 16, confidence: 0.9 }],
        maskedCount: 0,
        strategy: 'mask',
        report: { namesRemoved: 0, datesRemoved: 0, idsRemoved: 0, contactRemoved: 0 },
      };
      const validation = deidentifier.validateDeidentification(text, result);

      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
    });
  });

  describe('batch processing', () => {
    it('should process multiple texts', async () => {
      const texts = [
        'Patient 1: SSN 123-45-6789',
        'Patient 2: SSN 987-65-4321',
        'Patient 3: Phone 555-123-4567',
      ];

      const results = await deidentifier.batchDeidentify(texts, { strategy: 'redact' });

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.maskedCount).toBeGreaterThan(0);
      });
    });

    it('should track batch progress', async () => {
      const texts = Array.from({ length: 10 }, (_, i) => `Patient ${i}: SSN 123-45-678${i}`);
      const progressFn = vi.fn();

      await deidentifier.batchDeidentify(texts, { strategy: 'mask' }, progressFn);

      expect(progressFn).toHaveBeenCalled();
      const lastCall = progressFn.mock.calls[progressFn.mock.calls.length - 1];
      expect(lastCall[0]).toBe(10); // processed
      expect(lastCall[1]).toBe(10); // total
    });
  });

  describe('medical use cases', () => {
    it('should de-identify clinical note', () => {
      const note = `Patient: John Smith
DOB: 01/15/1975
MRN: 123456789
Contact: jsmith@email.com, 555-123-4567
Address: 123 Main St, Anytown, ST 12345

Chief Complaint: Patient reports chest pain.`;

      const result = deidentifier.deidentify(note, { strategy: 'redact' });

      expect(result.text).not.toContain('John Smith');
      expect(result.text).not.toContain('01/15/1975');
      expect(result.text).not.toContain('123456789');
      expect(result.text).not.toContain('jsmith@email.com');
      expect(result.text).not.toContain('555-123-4567');
      expect(result.text).toContain('[NAME]');
      expect(result.report.namesRemoved).toBeGreaterThanOrEqual(1);
      expect(result.report.idsRemoved).toBeGreaterThanOrEqual(1);
      expect(result.report.contactRemoved).toBeGreaterThanOrEqual(2);
    });

    it('should handle PHI in discharge summary', () => {
      const summary = `DISCHARGE SUMMARY
Patient: Jane Doe
MRN: 987654321
Admission: 03/15/2024
Discharge: 03/20/2024

Primary Diagnosis: Pneumonia

Patient instructed to follow up with Dr. Smith at 555-987-6543.`;

      const result = deidentifier.deidentify(summary, { strategy: 'mask' });

      expect(result.maskedCount).toBeGreaterThan(0);
      expect(result.entities.length).toBeGreaterThan(0);
    });
  });
});
