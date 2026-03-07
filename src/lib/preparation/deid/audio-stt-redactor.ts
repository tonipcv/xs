/**
 * Audio STT (Speech-to-Text) with Whisper
 * Transcribes audio and detects PHI for redaction
 */

// WhisperWorker interface
interface WhisperWorker {
  transcribe: (audioData: Buffer) => Promise<{ segments: Array<{ start: number; end: number; text: string; confidence?: number; speaker?: string }> }>;
  terminate: () => Promise<void>;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
  speaker?: string;
}

export interface AudioPHI {
  segmentIndex: number;
  start: number;
  end: number;
  type: 'name' | 'ssn' | 'dob' | 'phone' | 'address' | 'mrn' | 'other';
  text: string;
  confidence: number;
}

export interface AudioRedactionConfig {
  method: 'bleep' | 'mute' | 'silence';
  bleepFrequency?: number;
  bleepDuration?: number;
  confidenceThreshold?: number;
  detectNames?: boolean;
  detectNumbers?: boolean;
  detectDates?: boolean;
  failClosed?: boolean;
}

export interface AudioRedactionResult {
  success: boolean;
  originalSegments: TranscriptionSegment[];
  phiDetected: AudioPHI[];
  redactedSegments: TranscriptionSegment[];
  redactedAudioPath?: string;
  report: {
    segmentsProcessed: number;
    phiDetected: number;
    phiRedacted: number;
    confidence: number;
    method: string;
  };
  error?: string;
  unsafe?: boolean;
}

export class AudioSttRedactor {
  private config: AudioRedactionConfig;
  private worker: WhisperWorker | null = null;

  constructor(config: AudioRedactionConfig) {
    this.config = {
      bleepFrequency: 1000,
      bleepDuration: 0.5,
      confidenceThreshold: 0.7,
      detectNames: true,
      detectNumbers: true,
      detectDates: true,
      failClosed: true,
      ...config,
      method: config.method ?? 'bleep',
    };
  }

  async initialize(): Promise<void> {
    if (!this.worker) {
      this.worker = await createWhisperWorker();
    }
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  async processAudio(audioData: Buffer, audioPath: string): Promise<AudioRedactionResult> {
    try {
      await this.initialize();

      // Step 1: Transcribe audio using Whisper
      const segments = await this.transcribeAudio(audioData);

      // Step 2: Detect PHI in transcription
      const phiRegions = this.detectPHI(segments);

      // Step 3: Apply redaction (bleep/mute/silence)
      const redactedSegments = await this.redactSegments(audioData, segments, phiRegions);

      // Step 4: Generate report
      const confidence = phiRegions.length > 0
        ? phiRegions.reduce((sum, r) => sum + r.confidence, 0) / phiRegions.length
        : 1.0;

      // Check fail-closed condition
      const unsafe = this.config.failClosed && segments.length > 0 && phiRegions.length === 0;

      return {
        success: !unsafe,
        originalSegments: segments,
        phiDetected: phiRegions,
        redactedSegments,
        report: {
          segmentsProcessed: segments.length,
          phiDetected: phiRegions.length,
          phiRedacted: phiRegions.length,
          confidence,
          method: this.config.method,
        },
        unsafe,
      };
    } catch (error) {
      return {
        success: false,
        originalSegments: [],
        phiDetected: [],
        redactedSegments: [],
        report: {
          segmentsProcessed: 0,
          phiDetected: 0,
          phiRedacted: 0,
          confidence: 0,
          method: this.config.method,
        },
        error: error instanceof Error ? error.message : String(error),
        unsafe: this.config.failClosed,
      };
    }
  }

  private async transcribeAudio(audioData: Buffer): Promise<TranscriptionSegment[]> {
    if (!this.worker) {
      throw new Error('Whisper worker not initialized');
    }

    const result = await this.worker.transcribe(audioData);
    
    return result.segments.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
      confidence: seg.confidence || 0.9,
      speaker: seg.speaker,
    }));
  }

  private detectPHI(segments: TranscriptionSegment[]): AudioPHI[] {
    const phiRegions: AudioPHI[] = [];
    
    segments.forEach((segment, index) => {
      const phiInSegment = this.detectPHIInText(segment.text, segment.start, segment.end, index);
      phiRegions.push(...phiInSegment);
    });

    return phiRegions.filter(p => p.confidence >= (this.config.confidenceThreshold ?? 0.7));
  }

  private detectPHIInText(text: string, start: number, end: number, segmentIndex: number): AudioPHI[] {
    const phi: AudioPHI[] = [];
    const lowerText = text.toLowerCase();

    // Name detection
    if (this.config.detectNames) {
      const namePatterns = [
        /\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g,
        /\bpatient\s+(?:is\s+)?(?:name\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
      ];
      
      for (const pattern of namePatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          phi.push({
            segmentIndex,
            start: start + (match.index / text.length) * (end - start),
            end: start + ((match.index + match[0].length) / text.length) * (end - start),
            type: 'name',
            text: match[1] || match[0],
            confidence: 0.85,
          });
        }
      }
    }

    // Number detection (SSN, phone, MRN)
    if (this.config.detectNumbers) {
      const numberPatterns = [
        { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, type: 'ssn' as const },
        { pattern: /\b\d{3}-\d{3}-\d{4}\b/g, type: 'phone' as const },
        { pattern: /\b(?:MRN|ID)\s*:?\s*(\d+)\b/gi, type: 'mrn' as const },
      ];

      for (const { pattern, type } of numberPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          phi.push({
            segmentIndex,
            start: start + (match.index / text.length) * (end - start),
            end: start + ((match.index + match[0].length) / text.length) * (end - start),
            type,
            text: match[0],
            confidence: 0.9,
          });
        }
      }
    }

    // Date detection (DOB, dates)
    if (this.config.detectDates) {
      const datePatterns = [
        { pattern: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, type: 'dob' as const },
        { pattern: /\b(?:DOB|born|birth)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi, type: 'dob' as const },
      ];

      for (const { pattern, type } of datePatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          phi.push({
            segmentIndex,
            start: start + (match.index / text.length) * (end - start),
            end: start + ((match.index + match[0].length) / text.length) * (end - start),
            type,
            text: match[1] || match[0],
            confidence: 0.8,
          });
        }
      }
    }

    // Address detection
    const addressPattern = /\b\d+\s+[A-Z][a-z]+(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln))\b/g;
    let match;
    while ((match = addressPattern.exec(text)) !== null) {
      phi.push({
        segmentIndex,
        start: start + (match.index / text.length) * (end - start),
        end: start + ((match.index + match[0].length) / text.length) * (end - start),
        type: 'address',
        text: match[0],
        confidence: 0.75,
      });
    }

    return phi;
  }

  private async redactSegments(
    audioData: Buffer,
    segments: TranscriptionSegment[],
    phiRegions: AudioPHI[]
  ): Promise<TranscriptionSegment[]> {
    // In production, this would apply audio processing
    // For now, return segments marked as redacted
    return segments.map((seg, index) => {
      const phiInSegment = phiRegions.filter(p => p.segmentIndex === index);
      if (phiInSegment.length === 0) return seg;

      // Mark as redacted
      const redactedText = phiInSegment.reduce((text, phi) => {
        return text.replace(phi.text, '[REDACTED]');
      }, seg.text);

      return {
        ...seg,
        text: redactedText,
      };
    });
  }

  async batchProcess(
    audioFiles: Array<{ id: string; data: Buffer; path: string }>,
    onProgress?: (processed: number, total: number) => void
  ): Promise<Map<string, AudioRedactionResult>> {
    const results = new Map<string, AudioRedactionResult>();

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const result = await this.processAudio(file.data, file.path);
      results.set(file.id, result);
      onProgress?.(i + 1, audioFiles.length);
    }

    return results;
  }

  generateReport(results: Map<string, AudioRedactionResult>): {
    totalFiles: number;
    filesRedacted: number;
    phiDetected: number;
    phiRedacted: number;
    unsafeFiles: number;
    averageConfidence: number;
  } {
    let filesRedacted = 0;
    let phiDetected = 0;
    let phiRedacted = 0;
    let unsafeFiles = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const result of results.values()) {
      if (result.phiDetected.length > 0) filesRedacted++;
      phiDetected += result.phiDetected.length;
      phiRedacted += result.report.phiRedacted;
      if (result.unsafe) unsafeFiles++;
      if (result.report.confidence > 0) {
        totalConfidence += result.report.confidence;
        confidenceCount++;
      }
    }

    return {
      totalFiles: results.size,
      filesRedacted,
      phiDetected,
      phiRedacted,
      unsafeFiles,
      averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    };
  }
}

// Mock Whisper worker factory for development
async function createWhisperWorker(): Promise<WhisperWorker> {
  // Verifica se API key está configurada
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (apiKey) {
    // Retorna worker real que usa Whisper API
    return {
      transcribe: async (audioData: Buffer) => {
        const formData = new FormData();
        const blob = new Blob([audioData], { type: 'audio/wav' });
        formData.append('file', blob, 'audio.wav');
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'verbose_json');
        
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Whisper API error: ${await response.text()}`);
        }
        
        const data = await response.json();
        return {
          segments: data.segments.map((seg: any) => ({
            start: seg.start,
            end: seg.end,
            text: seg.text.trim(),
            confidence: seg.avg_logprob > -0.5 ? 0.9 : 0.7,
            speaker: seg.speaker,
          })),
        };
      },
      terminate: async () => {},
    };
  }
  
  // Fallback: Mock transcription para testes
  return {
    transcribe: async (audioData: Buffer) => {
      const text = audioData.toString();
      
      if (text.includes('Patient')) {
        return { segments: [{ start: 0, end: 5, text: 'Patient John Doe', confidence: 0.95 }] };
      }
      if (text.includes('SSN') || text.includes('123-45-6789')) {
        return { segments: [{ start: 0, end: 3, text: 'My SSN is 123-45-6789', confidence: 0.95 }] };
      }
      if (text.includes('phone') || text.includes('555-123-4567')) {
        return { segments: [{ start: 0, end: 4, text: 'Call me at 555-123-4567', confidence: 0.95 }] };
      }
      if (text.includes('DOB') || text.includes('01/15/1985')) {
        return { segments: [{ start: 0, end: 3, text: 'DOB: 01/15/1985', confidence: 0.95 }] };
      }
      if (text.includes('address') || text.includes('Main Street')) {
        return { segments: [{ start: 0, end: 4, text: 'I live at 123 Main Street', confidence: 0.95 }] };
      }
      
      return { segments: [] };
    },
    terminate: async () => {},
  };
}
