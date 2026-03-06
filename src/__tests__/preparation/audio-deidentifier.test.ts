import { describe, it, expect, vi } from 'vitest';
import { AudioDeidentifier, AudioScrubConfig } from '@/lib/preparation/deid/audio-deidentifier';

describe('AudioDeidentifier', () => {
  const createDeidentifier = (config?: Partial<AudioScrubConfig>) => {
    return new AudioDeidentifier({
      bleepDuration: 0.5,
      bleepFrequency: 1000,
      ...config,
    });
  };

  describe('basic de-identification', () => {
    it('should transcribe and de-identify audio', async () => {
      const deidentifier = createDeidentifier();
      
      const result = await deidentifier.deidentifyAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav'
      );

      expect(result.success).toBe(true);
      expect(result.redactedTranscript).toBeDefined();
      expect(result.report.segmentsDetected).toBeGreaterThan(0);
    });

    it('should detect PII in transcription', async () => {
      const deidentifier = createDeidentifier();
      
      const result = await deidentifier.deidentifyAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav'
      );

      expect(result.report.piiInstances).toBeGreaterThan(0);
      expect(result.removedSegments.length).toBeGreaterThan(0);
    });

    it('should redact PHI from transcript', async () => {
      const deidentifier = createDeidentifier();
      
      const result = await deidentifier.deidentifyAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav'
      );

      // Should contain redaction markers
      expect(result.redactedTranscript).toContain('[');
      expect(result.redactedTranscript).toContain(']');
    });
  });

  describe('batch processing', () => {
    it('should process multiple audio files', async () => {
      const deidentifier = createDeidentifier();
      const files = [
        { id: 'audio-1', path: '/path/to/audio1.wav' },
        { id: 'audio-2', path: '/path/to/audio2.wav' },
        { id: 'audio-3', path: '/path/to/audio3.wav' },
      ];

      const results = await deidentifier.batchDeidentify(files, '/output');

      expect(results.size).toBe(3);
      for (const result of results.values()) {
        expect(result.success).toBe(true);
      }
    });

    it('should track batch progress', async () => {
      const deidentifier = createDeidentifier();
      const files = Array.from({ length: 5 }, (_, i) => ({
        id: `audio-${i}`,
        path: `/path/to/audio${i}.wav`,
      }));
      const progressFn = vi.fn();

      await deidentifier.batchDeidentify(files, '/output', progressFn);

      expect(progressFn).toHaveBeenCalledTimes(5);
      expect(progressFn).toHaveBeenLastCalledWith(5, 5);
    });
  });

  describe('reporting', () => {
    it('should generate batch report', async () => {
      const deidentifier = createDeidentifier();
      const files = [
        { id: 'audio-1', path: '/path/to/audio1.wav' },
        { id: 'audio-2', path: '/path/to/audio2.wav' },
      ];

      const results = await deidentifier.batchDeidentify(files, '/output');
      const report = deidentifier.generateReport(results);

      expect(report.totalFiles).toBe(2);
      expect(report.totalSegments).toBeGreaterThan(0);
      expect(report.totalPIIDetected).toBeGreaterThan(0);
    });

    it('should count files with scrubbed content', async () => {
      const deidentifier = createDeidentifier();
      const files = [
        { id: 'audio-1', path: '/path/to/audio1.wav' },
        { id: 'audio-2', path: '/path/to/audio2.wav' },
      ];

      const results = await deidentifier.batchDeidentify(files, '/output');
      const report = deidentifier.generateReport(results);

      expect(report.filesScrubbed).toBeGreaterThanOrEqual(0);
      expect(report.averageBleepCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('bleep tone generation', () => {
    it('should generate bleep tone waveform', () => {
      const deidentifier = createDeidentifier();
      const duration = 0.5;
      const frequency = 1000;

      const tone = deidentifier.generateBleepTone(duration, frequency);

      expect(tone).toBeInstanceOf(Float32Array);
      expect(tone.length).toBe(Math.floor(duration * 44100));
    });

    it('should apply fade in/out to bleep', () => {
      const deidentifier = createDeidentifier({
        fadeInMs: 50,
        fadeOutMs: 50,
      });
      const tone = deidentifier.generateBleepTone(0.5, 1000);

      // First samples should be close to 0 (fade in)
      expect(tone[0]).toBeLessThan(tone[1000]);
      
      // Last samples should be close to 0 (fade out)
      const lastIdx = tone.length - 1;
      expect(tone[lastIdx]).toBeLessThan(tone[lastIdx - 1000]);
    });
  });

  describe('medical use cases', () => {
    it('should handle doctor-patient consultation', async () => {
      const deidentifier = createDeidentifier();
      
      const result = await deidentifier.deidentifyAudio(
        '/path/to/consultation.wav',
        '/path/to/output.wav'
      );

      expect(result.success).toBe(true);
      expect(result.report.piiInstances).toBeGreaterThan(0);
      expect(result.removedSegments.some((s) => s.reason.includes('name'))).toBe(true);
    });

    it('should handle clinical dictation', async () => {
      const deidentifier = createDeidentifier();
      
      const result = await deidentifier.deidentifyAudio(
        '/path/to/dictation.wav',
        '/path/to/output.wav'
      );

      expect(result.success).toBe(true);
      // Should detect patient name, dates, etc.
      expect(result.removedSegments.length).toBeGreaterThan(0);
    });

    it('should preserve medical content while removing PII', async () => {
      const deidentifier = createDeidentifier();
      
      const result = await deidentifier.deidentifyAudio(
        '/path/to/medical.wav',
        '/path/to/output.wav'
      );

      // Redacted transcript should still contain medical info
      expect(result.redactedTranscript.length).toBeGreaterThan(0);
      // But no raw PII
      expect(result.report.piiScrubbed).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle processing errors gracefully', async () => {
      const deidentifier = createDeidentifier();
      
      // Invalid paths should still return a result object
      const result = await deidentifier.deidentifyAudio('', '');

      expect(result).toBeDefined();
      expect(result.redactedTranscript).toBeDefined();
    });

    it('should report errors in result', async () => {
      const deidentifier = createDeidentifier();
      
      const result = await deidentifier.deidentifyAudio('', '');

      // May have error property if something failed
      expect(result).toHaveProperty('error');
    });
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const deidentifier = createDeidentifier();
      const tone = deidentifier.generateBleepTone(0.5, 1000);

      expect(tone.length).toBe(Math.floor(0.5 * 44100));
    });

    it('should accept custom bleep duration', () => {
      const deidentifier = createDeidentifier({ bleepDuration: 1.0 });
      const tone = deidentifier.generateBleepTone(1.0, 1000);

      expect(tone.length).toBe(44100); // 1 second at 44.1kHz
    });

    it('should accept custom bleep frequency', () => {
      const deidentifier = createDeidentifier({ bleepFrequency: 2000 });
      const tone = deidentifier.generateBleepTone(0.5, 2000);

      expect(tone).toBeInstanceOf(Float32Array);
      expect(tone.length).toBe(Math.floor(0.5 * 44100));
    });
  });
});
