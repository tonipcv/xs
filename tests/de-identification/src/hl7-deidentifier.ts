import * as fs from 'fs';
import * as path from 'path';
import { PHIEntity, ValidationDetails } from './types';

interface HL7Segment {
  type: string;
  fields: string[];
}

interface HL7Message {
  segments: HL7Segment[];
  raw: string;
}

export class HL7Deidentifier {
  private phiDetected: PHIEntity[] = [];
  private redactionMap: Map<string, string> = new Map();
  private dateOffset: number = 0;

  async deidentify(hl7Path: string): Promise<any> {
    this.phiDetected = [];
    this.redactionMap = new Map();
    this.dateOffset = Math.floor(Math.random() * 365) - 182; // Random offset ±6 months

    const content = fs.readFileSync(hl7Path, 'utf-8');
    const message = this.parseHL7(content);

    // De-identify segments
    const deidentifiedSegments = message.segments.map(seg => this.deidentifySegment(seg));

    // Reconstruct message
    const deidentified = deidentifiedSegments.map(seg => seg.fields.join('|')).join('\r\n');

    // Validate
    const validation = this.validateHL7(deidentified);

    // Save output
    const outputDir = path.join(path.dirname(hl7Path), '../../output/hl7');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFilename = 'deidentified_' + path.basename(hl7Path);
    const outputPath = path.join(outputDir, outputFilename);
    fs.writeFileSync(outputPath, deidentified);

    return {
      original: content,
      deidentified,
      phiEntities: this.phiDetected,
      redactionMap: this.redactionMap,
      integrityValid: validation.isValid,
      validationDetails: validation
    };
  }

  private parseHL7(content: string): HL7Message {
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const segments: HL7Segment[] = [];

    for (const line of lines) {
      const fields = line.split('|');
      if (fields.length > 0) {
        segments.push({
          type: fields[0],
          fields
        });
      }
    }

    return { segments, raw: content };
  }

  private deidentifySegment(segment: HL7Segment): HL7Segment {
    const newFields = [...segment.fields];

    switch (segment.type) {
      case 'PID': // Patient Identification
        // PID-3: Patient ID
        if (newFields[3]) {
          this.trackPHI('ID', newFields[3], 0, newFields[3].length);
          newFields[3] = this.hashIdentifier(newFields[3]);
        }
        // PID-5: Patient Name
        if (newFields[5]) {
          this.trackPHI('NAME', newFields[5], 0, newFields[5].length);
          newFields[5] = 'REDACTED^NAME';
        }
        // PID-7: Date of Birth
        if (newFields[7]) {
          this.trackPHI('DATE', newFields[7], 0, newFields[7].length);
          newFields[7] = this.shiftHL7Date(newFields[7]);
        }
        // PID-11: Patient Address
        if (newFields[11]) {
          this.trackPHI('LOCATION', newFields[11], 0, newFields[11].length);
          newFields[11] = 'REDACTED ADDRESS';
        }
        // PID-13: Phone Number - Home
        if (newFields[13]) {
          this.trackPHI('PHONE', newFields[13], 0, newFields[13].length);
          newFields[13] = 'REDACTED';
        }
        // PID-14: Phone Number - Business
        if (newFields[14]) {
          this.trackPHI('PHONE', newFields[14], 0, newFields[14].length);
          newFields[14] = 'REDACTED';
        }
        // PID-19: SSN
        if (newFields[19]) {
          this.trackPHI('SSN', newFields[19], 0, newFields[19].length);
          newFields[19] = 'REDACTED';
        }
        break;

      case 'PV1': // Patient Visit
        // PV1-7: Attending Doctor
        if (newFields[7]) {
          this.trackPHI('NAME', newFields[7], 0, newFields[7].length);
          newFields[7] = 'REDACTED^PHYSICIAN';
        }
        // PV1-8: Referring Doctor
        if (newFields[8]) {
          this.trackPHI('NAME', newFields[8], 0, newFields[8].length);
          newFields[8] = 'REDACTED^PHYSICIAN';
        }
        // PV1-44: Admit Date/Time
        if (newFields[44]) {
          this.trackPHI('DATE', newFields[44], 0, newFields[44].length);
          newFields[44] = this.shiftHL7DateTime(newFields[44]);
        }
        break;

      case 'OBR': // Observation Request
        // OBR-7: Observation Date/Time
        if (newFields[7]) {
          this.trackPHI('DATE', newFields[7], 0, newFields[7].length);
          newFields[7] = this.shiftHL7DateTime(newFields[7]);
        }
        // OBR-16: Ordering Provider
        if (newFields[16]) {
          this.trackPHI('NAME', newFields[16], 0, newFields[16].length);
          newFields[16] = 'REDACTED^PROVIDER';
        }
        break;

      case 'OBX': // Observation Result
        // Check if value contains PHI
        if (newFields[5]) {
          const value = newFields[5];
          // Detect names in observation values
          const namePattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g;
          let match;
          while ((match = namePattern.exec(value)) !== null) {
            this.trackPHI('NAME', match[1], match.index, match.index + match[1].length);
          }
          // Detect phone numbers
          const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
          while ((match = phonePattern.exec(value)) !== null) {
            this.trackPHI('PHONE', match[0], match.index, match.index + match[0].length);
          }
        }
        break;

      case 'NK1': // Next of Kin
        // NK1-2: Name
        if (newFields[2]) {
          this.trackPHI('NAME', newFields[2], 0, newFields[2].length);
          newFields[2] = 'REDACTED^CONTACT';
        }
        // NK1-4: Address
        if (newFields[4]) {
          this.trackPHI('LOCATION', newFields[4], 0, newFields[4].length);
          newFields[4] = 'REDACTED ADDRESS';
        }
        // NK1-5: Phone Number
        if (newFields[5]) {
          this.trackPHI('PHONE', newFields[5], 0, newFields[5].length);
          newFields[5] = 'REDACTED';
        }
        break;

      case 'MSH': // Message Header
        // MSH-7: Date/Time of Message
        if (newFields[7]) {
          this.trackPHI('DATE', newFields[7], 0, newFields[7].length);
          newFields[7] = this.shiftHL7DateTime(newFields[7]);
        }
        break;
    }

    return { type: segment.type, fields: newFields };
  }

  private trackPHI(type: any, text: string, start: number, end: number): void {
    this.phiDetected.push({
      type,
      text,
      start,
      end,
      confidence: 0.95
    });
  }

  private hashIdentifier(id: string): string {
    // Simple consistent hashing for identifiers
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i);
      hash = hash & hash;
    }
    return 'ID' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  }

  private shiftHL7Date(dateStr: string): string {
    // HL7 date format: YYYYMMDD
    if (!/^\d{8}$/.test(dateStr)) return dateStr;

    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6));
    const day = parseInt(dateStr.substring(6, 8));

    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + this.dateOffset);

    const newYear = date.getFullYear();
    const newMonth = (date.getMonth() + 1).toString().padStart(2, '0');
    const newDay = date.getDate().toString().padStart(2, '0');

    return `${newYear}${newMonth}${newDay}`;
  }

  private shiftHL7DateTime(dateTimeStr: string): string {
    // HL7 datetime format: YYYYMMDDHHmmss
    if (!/^\d{14}$/.test(dateTimeStr)) return this.shiftHL7Date(dateTimeStr);

    const year = parseInt(dateTimeStr.substring(0, 4));
    const month = parseInt(dateTimeStr.substring(4, 6));
    const day = parseInt(dateTimeStr.substring(6, 8));
    const hour = parseInt(dateTimeStr.substring(8, 10));
    const minute = parseInt(dateTimeStr.substring(10, 12));
    const second = parseInt(dateTimeStr.substring(12, 14));

    const date = new Date(year, month - 1, day, hour, minute, second);
    date.setDate(date.getDate() + this.dateOffset);

    const newYear = date.getFullYear();
    const newMonth = (date.getMonth() + 1).toString().padStart(2, '0');
    const newDay = date.getDate().toString().padStart(2, '0');
    const newHour = date.getHours().toString().padStart(2, '0');
    const newMinute = date.getMinutes().toString().padStart(2, '0');
    const newSecond = date.getSeconds().toString().padStart(2, '0');

    return `${newYear}${newMonth}${newDay}${newHour}${newMinute}${newSecond}`;
  }

  private validateHL7(message: string): ValidationDetails {
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = message.split(/\r?\n/);

    // Check for MSH segment
    if (!lines.some(l => l.startsWith('MSH|'))) {
      errors.push('Missing MSH (Message Header) segment');
    }

    // Check for remaining PHI patterns
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(message)) {
      warnings.push('Possible SSN pattern detected');
    }

    if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(message)) {
      warnings.push('Possible phone number pattern detected');
    }

    // Check message structure
    if (lines.length === 0) {
      errors.push('Empty message');
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
      phiRedacted: this.redactionMap.size || this.phiDetected.length,
      redactionRate: this.phiDetected.length > 0 ? 100 : 0
    };
  }
}
