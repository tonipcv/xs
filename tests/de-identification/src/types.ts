export interface TestResult {
  testName: string;
  dataType: 'dicom' | 'fhir' | 'text' | 'audio';
  timestamp: Date;
  filesProcessed: number;
  filesValid: number;
  filesInvalid: number;
  phiDetected: number;
  phiRedacted: number;
  falsePositives: number;
  processingTimeMs: number;
  memoryUsageMB: number;
  errors: Array<{
    file: string;
    error: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  edgeCases: Array<{
    case: string;
    detected: boolean;
    redacted: boolean;
  }>;
}

export interface DICOMValidation {
  isValid: boolean;
  hasRequiredTags: boolean;
  pixelDataIntact: boolean;
  transferSyntaxValid: boolean;
  errors: string[];
}

export interface FHIRValidation {
  isValid: boolean;
  resourceType: string;
  profileConformance: boolean;
  errors: string[];
}

export interface PHIEntity {
  type: 'NAME' | 'DATE' | 'ID' | 'LOCATION' | 'PHONE' | 'EMAIL' | 'SSN' | 'MRN' | 'ADDRESS';
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface ValidationDetails {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  hasRequiredTags?: boolean;
  pixelDataIntact?: boolean;
  transferSyntaxValid?: boolean;
  resourceType?: string;
  profileConformance?: boolean;
}

export interface DeIdentificationResult {
  original: string | Buffer;
  deidentified: string | Buffer;
  phiEntities: PHIEntity[];
  redactionMap: Map<string, string>;
  integrityValid: boolean;
  validationDetails: DICOMValidation | FHIRValidation | ValidationDetails | any;
}

export type DeidentificationResult = DeIdentificationResult;

export interface DatasetConfig {
  name: string;
  type: 'dicom' | 'fhir' | 'text' | 'audio';
  url: string;
  downloadPath: string;
  sampleSize: number;
  description: string;
}
