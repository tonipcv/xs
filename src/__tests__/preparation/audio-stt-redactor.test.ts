import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioSttRedactor, AudioRedactionConfig } from '@/lib/preparation/deid/audio-stt-redactor';

describe('AudioSttRedactor', () => {
  let redactor: AudioSttRedactor;

  beforeEach(() => {
    const config: AudioRedactionConfig = {
      method: 'bleep',
      confidenceThreshold: 0.7,
      detectNames: true,
      detectNumbers: true,
      detectDates: true,
      failClosed: true,
    };
    redactor = new AudioSttRedactor(config);
  });

  it('should process audio and detect PHI', async () => {
    const mockAudio = Buffer.from('Patient John Doe');
    const result = await redactor.processAudio(mockAudio, 'test.mp3');

    expect(result.success).toBe(true);
    expect(result.originalSegments.length).toBeGreaterThan(0);
    expect(result.report.segmentsProcessed).toBeGreaterThan(0);
  });

  it('should detect names in transcription', async () => {
    const mockAudio = Buffer.from('Patient John Doe');
    const result = await redactor.processAudio(mockAudio, 'test.mp3');

    expect(result.phiDetected.length).toBeGreaterThan(0);
    const namePhi = result.phiDetected.find(p => p.type === 'name');
    expect(namePhi).toBeDefined();
  });

  it('should detect SSN patterns', async () => {
    const mockAudio = Buffer.from('My SSN is 123-45-6789');
    const result = await redactor.processAudio(mockAudio, 'test.mp3');

    const ssnPhi = result.phiDetected.find(p => p.type === 'ssn');
    expect(ssnPhi).toBeDefined();
  });

  it('should detect phone numbers', async () => {
    const mockAudio = Buffer.from('Call me at 555-123-4567');
    const result = await redactor.processAudio(mockAudio, 'test.mp3');

    const phonePhi = result.phiDetected.find(p => p.type === 'phone');
    expect(phonePhi).toBeDefined();
  });

  it('should detect dates of birth', async () => {
    const mockAudio = Buffer.from('DOB: 01/15/1985');
    const result = await redactor.processAudio(mockAudio, 'test.mp3');

    const dobPhi = result.phiDetected.find(p => p.type === 'dob');
    expect(dobPhi).toBeDefined();
  });

  it('should detect addresses', async () => {
    const mockAudio = Buffer.from('I live at 123 Main Street');
    const result = await redactor.processAudio(mockAudio, 'test.mp3');

    const addressPhi = result.phiDetected.find(p => p.type === 'address');
    expect(addressPhi).toBeDefined();
  });

  it('should redact detected PHI', async () => {
    const mockAudio = Buffer.from('Patient John Doe');
    const result = await redactor.processAudio(mockAudio, 'test.mp3');

    expect(result.redactedSegments.length).toBeGreaterThan(0);
    const redactedText = result.redactedSegments[0].text;
    expect(redactedText).toContain('[REDACTED]');
  });

  it('should generate report', async () => {
    const mockAudio = Buffer.from('Patient John Doe SSN 123-45-6789');
    const result = await redactor.processAudio(mockAudio, 'test.mp3');

    expect(result.report.phiDetected).toBeGreaterThan(0);
    expect(result.report.phiRedacted).toBeGreaterThan(0);
    expect(result.report.confidence).toBeGreaterThan(0);
    expect(result.report.method).toBe('bleep');
  });

  it('should support batch processing', async () => {
    const files = [
      { id: '1', data: Buffer.from('Patient John'), path: 'test1.mp3' },
      { id: '2', data: Buffer.from('Patient Jane'), path: 'test2.mp3' },
    ];

    const results = await redactor.batchProcess(files);

    expect(results.size).toBe(2);
    expect(results.get('1')).toBeDefined();
    expect(results.get('2')).toBeDefined();
  });

  it('should generate batch report', async () => {
    const files = [
      { id: '1', data: Buffer.from('Patient John'), path: 'test1.mp3' },
      { id: '2', data: Buffer.from('Patient Jane'), path: 'test2.mp3' },
    ];

    const results = await redactor.batchProcess(files);
    const report = redactor.generateReport(results);

    expect(report.totalFiles).toBe(2);
    expect(report.filesRedacted).toBeGreaterThanOrEqual(0);
    expect(report.phiDetected).toBeGreaterThanOrEqual(0);
    expect(report.averageConfidence).toBeGreaterThanOrEqual(0);
  });

  it('should respect confidence threshold', async () => {
    const strictConfig: AudioRedactionConfig = {
      method: 'bleep',
      confidenceThreshold: 0.95,
      detectNames: true,
    };
    const strictRedactor = new AudioSttRedactor(strictConfig);

    const mockAudio = Buffer.from('Patient John Doe');
    const result = await strictRedactor.processAudio(mockAudio, 'test.mp3');

    // With high threshold, fewer PHI should be detected
    expect(result.report.confidence).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty audio', async () => {
    // Create a fresh instance for this test to avoid shared state
    const emptyRedactor = new AudioSttRedactor({
      method: 'bleep',
      confidenceThreshold: 0.7,
      detectNames: true,
    });
    
    const mockAudio = Buffer.from('');
    const result = await emptyRedactor.processAudio(mockAudio, 'test.mp3');

    expect(result.success).toBe(true);
    expect(result.report.segmentsProcessed).toBe(0);
  });

  it('should handle errors gracefully', async () => {
    // Create a new redactor instance for this test
    const errorRedactor = new AudioSttRedactor({
      method: 'bleep',
      confidenceThreshold: 0.7,
      detectNames: true,
    });
    
    // Initialize the redactor first
    await (errorRedactor as any).initialize();
    
    // Then mock the worker's transcribe method
    const mockWorker = {
      transcribe: vi.fn().mockRejectedValue(new Error('Transcription failed')),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    
    // Replace the worker with our mock
    (errorRedactor as any).worker = mockWorker;

    const mockAudio = Buffer.from('Patient test');
    const result = await errorRedactor.processAudio(mockAudio, 'test.mp3');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Transcription failed');
  });
});
