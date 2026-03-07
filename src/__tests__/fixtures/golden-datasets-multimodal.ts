/**
 * Golden Datasets - Fixtures for Multimodal Testing
 * 
 * Datasets de referência para testes de todas as modalidades:
 * - Texto com PII realista (100 registros)
 * - DICOM/Imagem médica com PHI (50 registros simulados)
 * - Áudio com PII falada (25 registros)
 */

import * as crypto from 'crypto';

// PII Templates para geração realista
const PATIENT_NAMES = [
  'John Smith', 'Jane Doe', 'Robert Johnson', 'Maria Garcia', 'Michael Brown',
  'Jennifer Wilson', 'William Davis', 'Elizabeth Martinez', 'David Anderson', 'Sarah Taylor',
  'James Thomas', 'Linda Jackson', 'Richard White', 'Barbara Harris', 'Charles Martin',
  'Susan Thompson', 'Joseph Garcia', 'Jessica Robinson', 'Thomas Clark', 'Karen Rodriguez',
  'Daniel Lewis', 'Nancy Lee', 'Matthew Walker', 'Lisa Hall', 'Anthony Allen',
];

const DOCTORS = [
  'Dr. Sarah Johnson', 'Dr. Michael Chen', 'Dr. Emily Williams', 'Dr. David Brown',
  'Dr. Jennifer Davis', 'Dr. Robert Miller', 'Dr. Lisa Wilson', 'Dr. James Moore',
  'Dr. Maria Garcia', 'Dr. William Taylor',
];

const MEDICAL_NOTES = [
  'Patient presents with chest pain. History of hypertension.',
  'Follow-up visit for diabetes management. A1C levels improved.',
  'Annual physical examination. All vitals within normal limits.',
  'Post-operative check. Incision healing well.',
  'Emergency department visit for respiratory distress.',
  'Cardiology consultation. ECG shows normal sinus rhythm.',
  'Orthopedic follow-up. X-rays show proper bone healing.',
  'Neurology referral for recurring headaches.',
  'Dermatology examination. Suspicious mole removed for biopsy.',
  'Oncology consultation. Discussing treatment options.',
];

const MEDICATIONS = [
  'Metoprolol 50mg BID', 'Lisinopril 10mg daily', 'Atorvastatin 40mg daily',
  'Metformin 1000mg BID', 'Insulin glargine 20 units daily',
  'Amlodipine 5mg daily', 'Omeprazole 20mg daily', 'Aspirin 81mg daily',
  'Levothyroxine 75mcg daily', 'Albuterol inhaler PRN',
];

export interface GoldenTextRecord {
  id: string;
  text: string;
  metadata: {
    patientName: string;
    patientMrn: string;
    dateOfBirth: string;
    ssn: string;
    phone: string;
    email: string;
    address: string;
    provider: string;
    encounterDate: string;
    diagnosis: string[];
    medications: string[];
    pii: {
      patientName: string;
      patientMrn: string;
      dateOfBirth: string;
      ssn: string;
      phone: string;
      email: string;
      address: string;
    };
  };
}

export interface GoldenDicomRecord {
  id: string;
  patientId: string;
  patientName: string;
  mrn: string;
  dob: string;
  studyDate: string;
  modality: string;
  bodyPart: string;
  dimensions: [number, number, number];
  burnedInAnnotation: boolean;
  phiInPixels: string[]; // Texto que aparece na imagem
}

export interface GoldenAudioRecord {
  id: string;
  patientName: string;
  mrn: string;
  duration: number;
  transcript: string;
  piiSpoken: Array<{
    type: 'name' | 'ssn' | 'phone' | 'dob' | 'mrn' | 'address';
    text: string;
    timestamp: number;
  }>;
  metadata: {
    sampleRate: number;
    format: string;
    recordedBy: string;
    encounterDate: string;
  };
}

export interface GoldenDataset<T> {
  name: string;
  description: string;
  modality: 'text' | 'image' | 'audio';
  records: T[];
  statistics: {
    totalRecords: number;
    totalPiiInstances: number;
    piiByType: Record<string, number>;
  };
}

/**
 * Gera dataset de texto golden com PII realista
 */
export function getTextGoldenDataset(count: number = 100): GoldenDataset<GoldenTextRecord> {
  const records: GoldenTextRecord[] = [];
  let totalPii = 0;
  const piiByType: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    const patientName = PATIENT_NAMES[i % PATIENT_NAMES.length];
    const patientMrn = `MRN${String(i + 1).padStart(6, '0')}`;
    const dob = generateRandomDOB();
    const ssn = generateRandomSSN();
    const phone = generateRandomPhone();
    const email = generateRandomEmail(patientName);
    const address = generateRandomAddress();
    const provider = DOCTORS[i % DOCTORS.length];
    const note = MEDICAL_NOTES[i % MEDICAL_NOTES.length];
    const meds = [
      MEDICATIONS[i % MEDICATIONS.length],
      MEDICATIONS[(i + 1) % MEDICATIONS.length],
    ];
    const diagnoses = ['Hypertension', i % 2 === 0 ? 'Diabetes Type 2' : 'Hyperlipidemia'];

    const text = `Medical Record
Patient: ${patientName}
MRN: ${patientMrn}
DOB: ${dob}
SSN: ${ssn}
Phone: ${phone}
Email: ${email}
Address: ${address}
Provider: ${provider}
Date: ${new Date().toISOString().split('T')[0]}

Chief Complaint:
${note}

Active Medications:
${meds.join('\n')}

Diagnoses:
${diagnoses.join(', ')}

Patient consented to treatment. Next appointment scheduled.`;

    records.push({
      id: `TEXT_${String(i + 1).padStart(4, '0')}`,
      text,
      metadata: {
        patientName,
        patientMrn,
        dateOfBirth: dob,
        ssn,
        phone,
        email,
        address,
        provider,
        encounterDate: new Date().toISOString().split('T')[0],
        diagnosis: diagnoses,
        medications: meds,
        pii: {
          patientName,
          patientMrn,
          dateOfBirth: dob,
          ssn,
          phone,
          email,
          address,
        },
      },
    });

    // Conta PII
    totalPii += 7; // name, mrn, dob, ssn, phone, email, address
    piiByType['name'] = (piiByType['name'] || 0) + 1;
    piiByType['mrn'] = (piiByType['mrn'] || 0) + 1;
    piiByType['dob'] = (piiByType['dob'] || 0) + 1;
    piiByType['ssn'] = (piiByType['ssn'] || 0) + 1;
    piiByType['phone'] = (piiByType['phone'] || 0) + 1;
    piiByType['email'] = (piiByType['email'] || 0) + 1;
    piiByType['address'] = (piiByType['address'] || 0) + 1;
  }

  return {
    name: 'Golden Text Dataset with PII',
    description: `Dataset de ${count} registros textuais médicos com PII realista para testes de de-identification`,
    modality: 'text',
    records,
    statistics: {
      totalRecords: count,
      totalPiiInstances: totalPii,
      piiByType,
    },
  };
}

/**
 * Gera dataset DICOM golden com PHI burned-in
 */
export function getDicomGoldenDataset(count: number = 50): GoldenDataset<GoldenDicomRecord> {
  const records: GoldenDicomRecord[] = [];
  const modalities = ['CT', 'MR', 'XR', 'US', 'PT'];
  const bodyParts = ['CHEST', 'HEAD', 'ABDOMEN', 'PELVIS', 'EXTREMITY'];
  
  let totalPii = 0;
  const piiByType: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    const patientName = PATIENT_NAMES[i % PATIENT_NAMES.length];
    const mrn = `MRN${String(i + 1).padStart(6, '0')}`;
    const dob = generateRandomDOB();
    const modality = modalities[i % modalities.length];
    const bodyPart = bodyParts[i % bodyParts.length];
    
    // PHI que aparece nas imagens (burned-in)
    const phiInPixels = [
      patientName,
      `ID: ${mrn}`,
      `DOB: ${dob}`,
    ];

    records.push({
      id: `DICOM_${String(i + 1).padStart(4, '0')}`,
      patientId: `PID${String(i + 1).padStart(6, '0')}`,
      patientName,
      mrn,
      dob,
      studyDate: new Date().toISOString().split('T')[0],
      modality,
      bodyPart,
      dimensions: [512, 512, i % 3 + 1], // 1-3 slices
      burnedInAnnotation: true,
      phiInPixels,
    });

    totalPii += phiInPixels.length;
    piiByType['name'] = (piiByType['name'] || 0) + 1;
    piiByType['mrn'] = (piiByType['mrn'] || 0) + 1;
    piiByType['dob'] = (piiByType['dob'] || 0) + 1;
  }

  return {
    name: 'Golden DICOM Dataset with Burned-in PHI',
    description: `Dataset de ${count} imagens DICOM com PHI burned-in nas pixels para testes de OCR scrub`,
    modality: 'image',
    records,
    statistics: {
      totalRecords: count,
      totalPiiInstances: totalPii,
      piiByType,
    },
  };
}

/**
 * Gera dataset de áudio golden com PII falada
 */
export function getAudioGoldenDataset(count: number = 25): GoldenDataset<GoldenAudioRecord> {
  const records: GoldenAudioRecord[] = [];
  
  let totalPii = 0;
  const piiByType: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    const patientName = PATIENT_NAMES[i % PATIENT_NAMES.length];
    const mrn = `MRN${String(i + 1).padStart(6, '0')}`;
    const dob = generateRandomDOB();
    const ssn = generateRandomSSN();
    const phone = generateRandomPhone();
    const duration = 60 + Math.floor(Math.random() * 180); // 1-4 minutos
    
    const piiSpoken: GoldenAudioRecord['piiSpoken'] = [
      { type: 'name', text: patientName, timestamp: 2 },
      { type: 'mrn', text: mrn, timestamp: 8 },
      { type: 'dob', text: dob, timestamp: 15 },
      { type: 'ssn', text: ssn, timestamp: 25 },
      { type: 'phone', text: phone, timestamp: 35 },
    ];

    const transcript = `Patient consultation recording.
    
    At 2 seconds: My name is ${patientName}.
    At 8 seconds: My medical record number is ${mrn}.
    At 15 seconds: I was born on ${dob}.
    At 25 seconds: My social security number is ${ssn}.
    At 35 seconds: You can reach me at ${phone}.
    
    The patient describes symptoms and medical history.
    Provider recommends follow-up in two weeks.`;

    records.push({
      id: `AUDIO_${String(i + 1).padStart(4, '0')}`,
      patientName,
      mrn,
      duration,
      transcript,
      piiSpoken,
      metadata: {
        sampleRate: 16000,
        format: 'wav',
        recordedBy: DOCTORS[i % DOCTORS.length],
        encounterDate: new Date().toISOString().split('T')[0],
      },
    });

    piiSpoken.forEach(pii => {
      totalPii++;
      piiByType[pii.type] = (piiByType[pii.type] || 0) + 1;
    });
  }

  return {
    name: 'Golden Audio Dataset with Spoken PII',
    description: `Dataset de ${count} gravações de áudio médico com PII falada para testes de STT e bleep`,
    modality: 'audio',
    records,
    statistics: {
      totalRecords: count,
      totalPiiInstances: totalPii,
      piiByType,
    },
  };
}

// Helper functions
function generateRandomDOB(): string {
  const year = 1950 + Math.floor(Math.random() * 50);
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
}

function generateRandomSSN(): string {
  const part1 = String(Math.floor(Math.random() * 900) + 100);
  const part2 = String(Math.floor(Math.random() * 90) + 10);
  const part3 = String(Math.floor(Math.random() * 9000) + 1000);
  return `${part1}-${part2}-${part3}`;
}

function generateRandomPhone(): string {
  const area = String(Math.floor(Math.random() * 900) + 100);
  const prefix = String(Math.floor(Math.random() * 900) + 100);
  const line = String(Math.floor(Math.random() * 9000) + 1000);
  return `(${area}) ${prefix}-${line}`;
}

function generateRandomEmail(name: string): string {
  const cleanName = name.toLowerCase().replace(/\s+/g, '.');
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'email.com'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${cleanName}@${domain}`;
}

function generateRandomAddress(): string {
  const streets = ['Main St', 'Oak Ave', 'Maple Rd', 'Cedar Ln', 'Pine Dr'];
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
  const states = ['NY', 'CA', 'IL', 'TX', 'AZ'];
  
  const number = Math.floor(Math.random() * 9999) + 1;
  const street = streets[Math.floor(Math.random() * streets.length)];
  const city = cities[Math.floor(Math.random() * cities.length)];
  const state = states[Math.floor(Math.random() * states.length)];
  const zip = String(Math.floor(Math.random() * 90000) + 10000);
  
  return `${number} ${street}, ${city}, ${state} ${zip}`;
}

// Exportar tudo para testes
export const goldenDatasets = {
  getTextGoldenDataset,
  getDicomGoldenDataset,
  getAudioGoldenDataset,
};

export default goldenDatasets;
