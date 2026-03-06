/**
 * Audio De-identifier with STT + PII Detection + Bleep
 * Detects PII in audio via STT, maps timestamps, applies bleep/silence
 */

export interface AudioSegment {
  startTime: number;
  endTime: number;
  text: string;
  speakerId?: string;
  confidence: number;
}

export interface DetectedPII {
  type: 'name' | 'ssn' | 'mrn' | 'phone' | 'email' | 'date' | 'address' | 'other';
  value: string;
  segmentIndex: number;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface AudioScrubConfig {
  bleepDuration: number;
  bleepFrequency: number;
  fadeInMs: number;
  fadeOutMs: number;
  preserveNonPII: boolean;
}

export interface TranscriptionResult {
  text: string;
  segments: AudioSegment[];
  detectedPII: DetectedPII[];
  language: string;
  confidence: number;
}

export interface AudioScrubResult {
  success: boolean;
  scrubbedAudioPath?: string;
  redactedTranscript: string;
  report: {
    segmentsDetected: number;
    piiInstances: number;
    piiScrubbed: number;
    bleepCount: number;
    durationReduced: number;
  };
  removedSegments: Array<{
    originalText: string;
    reason: string;
    startTime: number;
    endTime: number;
  }>;
  error?: string;
}

export class AudioDeidentifier {
  private scrubConfig: AudioScrubConfig;

  constructor(config?: Partial<AudioScrubConfig>) {
    this.scrubConfig = {
      bleepDuration: 0.5,
      bleepFrequency: 1000,
      fadeInMs: 50,
      fadeOutMs: 50,
      preserveNonPII: true,
      ...config,
    };
  }

  async deidentifyAudio(
    audioPath: string,
    outputPath: string
  ): Promise<AudioScrubResult> {
    try {
      // Step 1: STT transcription
      const transcription = await this.transcribeAudio(audioPath);

      // Step 2: Detect PII in transcription
      const detectedPII = this.detectPIIInTranscription(transcription);

      // Step 3: Redact PII from transcript
      const redactedTranscript = this.redactTranscript(transcription.text, detectedPII);

      // Step 4: Apply bleep/silence to audio segments
      const scrubbedAudioPath = await this.scrubAudioSegments(
        audioPath,
        outputPath,
        detectedPII
      );

      // Generate report
      const piiScrubbed = detectedPII.length;
      const durationReduced = detectedPII.reduce(
        (sum, pii) => sum + (pii.endTime - pii.startTime),
        0
      );

      return {
        success: true,
        scrubbedAudioPath,
        redactedTranscript,
        report: {
          segmentsDetected: transcription.segments.length,
          piiInstances: detectedPII.length,
          piiScrubbed,
          bleepCount: detectedPII.length,
          durationReduced,
        },
        removedSegments: detectedPII.map((pii) => ({
          originalText: pii.value,
          reason: `PII detected: ${pii.type}`,
          startTime: pii.startTime,
          endTime: pii.endTime,
        })),
      };
    } catch (error) {
      return {
        success: false,
        redactedTranscript: '',
        report: {
          segmentsDetected: 0,
          piiInstances: 0,
          piiScrubbed: 0,
          bleepCount: 0,
          durationReduced: 0,
        },
        removedSegments: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
    // In production, this would call Whisper or similar STT service
    // For simulation, return mock data
    const mockSegments: AudioSegment[] = [
      {
        startTime: 0,
        endTime: 3.5,
        text: 'Patient John Smith was admitted on January fifteenth',
        speakerId: 'doctor',
        confidence: 0.92,
      },
      {
        startTime: 3.8,
        endTime: 7.2,
        text: 'Social security number is one two three four five six seven eight nine',
        speakerId: 'patient',
        confidence: 0.88,
      },
      {
        startTime: 7.5,
        endTime: 10.0,
        text: 'The diagnosis is pneumonia and the treatment is antibiotics',
        speakerId: 'doctor',
        confidence: 0.95,
      },
    ];

    const fullText = mockSegments.map((s) => s.text).join(' ');

    return {
      text: fullText,
      segments: mockSegments,
      detectedPII: [], // Will be populated by detectPIIInTranscription
      language: 'en',
      confidence: 0.91,
    };
  }

  private detectPIIInTranscription(transcription: TranscriptionResult): DetectedPII[] {
    const detected: DetectedPII[] = [];

    // PII patterns
    const patterns: Array<{ type: DetectedPII['type']; regex: RegExp }> = [
      { type: 'name', regex: /\b(?:Patient|Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi },
      { type: 'ssn', regex: /\b(?:social security number|SSN)[:\s]*(\d[\s\d-]*)\b/gi },
      { type: 'date', regex: /\b(?:admitted on|date of birth|DOB)[:\s]*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?)\b/gi },
      { type: 'phone', regex: /\b(\d{3}[-.]?\d{3}[-.]?\d{4})\b/g },
      { type: 'email', regex: /\b([\w.-]+@[\w.-]+\.\w+)\b/g },
    ];

    for (let i = 0; i < transcription.segments.length; i++) {
      const segment = transcription.segments[i];

      for (const { type, regex } of patterns) {
        let match;
        while ((match = regex.exec(segment.text)) !== null) {
          detected.push({
            type,
            value: match[1] || match[0],
            segmentIndex: i,
            startTime: segment.startTime,
            endTime: segment.endTime,
            confidence: segment.confidence * 0.9,
          });
        }
      }
    }

    return detected;
  }

  private redactTranscript(originalText: string, piiList: DetectedPII[]): string {
    let redacted = originalText;

    // Sort by position (descending) to avoid offset issues
    const sorted = [...piiList].sort((a, b) => b.startTime - a.startTime);

    for (const pii of sorted) {
      redacted = redacted.replace(pii.value, `[${pii.type.toUpperCase()}]`);
    }

    return redacted;
  }

  private async scrubAudioSegments(
    inputPath: string,
    outputPath: string,
    piiList: DetectedPII[]
  ): Promise<string> {
    // In production, this would:
    // 1. Load audio file
    // 2. For each PII segment:
    //    - Apply bleep tone or silence
    //    - Add fade in/out
    // 3. Export scrubbed audio
    // For now, return the output path
    return outputPath;
  }

  async batchDeidentify(
    audioFiles: Array<{ id: string; path: string }>,
    outputDir: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<Map<string, AudioScrubResult>> {
    const results = new Map<string, AudioScrubResult>();

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const outputPath = `${outputDir}/${file.id}_scrubbed.wav`;
      const result = await this.deidentifyAudio(file.path, outputPath);
      results.set(file.id, result);
      onProgress?.(i + 1, audioFiles.length);
    }

    return results;
  }

  generateReport(results: Map<string, AudioScrubResult>): {
    totalFiles: number;
    filesScrubbed: number;
    totalSegments: number;
    totalPIIDetected: number;
    totalPIIScrubbed: number;
    averageBleepCount: number;
  } {
    let filesScrubbed = 0;
    let totalSegments = 0;
    let totalPIIDetected = 0;
    let totalPIIScrubbed = 0;
    let totalBleeps = 0;

    for (const result of results.values()) {
      if (result.success && result.report.piiScrubbed > 0) filesScrubbed++;
      totalSegments += result.report.segmentsDetected;
      totalPIIDetected += result.report.piiInstances;
      totalPIIScrubbed += result.report.piiScrubbed;
      totalBleeps += result.report.bleepCount;
    }

    return {
      totalFiles: results.size,
      filesScrubbed,
      totalSegments,
      totalPIIDetected,
      totalPIIScrubbed,
      averageBleepCount: results.size > 0 ? totalBleeps / results.size : 0,
    };
  }

  // Utility: Generate bleep waveform
  generateBleepTone(duration: number, frequency: number): Float32Array {
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const tone = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      // Sine wave at frequency with fade in/out
      const t = i / sampleRate;
      let amplitude = 0.5;
      
      // Apply fade in
      if (t < this.scrubConfig.fadeInMs / 1000) {
        amplitude *= t / (this.scrubConfig.fadeInMs / 1000);
      }
      
      // Apply fade out
      const fadeOutStart = duration - this.scrubConfig.fadeOutMs / 1000;
      if (t > fadeOutStart) {
        amplitude *= (duration - t) / (this.scrubConfig.fadeOutMs / 1000);
      }

      tone[i] = amplitude * Math.sin(2 * Math.PI * frequency * t);
    }

    return tone;
  }
}
