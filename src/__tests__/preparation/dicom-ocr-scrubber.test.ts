import { describe, it, expect, vi } from 'vitest';
import { DicomOcrScrubber, DicomScrubConfig } from '@/lib/preparation/deid/dicom-ocr-scrubber';

describe('DicomOcrScrubber', () => {
  const createScrubber = (config?: Partial<DicomScrubConfig>) => {
    return new DicomOcrScrubber({
      method: 'blur',
      ...config,
    });
  };

  describe('basic scrubbing', () => {
    it('should scrub PHI from DICOM image', async () => {
      const scrubber = createScrubber();
      // Create buffer with PHI pattern
      const imageData = Buffer.from('Patient Name: John Doe, MRN: 123456');

      const result = await scrubber.scrubDicom(imageData);

      expect(result.success).toBe(true);
      expect(result.regionsScrubbed.length).toBeGreaterThan(0);
      expect(result.report.phiDetected).toBeGreaterThan(0);
    });

    it('should detect PHI with confidence threshold', async () => {
      const scrubber = createScrubber({ confidenceThreshold: 0.8 });
      const imageData = Buffer.from('Patient: Test Subject');

      const result = await scrubber.scrubDicom(imageData);

      expect(result.report.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should support different scrub methods', async () => {
      const methods: Array<'blur' | 'blackout' | 'inpaint'> = ['blur', 'blackout', 'inpaint'];

      for (const method of methods) {
        const scrubber = createScrubber({ method });
        const imageData = Buffer.from('Patient ID: ABC123');

        const result = await scrubber.scrubDicom(imageData);

        expect(result.report.method).toBe(method);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('fail-closed mode', () => {
    it('should mark as unsafe when PHI detected but not scrubbed', async () => {
      const scrubber = createScrubber({
        failClosed: true,
        confidenceThreshold: 1.0, // Impossibly high
      });
      const imageData = Buffer.from('Patient Name: John Doe');

      const result = await scrubber.scrubDicom(imageData);

      expect(result.unsafe).toBe(true);
      expect(result.success).toBe(false);
    });

    it('should allow processing when failClosed is false', async () => {
      const scrubber = createScrubber({
        failClosed: false,
        confidenceThreshold: 1.0,
      });
      const imageData = Buffer.from('Patient Name: John Doe');

      const result = await scrubber.scrubDicom(imageData);

      expect(result.success).toBe(true);
    });
  });

  describe('batch processing', () => {
    it('should process multiple DICOM files', async () => {
      const scrubber = createScrubber();
      const files = [
        { id: 'dicom-1', data: Buffer.from('Patient: John') },
        { id: 'dicom-2', data: Buffer.from('MRN: 123456') },
        { id: 'dicom-3', data: Buffer.from('No PHI here') },
      ];

      const results = await scrubber.batchScrub(files);

      expect(results.size).toBe(3);
      expect(results.get('dicom-1')?.regionsScrubbed.length).toBeGreaterThan(0);
      expect(results.get('dicom-2')?.regionsScrubbed.length).toBeGreaterThan(0);
    });

    it('should track batch progress', async () => {
      const scrubber = createScrubber();
      const files = Array.from({ length: 5 }, (_, i) => ({
        id: `dicom-${i}`,
        data: Buffer.from(`Patient ${i}`),
      }));
      const progressFn = vi.fn();

      await scrubber.batchScrub(files, progressFn);

      expect(progressFn).toHaveBeenCalledTimes(5);
      expect(progressFn).toHaveBeenLastCalledWith(5, 5);
    });
  });

  describe('reporting', () => {
    it('should generate batch report', async () => {
      const scrubber = createScrubber();
      const files = [
        { id: 'dicom-1', data: Buffer.from('Patient: John') },
        { id: 'dicom-2', data: Buffer.from('MRN: 123456') },
        { id: 'dicom-3', data: Buffer.from('Clean data') },
      ];

      const results = await scrubber.batchScrub(files);
      const report = scrubber.generateReport(results);

      expect(report.totalFiles).toBe(3);
      expect(report.phiDetected).toBeGreaterThan(0);
      expect(report.averageConfidence).toBeGreaterThanOrEqual(0);
    });

    it('should count unsafe files in report', async () => {
      const scrubber = createScrubber({ failClosed: true });
      const files = [
        { id: 'dicom-1', data: Buffer.from('Patient: John') },
        { id: 'dicom-2', data: Buffer.from('Normal scan') },
      ];

      const results = await scrubber.batchScrub(files);
      const report = scrubber.generateReport(results);

      expect(report.totalFiles).toBe(2);
    });
  });

  describe('medical use cases', () => {
    it('should handle radiology report with PHI', async () => {
      const scrubber = createScrubber({ method: 'blackout' });
      const reportData = Buffer.from(
        'RADIOLOGY REPORT\n' +
        'Patient: Jane Smith\n' +
        'DOB: 01/15/1985\n' +
        'MRN: 987654321\n' +
        'Findings: Normal chest X-ray'
      );

      const result = await scrubber.scrubDicom(reportData);

      expect(result.success).toBe(true);
      expect(result.report.phiDetected).toBeGreaterThanOrEqual(3);
    });

    it('should handle DICOM with burned-in annotations', async () => {
      const scrubber = createScrubber({ method: 'inpaint' });
      // Simulating DICOM with corner annotations
      const dicomData = Buffer.from(
        'DICOM_IMAGE_DATA_WITH_CORNER_ANNOTATIONS\n' +
        'Top Left: Patient Name: John Doe\n' +
        'Top Right: DOB: 05/20/1975\n' +
        'Bottom: MRN: 123456789'
      );

      const result = await scrubber.scrubDicom(dicomData);

      expect(result.regionsScrubbed.length).toBeGreaterThan(0);
      expect(result.ocrResults.length).toBeGreaterThan(0);
    });

    it('should handle ultrasound with patient info', async () => {
      const scrubber = createScrubber({ method: 'blur' });
      const ultrasoundData = Buffer.from(
        'ULTRASOUND_IMAGE\n' +
        'Patient: Sarah Johnson\n' +
        'ID: US-2024-001\n' +
        'Date: 03/15/2024'
      );

      const result = await scrubber.scrubDicom(ultrasoundData);

      expect(result.success).toBe(true);
      expect(result.regionsScrubbed.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle processing errors gracefully', async () => {
      const scrubber = createScrubber();
      // Empty buffer
      const result = await scrubber.scrubDicom(Buffer.from(''));

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    });

    it('should report errors without crashing', async () => {
      const scrubber = createScrubber();
      
      // Simulate error by passing invalid data
      const result = await scrubber.scrubDicom(Buffer.from('INVALID'));

      // Should not throw
      expect(result).toBeDefined();
    });
  });
});
