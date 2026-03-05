// Stub for backward compatibility after Sprint 1 cleanup
export class WatermarkDetector {
  async detect(audioData: Buffer) {
    console.warn('Watermark detection stubbed');
    return { detected: false, confidence: 0 };
  }

  async extractForensics(audioData: Buffer) {
    console.warn('Forensics extraction stubbed');
    return { metadata: {}, chain: [] };
  }
}

export const watermarkDetector = new WatermarkDetector();

export async function detectWatermark(audioData: Buffer) {
  return watermarkDetector.detect(audioData);
}

export async function generateForensicReport(audioData: Buffer) {
  return watermarkDetector.extractForensics(audioData);
}
