/**
 * Golden Datasets / Fixtures
 * 
 * Dados sintéticos de alta qualidade para testes de integração.
 * Cada dataset representa um cenário realista de dados médicos/healthcare.
 */

export interface GoldenDataset {
  name: string;
  description: string;
  modality: 'text' | 'dicom' | 'audio';
  records: any[];
  expectedPiiCount: number;
  expectedQualityScore: number;
}

// Texto com PII médico realista (100 records)
export const TEXT_WITH_PII_100: GoldenDataset = {
  name: 'text_medical_records_100',
  description: '100 registros médicos sintéticos com PII realista para testes',
  modality: 'text',
  expectedPiiCount: 245,
  expectedQualityScore: 0.85,
  records: [
    // Record 1-10: Clinical notes with various PII
    {
      id: 'rec-001',
      patient_name: 'John Michael Smith',
      dob: '1985-03-15',
      ssn: '123-45-6789',
      mrn: 'MRN-2024-001',
      phone: '(555) 123-4567',
      email: 'john.smith@email.com',
      address: '123 Main St, Boston, MA 02101',
      note: `Patient John Michael Smith (DOB: 03/15/1985, SSN: ***-**-****) presented 
             with chest pain. MRN: MRN-2024-001. Contact: (555) 123-4567. 
             Address on file: 123 Main St, Boston, MA. Email: john.smith@email.com.
             Insurance: Aetna Policy #AET-987654321.`,
      diagnosis: 'Acute myocardial infarction',
      date: '2024-01-15',
      provider: 'Dr. Sarah Johnson',
      provider_npi: '1234567890',
    },
    {
      id: 'rec-002',
      patient_name: 'Emily Grace Rodriguez',
      dob: '1992-07-22',
      ssn: '987-65-4321',
      mrn: 'MRN-2024-002',
      phone: '(555) 987-6543',
      email: 'emily.r.rodriguez@healthmail.org',
      address: '456 Oak Avenue, Suite 200, Chicago, IL 60601',
      note: `Emily Grace Rodriguez, born 07/22/1992, visited for prenatal care. 
             SSN ***-**-**** on file. Phone (555) 987-6543. MRN: MRN-2024-002.
             Lives at 456 Oak Avenue, Chicago. Email: emily.r.rodriguez@healthmail.org
             Employer: Google Inc. Work phone: (650) 555-0100`,
      diagnosis: 'Normal pregnancy, first trimester',
      date: '2024-01-16',
      provider: 'Dr. Maria Gonzalez',
      provider_npi: '0987654321',
    },
    {
      id: 'rec-003',
      patient_name: 'Robert "Bob" Williams Jr.',
      dob: '1968-11-03',
      ssn: '456-78-9012',
      mrn: 'MRN-2024-003',
      phone: '(555) 234-5678',
      email: 'bob.williams@company.net',
      address: '789 Pine Road, Apartment 5B, Seattle, WA 98101',
      note: `Robert Williams Jr. (aka Bob) DOB: 11/03/1968. SSN protected. 
             MRN-2024-003. Address: 789 Pine Road, Apt 5B, Seattle WA.
             Contact: bob.williams@company.net or (555) 234-5678.
             Medicare #: 1234-5678-9012-A. Emergency contact: Jane Williams (wife) (555) 999-8888`,
      diagnosis: 'Type 2 diabetes mellitus with complications',
      date: '2024-01-17',
      provider: 'Dr. David Chen',
      provider_npi: '1122334455',
    },
    // Records 4-10: More diverse PII patterns
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `rec-${String(i + 4).padStart(3, '0')}`,
      patient_name: generateName(i + 4),
      dob: generateDOB(25 + i * 5),
      ssn: generateSSN(i + 4),
      mrn: `MRN-2024-${String(i + 4).padStart(3, '0')}`,
      phone: generatePhone(i + 4),
      email: generateEmail(i + 4),
      address: generateAddress(i + 4),
      note: generateMedicalNote(i + 4),
      diagnosis: generateDiagnosis(i + 4),
      date: generateDate(i + 4),
      provider: generateProvider(i + 4),
      provider_npi: generateNPI(i + 4),
    })),
    // Records 11-30: Diverse medical specialties
    ...Array.from({ length: 20 }, (_, i) => generateMedicalRecord(i + 11)),
    // Records 31-60: Various document types
    ...Array.from({ length: 30 }, (_, i) => generateDocumentRecord(i + 31)),
    // Records 61-100: Mixed quality for testing quality gate
    ...Array.from({ length: 40 }, (_, i) => generateMixedQualityRecord(i + 61)),
  ],
};

// DICOM metadata com PHI burned-in references
export const DICOM_WITH_PHI_50: GoldenDataset = {
  name: 'dicom_images_phi_50',
  description: '50 registros DICOM com metadados PHI e referências a burned-in text',
  modality: 'dicom',
  expectedPiiCount: 150,
  expectedQualityScore: 0.90,
  records: Array.from({ length: 50 }, (_, i) => ({
    id: `dcm-${String(i + 1).padStart(3, '0')}`,
    patientId: generatePatientID(i),
    patientName: generateName(i),
    patientBirthDate: generateDOB(30 + i * 2),
    patientSex: i % 2 === 0 ? 'M' : 'F',
    studyInstanceUid: generateStudyUID(i),
    seriesInstanceUid: generateSeriesUID(i),
    sopInstanceUid: generateSOPUID(i),
    studyDate: generateDate(i),
    studyTime: '14:30:00',
    studyDescription: generateStudyDescription(i),
    seriesDescription: generateSeriesDescription(i),
    modality: ['CT', 'MR', 'XR', 'US', 'PT'][i % 5],
    institutionName: generateInstitution(i),
    referringPhysicianName: generateProvider(i),
    performingPhysicianName: generateProvider(i + 100),
    operatorName: generateName(i + 200),
    burnedInAnnotation: i % 3 === 0 ? 'YES' : 'NO',
    burnedInText: i % 3 === 0 ? generateBurnedInText(i) : null,
    imageType: 'ORIGINAL\\PRIMARY\\AXIAL',
    rows: 512,
    columns: 512,
    bitsAllocated: 16,
    pixelSpacing: [0.5, 0.5],
    sliceThickness: 1.0,
    numberOfFrames: 1,
    // Simulated pixel data reference
    pixelDataRef: `pixel_data_${i}.raw`,
    hasPhiInPixels: i % 3 === 0,
  })),
};

// Áudio com PII falada
export const AUDIO_WITH_PII_25: GoldenDataset = {
  name: 'audio_clinical_notes_25',
  description: '25 transcrições de áudio clínico com PII falada para testes de STT+scrub',
  modality: 'audio',
  expectedPiiCount: 75,
  expectedQualityScore: 0.75,
  records: Array.from({ length: 25 }, (_, i) => ({
    id: `aud-${String(i + 1).padStart(3, '0')}`,
    audioFile: `clinical_note_${i + 1}.wav`,
    duration: 120 + i * 10,
    sampleRate: 16000,
    channels: 1,
    format: 'wav',
    // Transcription with timestamps and PII
    transcription: {
      segments: generateAudioSegments(i),
      fullText: generateAudioTranscription(i),
    },
    speakerDiarization: [
      { speaker: 'DOC', start: 0, end: 45 },
      { speaker: 'PAT', start: 46, end: 90 },
      { speaker: 'DOC', start: 91, end: 130 },
    ],
    // PII markers for validation
    piiMarkers: generatePiiMarkers(i),
    // Quality metrics
    snr: 15 + i * 0.5,
    confidence: 0.85 + i * 0.01,
  })),
};

// Helper functions for data generation
function generateName(seed: number): string {
  const firstNames = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth',
    'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
  return `${firstNames[seed % firstNames.length]} ${lastNames[(seed * 3) % lastNames.length]}`;
}

function generateDOB(age: number): string {
  const year = new Date().getFullYear() - age;
  const month = String((age % 12) + 1).padStart(2, '0');
  const day = String((age % 28) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateSSN(seed: number): string {
  return `${String(100 + seed).slice(-3)}-${String(10 + seed * 2).slice(-2)}-${String(1000 + seed * 7).slice(-4)}`;
}

function generatePhone(seed: number): string {
  return `(555) ${String(100 + seed * 3).slice(-3)}-${String(1000 + seed * 7).slice(-4)}`;
}

function generateEmail(seed: number): string {
  const domains = ['gmail.com', 'yahoo.com', 'healthmail.org', 'hospital.net', 'email.com'];
  return `patient${seed}@${domains[seed % domains.length]}`;
}

function generateAddress(seed: number): string {
  const streets = ['Main St', 'Oak Ave', 'Park Rd', 'Lake Dr', 'Hill St', 'River Rd', 'Maple Ave', 'Center St'];
  const cities = ['Boston', 'Chicago', 'Seattle', 'Denver', 'Atlanta', 'Phoenix', 'Dallas', 'Miami'];
  const states = ['MA', 'IL', 'WA', 'CO', 'GA', 'AZ', 'TX', 'FL'];
  return `${100 + seed} ${streets[seed % streets.length]}, ${cities[seed % cities.length]}, ${states[seed % states.length]} ${10000 + seed}`;
}

function generateMedicalNote(seed: number): string {
  const templates = [
    `Patient presents with symptoms of {condition}. Medical record number {mrn}. Contact at {phone}.`,
    `Follow-up visit for {condition}. Patient reached at {email}. DOB: {dob}. SSN on file.`,
    `Emergency department visit. Patient {name} admitted. Address: {address}. Insurance ID: {insurance}.`,
  ];
  return templates[seed % templates.length];
}

function generateDiagnosis(seed: number): string {
  const diagnoses = [
    'Hypertension, essential',
    'Acute upper respiratory infection',
    'Low back pain',
    'Type 2 diabetes without complications',
    'Anxiety disorder, unspecified',
    'Gastroesophageal reflux disease',
    'Hyperlipidemia, unspecified',
    'Osteoarthritis, knee',
    'Chronic obstructive pulmonary disease',
    'Major depressive disorder, recurrent',
  ];
  return diagnoses[seed % diagnoses.length];
}

function generateDate(seed: number): string {
  const date = new Date('2024-01-01');
  date.setDate(date.getDate() + seed);
  return date.toISOString().split('T')[0];
}

function generateProvider(seed: number): string {
  const prefixes = ['Dr.', 'Dr.', 'Dr.', 'PA', 'NP'];
  return `${prefixes[seed % prefixes.length]} ${generateName(seed + 50)}`;
}

function generateNPI(seed: number): string {
  return String(1000000000 + seed * 12345).slice(0, 10);
}

function generateMedicalRecord(seed: number) {
  return {
    id: `rec-${String(seed).padStart(3, '0')}`,
    patient_name: generateName(seed),
    dob: generateDOB(30 + (seed % 40)),
    mrn: `MRN-2024-${String(seed).padStart(3, '0')}`,
    note: `Clinical visit for ${generateDiagnosis(seed)}. Patient ${generateName(seed)}.`,
    diagnosis: generateDiagnosis(seed),
    date: generateDate(seed),
    provider: generateProvider(seed),
    department: ['Cardiology', 'Oncology', 'Neurology', 'Orthopedics', 'Pediatrics'][seed % 5],
    encounterType: ['Inpatient', 'Outpatient', 'Emergency', 'Telehealth'][seed % 4],
  };
}

function generateDocumentRecord(seed: number) {
  const docTypes = ['Discharge Summary', 'Progress Note', 'Consultation', 'Operative Report', 'Pathology'];
  return {
    id: `doc-${String(seed).padStart(3, '0')}`,
    documentType: docTypes[seed % docTypes.length],
    patient_name: generateName(seed),
    mrn: `MRN-2024-${String(seed).padStart(3, '0')}`,
    dob: generateDOB(25 + (seed % 50)),
    content: generateDocumentContent(seed, docTypes[seed % docTypes.length]),
    date: generateDate(seed),
    author: generateProvider(seed),
    status: ['Final', 'Preliminary', 'Amended'][seed % 3],
  };
}

function generateDocumentContent(seed: number, docType: string): string {
  const base = `Patient: ${generateName(seed)}. MRN: MRN-2024-${String(seed).padStart(3, '0')}. `;
  switch (docType) {
    case 'Discharge Summary':
      return base + `Admitted for ${generateDiagnosis(seed)}. Course uncomplicated. Discharged in stable condition.`;
    case 'Operative Report':
      return base + `Procedure performed successfully. No intraoperative complications.`;
    default:
      return base + `Evaluation for ${generateDiagnosis(seed)}.`;
  }
}

function generateMixedQualityRecord(seed: number) {
  const quality = seed % 4; // 0=high, 1=medium, 2=low, 3=garbage
  const base = {
    id: `mix-${String(seed).padStart(3, '0')}`,
    patient_name: generateName(seed),
    mrn: `MRN-2024-${String(seed).padStart(3, '0')}`,
    date: generateDate(seed),
  };
  
  switch (quality) {
    case 0: // High quality
      return { ...base, note: generateMedicalNote(seed), quality: 'high' };
    case 1: // Medium - missing some fields
      return { ...base, note: generateMedicalNote(seed), dob: undefined, quality: 'medium' };
    case 2: // Low - minimal content
      return { ...base, note: 'N/A', quality: 'low' };
    case 3: // Garbage
      return { ...base, note: '###!!!???123', patient_name: 'XXXX', quality: 'garbage' };
    default:
      return base;
  }
}

// DICOM helpers
function generatePatientID(seed: number): string {
  return `P${String(100000 + seed).slice(-6)}`;
}

function generateStudyUID(seed: number): string {
  return `1.2.840.113619.2.55.3.604688119.${seed}.1.20240101.1`;
}

function generateSeriesUID(seed: number): string {
  return `1.2.840.113619.2.55.3.604688119.${seed}.2.20240101.1`;
}

function generateSOPUID(seed: number): string {
  return `1.2.840.113619.2.55.3.604688119.${seed}.3.20240101.${seed}`;
}

function generateStudyDescription(seed: number): string {
  const studies = ['Chest X-Ray', 'Head CT', 'Brain MRI', 'Abdomen CT', 'Pelvis MRI'];
  return studies[seed % studies.length];
}

function generateSeriesDescription(seed: number): string {
  return `Series ${(seed % 10) + 1} - Axial`;
}

function generateInstitution(seed: number): string {
  const institutions = [
    'General Hospital',
    'University Medical Center',
    'Memorial Hospital',
    'St. Mary\'s Medical',
    'Children\'s Hospital',
  ];
  return institutions[seed % institutions.length];
}

function generateBurnedInText(seed: number): string {
  return `Patient: ${generateName(seed)} DOB: ${generateDOB(30 + seed)} ID: ${generatePatientID(seed)}`;
}

// Audio helpers
function generateAudioSegments(seed: number): Array<{start: number; end: number; text: string; speaker: string}> {
  return [
    { start: 0, end: 15, text: `Patient ${generateName(seed)} is here for follow-up.`, speaker: 'DOC' },
    { start: 16, end: 30, text: `Yes, I'm here for my appointment.`, speaker: 'PAT' },
    { start: 31, end: 45, text: `Can you confirm your date of birth?`, speaker: 'DOC' },
    { start: 46, end: 60, text: `It's ${generateDOB(30 + seed)}. My SSN ends in ${String(1000 + seed).slice(-4)}.`, speaker: 'PAT' },
    { start: 61, end: 75, text: `Thank you. Your MRN is MRN-2024-${String(seed).padStart(3, '0')}.`, speaker: 'DOC' },
  ];
}

function generateAudioTranscription(seed: number): string {
  return `Doctor: Patient ${generateName(seed)} is here for follow-up. 
Patient: Yes, I'm here for my appointment.
Doctor: Can you confirm your date of birth?
Patient: It's ${generateDOB(30 + seed)}. My SSN ends in ${String(1000 + seed).slice(-4)}.
Doctor: Thank you. Your MRN is MRN-2024-${String(seed).padStart(3, '0')}.`;
}

function generatePiiMarkers(seed: number): Array<{type: string; value: string; start: number; end: number}> {
  return [
    { type: 'NAME', value: generateName(seed), start: 12, end: 25 },
    { type: 'DOB', value: generateDOB(30 + seed), start: 180, end: 190 },
    { type: 'SSN_PARTIAL', value: `***-**-${String(1000 + seed).slice(-4)}`, start: 210, end: 220 },
    { type: 'MRN', value: `MRN-2024-${String(seed).padStart(3, '0')}`, start: 240, end: 255 },
  ];
}

// Export all golden datasets
export const GOLDEN_DATASETS = {
  TEXT_WITH_PII_100,
  DICOM_WITH_PHI_50,
  AUDIO_WITH_PII_25,
};

// Export individual records for unit tests
export const GOLDEN_RECORDS = {
  text: TEXT_WITH_PII_100.records,
  dicom: DICOM_WITH_PHI_50.records,
  audio: AUDIO_WITH_PII_25.records,
};

// Utilities for test setup
export function getGoldenDataset(name: keyof typeof GOLDEN_DATASETS): GoldenDataset {
  return GOLDEN_DATASETS[name];
}

export function getGoldenRecord(modality: 'text' | 'dicom' | 'audio', index: number): any {
  switch (modality) {
    case 'text': return TEXT_WITH_PII_100.records[index % TEXT_WITH_PII_100.records.length];
    case 'dicom': return DICOM_WITH_PHI_50.records[index % DICOM_WITH_PHI_50.records.length];
    case 'audio': return AUDIO_WITH_PII_25.records[index % AUDIO_WITH_PII_25.records.length];
    default: return null;
  }
}

export function generateGoldenDatasetSubset(
  name: keyof typeof GOLDEN_DATASETS,
  count: number,
  offset: number = 0
): any[] {
  const dataset = GOLDEN_DATASETS[name];
  return dataset.records.slice(offset, offset + count);
}
