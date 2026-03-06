import { describe, it, expect, vi } from 'vitest';
import { AudioPreparer, AudioPreparationConfig } from '@/lib/preparation/multimodal/audio-preparer';

describe('AudioPreparer', () => {
  const createPreparer = () => new AudioPreparer();

  describe('basic preparation', () => {
    it('should prepare audio with silence segmentation', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'silence',
        silenceThreshold: 0.5,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.success).toBe(true);
      expect(result.segments.length).toBeGreaterThan(0);
      expect(result.manifestPath).toBeDefined();
    });

    it('should prepare audio with turn segmentation', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        outputFormat: 'flac',
        includeManifest: false,
      };

      const result = await preparer.prepareAudio(
        '/path/to/audio.wav',
        '/path/to/output.flac',
        config
      );

      expect(result.success).toBe(true);
      expect(result.segments.length).toBeGreaterThan(0);
      expect(result.metadata.duration).toBeGreaterThan(0);
    });
  });

  describe('diarization', () => {
    it('should identify speakers when diarization enabled', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        diarization: true,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.success).toBe(true);
      expect(result.stats.speakerCount).toBeGreaterThan(0);
      
      // All segments should have speaker IDs
      for (const segment of result.segments) {
        expect(segment.speakerId).toBeDefined();
        expect(segment.speakerId.length).toBeGreaterThan(0);
      }
    });

    it('should track multiple speakers', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        diarization: true,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/conversation.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.stats.speakerCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('STT alignment', () => {
    it('should align STT when enabled', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        sttAlignment: true,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.success).toBe(true);
      
      // Segments should have text
      for (const segment of result.segments) {
        expect(segment.text).toBeDefined();
        expect(segment.confidence).toBeGreaterThan(0);
      }
    });

    it('should count words in transcription', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        sttAlignment: true,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.stats.totalWords).toBeGreaterThan(0);
    });
  });

  describe('batch processing', () => {
    it('should process multiple audio files', async () => {
      const preparer = createPreparer();
      const files = [
        { id: 'audio-1', path: '/path/to/audio1.wav' },
        { id: 'audio-2', path: '/path/to/audio2.wav' },
        { id: 'audio-3', path: '/path/to/audio3.wav' },
      ];
      const config: AudioPreparationConfig = {
        segmentBy: 'silence',
        outputFormat: 'wav',
        includeManifest: true,
      };

      const results = await preparer.batchPrepare(files, '/output', config);

      expect(results.size).toBe(3);
      for (const result of results.values()) {
        expect(result.success).toBe(true);
      }
    });

    it('should track batch progress', async () => {
      const preparer = createPreparer();
      const files = Array.from({ length: 5 }, (_, i) => ({
        id: `audio-${i}`,
        path: `/path/to/audio${i}.wav`,
      }));
      const config: AudioPreparationConfig = {
        segmentBy: 'silence',
        outputFormat: 'wav',
        includeManifest: false,
      };
      const progressFn = vi.fn();

      await preparer.batchPrepare(files, '/output', config, progressFn);

      expect(progressFn).toHaveBeenCalledTimes(5);
      expect(progressFn).toHaveBeenLastCalledWith(5, 5);
    });
  });

  describe('manifest generation', () => {
    it('should generate manifest JSONL', async () => {
      const preparer = createPreparer();
      const files = [
        { id: 'audio-1', path: '/path/to/audio1.wav' },
        { id: 'audio-2', path: '/path/to/audio2.wav' },
      ];
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        sttAlignment: true,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const results = await preparer.batchPrepare(files, '/output', config);
      const manifest = preparer.generateManifestJson(results);

      expect(manifest.version).toBe('1.0');
      expect(manifest.totalFiles).toBe(2);
      expect(manifest.totalDuration).toBeGreaterThan(0);
      expect(manifest.totalSegments).toBeGreaterThan(0);
      expect(manifest.files.length).toBe(2);
    });

    it('should include speakers in manifest', async () => {
      const preparer = createPreparer();
      const files = [
        { id: 'audio-1', path: '/path/to/audio1.wav' },
      ];
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        diarization: true,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const results = await preparer.batchPrepare(files, '/output', config);
      const manifest = preparer.generateManifestJson(results);

      expect(manifest.files[0].speakers.length).toBeGreaterThan(0);
    });
  });

  describe('statistics', () => {
    it('should calculate audio statistics', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        outputFormat: 'wav',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.stats.originalDuration).toBeGreaterThan(0);
      expect(result.stats.segmentCount).toBeGreaterThan(0);
      expect(result.stats.avgSegmentDuration).toBeGreaterThan(0);
    });

    it('should track average segment duration', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        minSegmentLength: 2.0,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.stats.avgSegmentDuration).toBeGreaterThanOrEqual(2.0);
    });
  });

  describe('medical use cases', () => {
    it('should handle doctor-patient consultation', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        diarization: true,
        sttAlignment: true,
        outputFormat: 'flac',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/consultation.wav',
        '/path/to/output.flac',
        config
      );

      expect(result.success).toBe(true);
      expect(result.stats.speakerCount).toBeGreaterThanOrEqual(2); // Doctor + patient
      expect(result.stats.totalWords).toBeGreaterThan(0);
    });

    it('should handle clinical dictation', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'silence',
        silenceThreshold: 1.0,
        sttAlignment: true,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/dictation.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.success).toBe(true);
      // Dictation usually has medical terms
      expect(result.stats.totalWords).toBeGreaterThan(0);
    });

    it('should segment by silence for call center audio', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'silence',
        silenceThreshold: 0.3,
        minSegmentLength: 1.0,
        diarization: true,
        outputFormat: 'wav',
        includeManifest: true,
      };

      const result = await preparer.prepareAudio(
        '/path/to/call-center.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.success).toBe(true);
      expect(result.segments.length).toBeGreaterThan(0);
    });
  });

  describe('format conversion', () => {
    it('should export to WAV', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'silence',
        outputFormat: 'wav',
        includeManifest: false,
      };

      const result = await preparer.prepareAudio(
        '/path/to/audio.wav',
        '/path/to/output.wav',
        config
      );

      expect(result.success).toBe(true);
      expect(result.outputPath).toMatch(/\.wav$/);
    });

    it('should export to FLAC', async () => {
      const preparer = createPreparer();
      const config: AudioPreparationConfig = {
        segmentBy: 'turns',
        outputFormat: 'flac',
        includeManifest: false,
      };

      const result = await preparer.prepareAudio(
        '/path/to/audio.wav',
        '/path/to/output.flac',
        config
      );

      expect(result.success).toBe(true);
      expect(result.outputPath).toMatch(/\.flac$/);
    });
  });
});
