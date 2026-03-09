// Stub for backward compatibility after Sprint 1 cleanup
export interface WatermarkDetectionResult {
  detected: boolean;
  contractId: string | null;
  confidence: number;
  method?: string;
}

export interface ForensicReportResult {
  audioHash: string;
  matches: Array<{
    contractId: string;
    buyer: string;
    confidence: number;
    timestamp: Date;
  }>;
  tenantId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  chain?: Array<{
    contractId: string;
    buyer: string;
    confidence: number;
    timestamp: Date;
  }>;
}

export class WatermarkDetector {
  async detect(audioData: Buffer, candidates?: string[]): Promise<WatermarkDetectionResult> {
    console.warn('Watermark detection stubbed');
    return { 
      detected: false, 
      contractId: null,
      confidence: 0,
      method: 'stub'
    };
  }

  async extractForensics(audioData: Buffer): Promise<ForensicReportResult> {
    console.warn('Forensics extraction stubbed');
    return { 
      audioHash: 'stub-hash',
      matches: [],
      tenantId: 'stub-tenant',
      timestamp: new Date(),
      metadata: {}, 
      chain: [] 
    };
  }
}

export const watermarkDetector = new WatermarkDetector();

export async function detectWatermark(audioData: Buffer, candidates?: string[]): Promise<WatermarkDetectionResult> {
  return watermarkDetector.detect(audioData, candidates);
}

export async function generateForensicReport(audioData: Buffer): Promise<Buffer> {
  // Return a simple PDF-like buffer
  return Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n');
}
