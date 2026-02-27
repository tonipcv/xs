import * as fs from 'fs';
import * as path from 'path';
import { DICOMValidation, PHIEntity, DeIdentificationResult } from './types';

interface DICOMTag {
  vr: string;
  Value: any[];
}

interface DICOMDataset {
  [tag: string]: DICOMTag;
}

const PHI_TAGS: Record<string, string> = {
  // Patient Identification
  '00100010': 'Patient Name',
  '00100020': 'Patient ID',
  '00100030': 'Patient Birth Date',
  '00100032': 'Patient Birth Time',
  '00100040': 'Patient Sex',
  '00101000': 'Other Patient IDs',
  '00101001': 'Other Patient Names',
  '00101005': 'Patient Birth Name',
  '00101040': 'Patient Address',
  '00101060': 'Patient Mother Birth Name',
  '00101090': 'Medical Record Locator',
  '00102160': 'Ethnic Group',
  '00102180': 'Occupation',
  '001021B0': 'Additional Patient History',
  '00104000': 'Patient Comments',
  
  // Study/Series Identification
  '00080014': 'Instance Creator UID',
  '00080050': 'Accession Number',
  '00080080': 'Institution Name',
  '00080081': 'Institution Address',
  '00080090': 'Referring Physician Name',
  '00080092': 'Referring Physician Address',
  '00080094': 'Referring Physician Telephone',
  '00080096': 'Referring Physician ID',
  '00081010': 'Station Name',
  '00081030': 'Study Description',
  '00081048': 'Physician of Record',
  '00081050': 'Performing Physician Name',
  '00081060': 'Name of Physician Reading Study',
  '00081070': 'Operator Name',
  '00081080': 'Admitting Diagnoses Description',
  '00081155': 'Referenced SOP Instance UID',
  
  // Dates and Times
  '00080020': 'Study Date',
  '00080021': 'Series Date',
  '00080022': 'Acquisition Date',
  '00080023': 'Content Date',
  '00080030': 'Study Time',
  '00080031': 'Series Time',
  '00080032': 'Acquisition Time',
  '00080033': 'Content Time',
  '0008002A': 'Acquisition DateTime',
  '00100021': 'Issuer of Patient ID',
  
  // Device/Location
  '00181000': 'Device Serial Number',
  '00181030': 'Protocol Name',
  '00400241': 'Performed Station AE Title',
  '00400242': 'Performed Station Name',
  '00400243': 'Performed Location',
  '00400244': 'Performed Procedure Step Start Date',
  '00400245': 'Performed Procedure Step Start Time',
  
  // Additional PHI
  '00321060': 'Requested Procedure Description',
  '00380010': 'Admission ID',
  '00380060': 'Service Episode ID',
  '00380500': 'Patient State',
  '00400006': 'Scheduled Performing Physician Name',
  '00400007': 'Scheduled Procedure Step Description',
  '00400009': 'Scheduled Procedure Step ID',
  '00400010': 'Scheduled Station Name',
  '00400011': 'Scheduled Procedure Step Location',
  '00400012': 'Pre-Medication',
  '0040A123': 'Person Name',
  '0040A730': 'Content Sequence'
};

const REQUIRED_TAGS = [
  '00080016', // SOP Class UID
  '00080018', // SOP Instance UID
  '00200010', // Study Instance UID
  '00200011', // Series Number
  '00200013', // Instance Number
  '00280010', // Rows
  '00280011'  // Columns
];

export class DICOMDeidentifier {
  private phiDetected: PHIEntity[] = [];
  private redactionMap: Map<string, string> = new Map();
  private uidMap: Map<string, string> = new Map();
  private dateOffset: number;

  constructor() {
    // Random date offset between -365 and -1 days
    this.dateOffset = Math.floor(Math.random() * 365) + 1;
  }

  async deidentify(dicomJsonPath: string): Promise<DeIdentificationResult> {
    const originalContent = fs.readFileSync(dicomJsonPath, 'utf-8');
    const dataset: DICOMDataset = JSON.parse(originalContent);
    
    this.phiDetected = [];
    this.redactionMap = new Map();
    
    const deidentifiedDataset = this.processDataset(dataset);
    
    const validation = this.validateDICOM(deidentifiedDataset);
    
    return {
      original: originalContent,
      deidentified: JSON.stringify(deidentifiedDataset, null, 2),
      phiEntities: this.phiDetected,
      redactionMap: this.redactionMap,
      integrityValid: validation.isValid,
      validationDetails: validation
    };
  }

  private processDataset(dataset: DICOMDataset): DICOMDataset {
    const deidentified: DICOMDataset = {};
    
    for (const [tag, element] of Object.entries(dataset)) {
      if (PHI_TAGS[tag]) {
        // This is a PHI tag - process it
        const phiType = this.getPhiType(tag);
        const originalValue = this.extractValue(element);
        
        this.phiDetected.push({
          type: phiType,
          text: String(originalValue),
          start: 0,
          end: 0,
          confidence: 1.0
        });
        
        const redactedElement = this.redactElement(tag, element);
        if (redactedElement) {
          deidentified[tag] = redactedElement;
          this.redactionMap.set(tag, `${originalValue} -> ${this.extractValue(redactedElement)}`);
        }
      } else {
        // Keep non-PHI tags as-is
        deidentified[tag] = element;
      }
    }
    
    return deidentified;
  }

  private getPhiType(tag: string): PHIEntity['type'] {
    const tagName = PHI_TAGS[tag].toLowerCase();
    
    if (tagName.includes('name')) return 'NAME';
    if (tagName.includes('date') || tagName.includes('time')) return 'DATE';
    if (tagName.includes('id') || tagName.includes('number')) return 'ID';
    if (tagName.includes('address') || tagName.includes('location')) return 'LOCATION';
    if (tagName.includes('phone') || tagName.includes('telephone')) return 'PHONE';
    
    return 'ID';
  }

  private extractValue(element: DICOMTag): any {
    if (!element.Value || element.Value.length === 0) return '';
    
    const value = element.Value[0];
    
    if (typeof value === 'object' && value.Alphabetic) {
      return value.Alphabetic;
    }
    
    return value;
  }

  private redactElement(tag: string, element: DICOMTag): DICOMTag | null {
    const vr = element.vr;
    
    // Handle different VR types
    switch (vr) {
      case 'PN': // Person Name
        return {
          vr: 'PN',
          Value: [{ Alphabetic: 'ANONYMIZED^PATIENT' }]
        };
      
      case 'LO': // Long String
      case 'SH': // Short String
      case 'ST': // Short Text
      case 'LT': // Long Text
        if (tag === '00100020') { // Patient ID
          return {
            vr,
            Value: [this.generateAnonymousId()]
          };
        }
        return {
          vr,
          Value: ['REDACTED']
        };
      
      case 'DA': // Date
        return {
          vr: 'DA',
          Value: [this.shiftDate(element.Value[0])]
        };
      
      case 'TM': // Time
        return {
          vr: 'TM',
          Value: ['000000']
        };
      
      case 'DT': // DateTime
        return {
          vr: 'DT',
          Value: [this.shiftDateTime(element.Value[0])]
        };
      
      case 'UI': // UID
        return {
          vr: 'UI',
          Value: [this.generateAnonymousUID(element.Value[0])]
        };
      
      case 'AS': // Age String
        // Keep age but round to nearest 5 years for privacy
        const age = parseInt(element.Value[0]);
        const roundedAge = Math.round(age / 5) * 5;
        return {
          vr: 'AS',
          Value: [`${String(roundedAge).padStart(3, '0')}Y`]
        };
      
      case 'CS': // Code String
      case 'DS': // Decimal String
      case 'IS': // Integer String
      case 'US': // Unsigned Short
        // Keep these as they're typically not PHI
        return element;
      
      default:
        // For unknown types, redact to be safe
        return null;
    }
  }

  private shiftDate(dateStr: string): string {
    if (!dateStr || dateStr.length !== 8) return '19000101';
    
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

  private shiftDateTime(dtStr: string): string {
    if (!dtStr) return '19000101000000';
    
    const datepart = dtStr.substring(0, 8);
    const timepart = dtStr.substring(8) || '000000';
    
    return this.shiftDate(datepart) + timepart;
  }

  private generateAnonymousId(): string {
    return `ANON-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }

  private generateAnonymousUID(originalUID: string): string {
    if (this.uidMap.has(originalUID)) {
      return this.uidMap.get(originalUID)!;
    }
    
    // Generate a new UID with proper format
    const root = '1.2.840.99999'; // Anonymous root
    const suffix = Math.random().toString().substring(2, 15);
    const newUID = `${root}.${suffix}`;
    
    this.uidMap.set(originalUID, newUID);
    return newUID;
  }

  private validateDICOM(dataset: DICOMDataset): DICOMValidation {
    const errors: string[] = [];
    let hasRequiredTags = true;
    
    // Check for required tags
    for (const tag of REQUIRED_TAGS) {
      if (!dataset[tag]) {
        errors.push(`Missing required tag: ${tag}`);
        hasRequiredTags = false;
      }
    }
    
    // Check that PHI tags are properly redacted
    let phiFound = false;
    for (const tag of Object.keys(PHI_TAGS)) {
      if (dataset[tag]) {
        const value = this.extractValue(dataset[tag]);
        const valueStr = String(value).toLowerCase();
        
        // Check if value looks like it contains PHI
        if (this.looksLikePHI(valueStr)) {
          errors.push(`Possible PHI not redacted in tag ${tag}: ${value}`);
          phiFound = true;
        }
      }
    }
    
    // Validate image dimensions if present
    let pixelDataIntact = true;
    if (dataset['00280010'] && dataset['00280011']) {
      const rows = dataset['00280010'].Value[0];
      const cols = dataset['00280011'].Value[0];
      
      if (rows <= 0 || cols <= 0) {
        errors.push('Invalid image dimensions');
        pixelDataIntact = false;
      }
    }
    
    // Validate transfer syntax
    let transferSyntaxValid = true;
    if (dataset['00020010']) {
      const ts = dataset['00020010'].Value[0];
      if (!ts || ts.length === 0) {
        errors.push('Invalid transfer syntax');
        transferSyntaxValid = false;
      }
    }
    
    return {
      isValid: errors.length === 0,
      hasRequiredTags,
      pixelDataIntact,
      transferSyntaxValid,
      errors
    };
  }

  private looksLikePHI(value: string): boolean {
    // Check for patterns that look like PHI
    const patterns = [
      /\d{3}-\d{2}-\d{4}/, // SSN
      /\d{3}-\d{3}-\d{4}/, // Phone
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/, // Names (not ANONYMIZED)
      /\d+\s+[A-Z][a-z]+\s+(Street|Ave|Road|Dr|Lane|Blvd)/, // Addresses
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/ // Email
    ];
    
    // Exclude known safe values
    if (value.includes('anonymized') || value.includes('redacted') || value === 'anon') {
      return false;
    }
    
    return patterns.some(pattern => pattern.test(value));
  }

  getMetrics() {
    return {
      phiDetected: this.phiDetected.length,
      phiRedacted: this.redactionMap.size,
      redactionRate: this.redactionMap.size > 0 ? 
        (this.redactionMap.size / this.phiDetected.length) * 100 : 0
    };
  }
}
