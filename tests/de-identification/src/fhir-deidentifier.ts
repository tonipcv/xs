import * as fs from 'fs';
import { FHIRValidation, PHIEntity, DeIdentificationResult } from './types';

interface FHIRResource {
  resourceType: string;
  id?: string;
  [key: string]: any;
}

const PHI_PATHS: Record<string, string> = {
  // Patient resource
  'Patient.name': 'NAME',
  'Patient.telecom': 'PHONE',
  'Patient.address': 'LOCATION',
  'Patient.birthDate': 'DATE',
  'Patient.identifier': 'ID',
  'Patient.contact.name': 'NAME',
  'Patient.contact.telecom': 'PHONE',
  'Patient.contact.address': 'LOCATION',
  
  // Practitioner resource
  'Practitioner.name': 'NAME',
  'Practitioner.telecom': 'PHONE',
  'Practitioner.address': 'LOCATION',
  'Practitioner.identifier': 'ID',
  
  // Organization resource
  'Organization.name': 'NAME',
  'Organization.telecom': 'PHONE',
  'Organization.address': 'LOCATION',
  'Organization.identifier': 'ID',
  
  // Common fields
  'performer.display': 'NAME',
  'participant.individual.display': 'NAME',
  'location.display': 'LOCATION',
  'subject.display': 'NAME',
  
  // Dates
  'effectiveDateTime': 'DATE',
  'period.start': 'DATE',
  'period.end': 'DATE',
  'authoredOn': 'DATE',
  'issued': 'DATE',
  'date': 'DATE'
};

export class FHIRDeidentifier {
  private phiDetected: PHIEntity[] = [];
  private redactionMap: Map<string, string> = new Map();
  private dateOffset: number;
  private idMap: Map<string, string> = new Map();

  constructor() {
    this.dateOffset = Math.floor(Math.random() * 365) + 1;
  }

  async deidentify(fhirJsonPath: string): Promise<DeIdentificationResult> {
    const originalContent = fs.readFileSync(fhirJsonPath, 'utf-8');
    const resource: FHIRResource = JSON.parse(originalContent);
    
    this.phiDetected = [];
    this.redactionMap = new Map();
    
    const deidentifiedResource = this.processResource(resource);
    
    const validation = this.validateFHIR(deidentifiedResource);
    
    return {
      original: originalContent,
      deidentified: JSON.stringify(deidentifiedResource, null, 2),
      phiEntities: this.phiDetected,
      redactionMap: this.redactionMap,
      integrityValid: validation.isValid,
      validationDetails: validation
    };
  }

  private processResource(resource: FHIRResource, path: string = ''): any {
    if (resource === null || resource === undefined) {
      return resource;
    }

    if (Array.isArray(resource)) {
      return resource.map((item, idx) => 
        this.processResource(item, `${path}[${idx}]`)
      );
    }

    if (typeof resource !== 'object') {
      return resource;
    }

    const result: any = {};
    const resourceType = resource.resourceType || '';
    
    for (const [key, value] of Object.entries(resource)) {
      const currentPath = path ? `${path}.${key}` : `${resourceType}.${key}`;
      
      if (this.isPHIField(currentPath, key)) {
        const phiType = this.getPhiType(currentPath, key);
        const redacted = this.redactValue(key, value, phiType);
        
        this.phiDetected.push({
          type: phiType,
          text: JSON.stringify(value),
          start: 0,
          end: 0,
          confidence: 1.0
        });
        
        this.redactionMap.set(currentPath, `${JSON.stringify(value)} -> ${JSON.stringify(redacted)}`);
        result[key] = redacted;
      } else if (typeof value === 'object') {
        result[key] = this.processResource(value, currentPath);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  private isPHIField(path: string, key: string): boolean {
    // Check exact path match
    if (PHI_PATHS[path]) {
      return true;
    }
    
    // Check partial path match
    for (const phiPath of Object.keys(PHI_PATHS)) {
      if (path.includes(phiPath)) {
        return true;
      }
    }
    
    // Check key-based patterns
    const phiKeywords = ['name', 'telecom', 'address', 'identifier', 'birthDate', 
                         'phone', 'email', 'ssn', 'mrn'];
    
    return phiKeywords.some(keyword => key.toLowerCase().includes(keyword));
  }

  private getPhiType(path: string, key: string): PHIEntity['type'] {
    for (const [phiPath, type] of Object.entries(PHI_PATHS)) {
      if (path.includes(phiPath)) {
        return type as PHIEntity['type'];
      }
    }
    
    const keyLower = key.toLowerCase();
    if (keyLower.includes('name')) return 'NAME';
    if (keyLower.includes('date') || keyLower.includes('time')) return 'DATE';
    if (keyLower.includes('phone') || keyLower.includes('telecom')) return 'PHONE';
    if (keyLower.includes('address') || keyLower.includes('location')) return 'LOCATION';
    if (keyLower.includes('email')) return 'EMAIL';
    if (keyLower.includes('ssn')) return 'SSN';
    if (keyLower.includes('mrn') || keyLower.includes('identifier')) return 'MRN';
    
    return 'ID';
  }

  private redactValue(key: string, value: any, phiType: PHIEntity['type']): any {
    if (value === null || value === undefined) {
      return value;
    }

    switch (phiType) {
      case 'NAME':
        if (Array.isArray(value)) {
          return value.map(v => this.redactName(v));
        }
        return this.redactName(value);
      
      case 'DATE':
        return this.shiftDate(value);
      
      case 'PHONE':
      case 'EMAIL':
        if (Array.isArray(value)) {
          return value.map(v => this.redactTelecom(v));
        }
        return this.redactTelecom(value);
      
      case 'LOCATION':
        if (Array.isArray(value)) {
          return value.map(v => this.redactAddress(v));
        }
        return this.redactAddress(value);
      
      case 'ID':
      case 'MRN':
      case 'SSN':
        if (Array.isArray(value)) {
          return value.map(v => this.redactIdentifier(v));
        }
        return this.redactIdentifier(value);
      
      default:
        return 'REDACTED';
    }
  }

  private redactName(name: any): any {
    if (typeof name === 'string') {
      return 'ANONYMIZED PATIENT';
    }
    
    if (typeof name === 'object') {
      return {
        ...name,
        family: 'ANONYMIZED',
        given: ['PATIENT'],
        text: 'ANONYMIZED PATIENT'
      };
    }
    
    return name;
  }

  private redactTelecom(telecom: any): any {
    if (typeof telecom === 'string') {
      return 'XXX-XXX-XXXX';
    }
    
    if (typeof telecom === 'object') {
      return {
        ...telecom,
        value: telecom.system === 'email' ? 'redacted@example.com' : 'XXX-XXX-XXXX'
      };
    }
    
    return telecom;
  }

  private redactAddress(address: any): any {
    if (typeof address === 'string') {
      return 'REDACTED';
    }
    
    if (typeof address === 'object') {
      return {
        ...address,
        line: ['REDACTED'],
        city: 'REDACTED',
        state: address.state, // Keep state for statistical purposes
        postalCode: address.postalCode ? address.postalCode.substring(0, 3) + 'XX' : 'XXXXX',
        text: 'REDACTED'
      };
    }
    
    return address;
  }

  private redactIdentifier(identifier: any): any {
    if (typeof identifier === 'string') {
      return this.generateAnonymousId();
    }
    
    if (typeof identifier === 'object') {
      const originalValue = identifier.value || '';
      const system = identifier.system || '';
      
      let anonId = this.idMap.get(originalValue);
      if (!anonId) {
        anonId = this.generateAnonymousId();
        this.idMap.set(originalValue, anonId);
      }
      
      return {
        ...identifier,
        value: anonId
      };
    }
    
    return identifier;
  }

  private shiftDate(dateValue: any): any {
    if (typeof dateValue !== 'string') {
      return dateValue;
    }
    
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return dateValue;
      }
      
      date.setDate(date.getDate() - this.dateOffset);
      
      // Preserve the original format
      if (dateValue.includes('T')) {
        return date.toISOString();
      } else {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
      return dateValue;
    }
  }

  private generateAnonymousId(): string {
    return `ANON-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }

  private validateFHIR(resource: FHIRResource): FHIRValidation {
    const errors: string[] = [];
    
    // Check required fields
    if (!resource.resourceType) {
      errors.push('Missing required field: resourceType');
    }
    
    // Validate resource type
    const validResourceTypes = [
      'Patient', 'Practitioner', 'Organization', 'Observation',
      'Encounter', 'Condition', 'Procedure', 'MedicationRequest',
      'DiagnosticReport', 'DocumentReference'
    ];
    
    if (resource.resourceType && !validResourceTypes.includes(resource.resourceType)) {
      errors.push(`Invalid resource type: ${resource.resourceType}`);
    }
    
    // Check for remaining PHI
    const resourceStr = JSON.stringify(resource).toLowerCase();
    const phiPatterns = [
      { pattern: /\d{3}-\d{2}-\d{4}/, name: 'SSN' },
      { pattern: /\d{3}-\d{3}-\d{4}/, name: 'Phone number' },
      { pattern: /[a-z0-9._%+-]+@(?!example\.com)[a-z0-9.-]+\.[a-z]{2,}/, name: 'Real email' }
    ];
    
    for (const { pattern, name } of phiPatterns) {
      if (pattern.test(resourceStr)) {
        errors.push(`Possible ${name} found in resource`);
      }
    }
    
    // Validate profile conformance (basic check)
    let profileConformance = true;
    if (resource.resourceType === 'Patient') {
      if (!resource.id && !resource.identifier) {
        errors.push('Patient must have either id or identifier');
        profileConformance = false;
      }
    }
    
    return {
      isValid: errors.length === 0,
      resourceType: resource.resourceType || 'Unknown',
      profileConformance,
      errors
    };
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
