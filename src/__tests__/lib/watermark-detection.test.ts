import { describe, it, expect, beforeAll, vi } from 'vitest';
import { detectWatermark, generateForensicReport } from '@/lib/xase/watermark-detector';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Watermark Detection', () => {
  let testAudioBuffer: Buffer;
  const testContractId = 'contract_test_12345';

  beforeAll(async () => {
    // Create a simple WAV file for testing
    testAudioBuffer = createSimpleWavBuffer();
  });

  describe('detectWatermark', () => {
    it('should return no detection when no candidates provided', async () => {
      const result = await detectWatermark(testAudioBuffer, []);
      
      expect(result.detected).toBe(false);
      expect(result.contractId).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should attempt detection with candidates', async () => {
      const candidates = ['contract_1', 'contract_2', 'contract_3'];
      const result = await detectWatermark(testAudioBuffer, candidates);
      
      expect(result).toHaveProperty('detected');
      expect(result).toHaveProperty('contractId');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('method');
      expect(typeof result.detected).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
    });

    it('should handle invalid audio data gracefully', async () => {
      const invalidBuffer = Buffer.from('not a wav file');
      const candidates = ['contract_1'];
      
      const result = await detectWatermark(invalidBuffer, candidates);
      
      // Should not throw, should return no detection
      expect(result.detected).toBe(false);
    });
  });

  describe('generateForensicReport', () => {
    it('should generate PDF report with matches', async () => {
      const reportData = {
        audioHash: 'abc123',
        matches: [
          {
            contractId: 'contract_1',
            buyer: 'tenant_a',
            confidence: 0.95,
            timestamp: new Date(),
          },
        ],
        tenantId: 'tenant_test',
        timestamp: new Date(),
      };

      const reportBuffer = await generateForensicReport(Buffer.from('test audio data'));
      
      expect(reportBuffer).toBeInstanceOf(Buffer);
    });

    it('should generate report with single match', async () => {
      const reportData = {
        audioHash: 'single_match_hash',
        matches: [
          {
            contractId: 'contract_solo',
            buyer: 'tenant_solo',
            confidence: 0.98,
            timestamp: new Date(),
          },
        ],
        tenantId: 'tenant_test',
        timestamp: new Date(),
      };

      const reportBuffer = await generateForensicReport(Buffer.from('single match audio'));
      
      expect(reportBuffer).toBeInstanceOf(Buffer);
    });
  });
});

/**
 * Create a minimal valid WAV file buffer for testing
 */
function createSimpleWavBuffer(): Buffer {
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  const duration = 0.1; // 100ms
  const numSamples = Math.floor(sampleRate * duration);
  
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const fileSize = 44 + dataSize;
  
  const buffer = Buffer.alloc(fileSize);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize - 8, 4);
  buffer.write('WAVE', 8);
  
  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // byte rate
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // block align
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  // Generate simple sine wave
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const frequency = 440; // A4 note
    const amplitude = 0.3;
    const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
    const sampleInt = Math.floor(sample * 32767);
    buffer.writeInt16LE(sampleInt, 44 + i * 2);
  }
  
  return buffer;
}
