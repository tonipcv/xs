import * as fs from 'fs';
import * as path from 'path';
import { DeidentificationResult, PHIEntity, ValidationDetails } from './types';

export class AudioDeidentifier {
  private phiDetected: PHIEntity[] = [];
  private redactionMap: Map<string, string> = new Map();

  async deidentify(audioPath: string): Promise<DeidentificationResult> {
    this.phiDetected = [];
    this.redactionMap = new Map();

    const metadataPath = audioPath.replace('.wav', '_metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Metadata file not found: ${metadataPath}`);
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const transcript = metadata.transcript || '';

    // Detect PHI in transcript
    this.detectPHI(transcript);

    // Redact PHI from transcript
    const deidentifiedTranscript = this.redactTranscript(transcript);

    // For audio, we would typically:
    // 1. Use speech-to-text to get transcript
    // 2. Detect PHI in transcript
    // 3. Use timestamps to identify PHI segments in audio
    // 4. Replace audio segments with beeps or silence
    // 
    // For this test, we'll simulate by creating a redacted transcript
    // and marking audio segments that would need redaction

    const audioSegments = this.identifyAudioSegments(metadata.phiEntities || []);

    // Validate
    const validation = this.validateDeidentification(deidentifiedTranscript);

    // Create output
    const outputDir = path.join(path.dirname(audioPath), '../../output/audio');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFilename = 'deidentified_' + path.basename(audioPath).replace('.wav', '.json');
    const outputPath = path.join(outputDir, outputFilename);

    const result = {
      original: audioPath,
      deidentified: JSON.stringify({
        transcript: deidentifiedTranscript,
        audioSegmentsToRedact: audioSegments,
        metadata: {
          duration: metadata.duration,
          sampleRate: metadata.sampleRate,
          phiDetected: this.phiDetected.length,
          phiRedacted: this.redactionMap.size
        }
      }, null, 2),
      phiEntities: this.phiDetected,
      redactionMap: this.redactionMap,
      integrityValid: validation.isValid,
      validationDetails: validation
    };

    fs.writeFileSync(outputPath, result.deidentified);

    // Save redaction map
    const redactionMapPath = path.join(outputDir, 'redaction_map_' + path.basename(audioPath).replace('.wav', '.txt'));
    const redactionMapContent = Array.from(this.redactionMap.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    fs.writeFileSync(redactionMapPath, redactionMapContent);

    return result;
  }

  private detectPHI(transcript: string): void {
    // Names
    const namePattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g;
    let match;
    while ((match = namePattern.exec(transcript)) !== null) {
      this.phiDetected.push({
        type: 'NAME',
        text: match[1],
        start: match.index,
        end: match.index + match[1].length,
        confidence: 0.85
      });
    }

    // MRN
    const mrnPattern = /\b(medical record number|MRN)\s+(\d{6,})/gi;
    while ((match = mrnPattern.exec(transcript)) !== null) {
      this.phiDetected.push({
        type: 'MRN',
        text: match[2],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.95
      });
    }

    // SSN
    const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
    while ((match = ssnPattern.exec(transcript)) !== null) {
      this.phiDetected.push({
        type: 'SSN',
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.95
      });
    }

    // Phone
    const phonePattern = /\b\d{3}-\d{3}-\d{4}\b/g;
    while ((match = phonePattern.exec(transcript)) !== null) {
      this.phiDetected.push({
        type: 'PHONE',
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.9
      });
    }

    // Dates
    const datePattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/g;
    while ((match = datePattern.exec(transcript)) !== null) {
      this.phiDetected.push({
        type: 'DATE',
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.9
      });
    }

    // Addresses
    const addressPattern = /\b\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd),\s+[A-Z][a-z]+,\s+[A-Z]{2}\s+\d{5}\b/g;
    while ((match = addressPattern.exec(transcript)) !== null) {
      this.phiDetected.push({
        type: 'ADDRESS',
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.85
      });
    }
  }

  private redactTranscript(transcript: string): string {
    let result = transcript;
    const sortedEntities = [...this.phiDetected].sort((a, b) => b.start - a.start);

    for (const entity of sortedEntities) {
      const redacted = this.getRedactedValue(entity);
      result = result.substring(0, entity.start) + redacted + result.substring(entity.end);
      this.redactionMap.set(`${entity.type}_${entity.start}`, `${entity.text} -> ${redacted}`);
    }

    return result;
  }

  private getRedactedValue(entity: PHIEntity): string {
    switch (entity.type) {
      case 'NAME':
        return '[NAME REDACTED]';
      case 'MRN':
        return '[MRN REDACTED]';
      case 'SSN':
        return '[SSN REDACTED]';
      case 'PHONE':
        return '[PHONE REDACTED]';
      case 'DATE':
        return '[DATE REDACTED]';
      case 'ADDRESS':
        return '[ADDRESS REDACTED]';
      default:
        return '[REDACTED]';
    }
  }

  private identifyAudioSegments(phiEntities: any[]): Array<{ start: number; end: number; type: string }> {
    // In a real implementation, this would use speech-to-text timestamps
    // to identify exact audio segments containing PHI
    // For simulation, we estimate based on character position and average speech rate
    
    const avgCharsPerSecond = 15; // Typical speech rate
    
    return phiEntities.map(entity => ({
      start: entity.start / avgCharsPerSecond,
      end: entity.end / avgCharsPerSecond,
      type: entity.type
    }));
  }

  private validateDeidentification(deidentifiedTranscript: string): ValidationDetails {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for remaining PHI patterns
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(deidentifiedTranscript)) {
      errors.push('Possible SSN still present in transcript');
    }

    if (/\b\d{3}-\d{3}-\d{4}\b/.test(deidentifiedTranscript)) {
      warnings.push('Possible phone number pattern detected');
    }

    // Check that transcript is not empty
    if (deidentifiedTranscript.trim().length === 0) {
      errors.push('Deidentified transcript is empty');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  getMetrics() {
    return {
      phiDetected: this.phiDetected.length,
      phiRedacted: this.redactionMap.size,
      redactionRate: this.phiDetected.length > 0 
        ? (this.redactionMap.size / this.phiDetected.length) * 100 
        : 0
    };
  }
}
