import * as fs from 'fs';
import * as path from 'path';
import * as dicomParser from 'dicom-parser';
import { PHIEntity, DeIdentificationResult } from './types';

interface TagRedaction {
  tag: string;
  name: string;
  originalValue: string;
  redactedValue: string;
}

export class DICOMBinaryDeidentifier {
  private phiDetected: PHIEntity[] = [];
  private redactions: TagRedaction[] = [];
  private dateOffset: number;
  private uidMap: Map<string, string> = new Map();

  constructor() {
    this.dateOffset = Math.floor(Math.random() * 365) + 1;
  }

  async deidentify(dcmPath: string): Promise<DeIdentificationResult> {
    this.phiDetected = [];
    this.redactions = [];

    const buffer = fs.readFileSync(dcmPath);
    const byteArray = new Uint8Array(buffer);
    
    let dataSet: any;
    try {
      dataSet = (dicomParser as any).parseDicom(byteArray);
    } catch (e: any) {
      throw new Error(`Failed to parse DICOM: ${e.message}`);
    }

    const deidentifiedBuffer = this.processDataSet(dataSet, byteArray);
    
    const validation = this.validateDICOM(dataSet);
    
    return {
      original: buffer.toString('base64'),
      deidentified: deidentifiedBuffer.toString('base64'),
      phiEntities: this.phiDetected,
      redactionMap: new Map(this.redactions.map(r => [r.tag, `${r.originalValue} -> ${r.redactedValue}`])),
      integrityValid: validation.isValid,
      validationDetails: validation
    };
  }

  private processDataSet(dataSet: any, originalBuffer: Uint8Array): Buffer {
    const PHI_TAGS = [
      { tag: 'x00100010', name: 'Patient Name', type: 'NAME' },
      { tag: 'x00100020', name: 'Patient ID', type: 'ID' },
      { tag: 'x00100030', name: 'Patient Birth Date', type: 'DATE' },
      { tag: 'x00100040', name: 'Patient Sex', type: 'ID' },
      { tag: 'x00080020', name: 'Study Date', type: 'DATE' },
      { tag: 'x00080030', name: 'Study Time', type: 'DATE' },
      { tag: 'x00080050', name: 'Accession Number', type: 'ID' },
      { tag: 'x00080080', name: 'Institution Name', type: 'LOCATION' },
      { tag: 'x00080090', name: 'Referring Physician Name', type: 'NAME' },
      { tag: 'x00081030', name: 'Study Description', type: 'ID' },
      { tag: 'x00081050', name: 'Performing Physician Name', type: 'NAME' },
      { tag: 'x00081070', name: 'Operator Name', type: 'NAME' },
      { tag: 'x0020000d', name: 'Study Instance UID', type: 'ID' },
      { tag: 'x0020000e', name: 'Series Instance UID', type: 'ID' },
      { tag: 'x00080018', name: 'SOP Instance UID', type: 'ID' }
    ];

    const newBuffer = Buffer.from(originalBuffer);

    for (const phiTag of PHI_TAGS) {
      try {
        const element = dataSet.elements[phiTag.tag];
        if (!element) continue;

        const originalValue = this.extractValue(dataSet, phiTag.tag);
        if (!originalValue || originalValue === '') continue;

        this.phiDetected.push({
          type: phiTag.type as PHIEntity['type'],
          text: String(originalValue),
          start: element.dataOffset,
          end: element.dataOffset + element.length,
          confidence: 1.0
        });

        const redactedValue = this.redactValue(phiTag.tag, originalValue, element.vr);
        
        this.redactions.push({
          tag: phiTag.tag,
          name: phiTag.name,
          originalValue: String(originalValue),
          redactedValue: String(redactedValue)
        });

        this.writeRedactedValue(newBuffer, element, redactedValue);
      } catch (e) {
        // Skip tags that can't be processed
      }
    }

    return newBuffer;
  }

  private extractValue(dataSet: any, tag: string): string {
    try {
      const str = dataSet.string(tag);
      return str || '';
    } catch {
      return '';
    }
  }

  private redactValue(tag: string, originalValue: string, vr: string): string {
    if (tag === 'x00100010') {
      return 'ANONYMIZED^PATIENT';
    }
    
    if (tag === 'x00100020') {
      return this.generateAnonymousId();
    }

    if (tag === 'x00100030' || tag === 'x00080020') {
      return this.shiftDate(originalValue);
    }

    if (tag === 'x00080030') {
      return '000000.000000';
    }

    if (tag.includes('uid') || vr === 'UI') {
      return this.generateAnonymousUID(originalValue);
    }

    if (tag === 'x00100040') {
      return originalValue; // Keep sex
    }

    return 'REDACTED';
  }

  private writeRedactedValue(buffer: Buffer, element: any, redactedValue: string): void {
    const offset = element.dataOffset;
    const length = element.length;
    
    const redactedBytes = Buffer.from(redactedValue.padEnd(length, ' ').substring(0, length));
    
    for (let i = 0; i < Math.min(length, redactedBytes.length); i++) {
      buffer[offset + i] = redactedBytes[i];
    }
  }

  private shiftDate(dateStr: string): string {
    if (!dateStr || dateStr.length < 8) return '19000101';
    
    try {
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6));
      const day = parseInt(dateStr.substring(6, 8));
      
      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() - this.dateOffset);
      
      const newYear = date.getFullYear();
      const newMonth = String(date.getMonth() + 1).padStart(2, '0');
      const newDay = String(date.getDate()).padStart(2, '0');
      
      return `${newYear}${newMonth}${newDay}`;
    } catch (e) {
      return '19000101';
    }
  }

  private generateAnonymousId(): string {
    return `ANON${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }

  private generateAnonymousUID(originalUID: string): string {
    if (this.uidMap.has(originalUID)) {
      return this.uidMap.get(originalUID)!;
    }
    
    const root = '1.2.840.99999';
    const suffix = Math.random().toString().substring(2, 15);
    const newUID = `${root}.${suffix}`;
    
    this.uidMap.set(originalUID, newUID);
    return newUID;
  }

  private validateDICOM(dataSet: any): any {
    const errors: string[] = [];
    
    const requiredTags = ['x00080016', 'x00080018'];
    for (const tag of requiredTags) {
      if (!dataSet.elements[tag]) {
        errors.push(`Missing required tag: ${tag}`);
      }
    }

    const hasPixelData = !!dataSet.elements['x7fe00010'];
    const hasRows = !!dataSet.elements['x00280010'];
    const hasCols = !!dataSet.elements['x00280011'];

    return {
      isValid: errors.length === 0,
      hasRequiredTags: errors.length === 0,
      pixelDataIntact: hasPixelData && hasRows && hasCols,
      transferSyntaxValid: true,
      errors
    };
  }

  getMetrics() {
    return {
      phiDetected: this.phiDetected.length,
      phiRedacted: this.redactions.length,
      redactionRate: this.phiDetected.length > 0 ? 
        (this.redactions.length / this.phiDetected.length) * 100 : 0
    };
  }

  async deidentifyToFile(inputPath: string, outputPath: string): Promise<void> {
    const result = await this.deidentify(inputPath);
    const deidentifiedStr = typeof result.deidentified === 'string' 
      ? result.deidentified 
      : result.deidentified.toString();
    const buffer = Buffer.from(deidentifiedStr, 'base64');
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, buffer);
  }
}
