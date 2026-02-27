import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { DatasetConfig } from './types';

const DATASETS: DatasetConfig[] = [
  {
    name: 'Synthea FHIR',
    type: 'fhir',
    url: 'https://synthetichealth.github.io/synthea-sample-data/downloads/latest/synthea_sample_data_fhir_latest.zip',
    downloadPath: './data/fhir/synthea',
    sampleSize: 100,
    description: 'Synthetic but realistic FHIR patient data from MITRE Synthea'
  },
  {
    name: 'MIMIC-CXR Reports',
    type: 'text',
    url: 'https://physionet.org/files/mimic-cxr/2.0.0/mimic-cxr-reports.zip',
    downloadPath: './data/text/mimic-cxr',
    sampleSize: 50,
    description: 'Chest X-ray radiology reports (requires PhysioNet credentialing)'
  }
];

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const writer = fs.createWriteStream(outputPath);
  
  console.log(`Downloading from ${url}...`);
  
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 300000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function createSampleDatasets(): Promise<void> {
  console.log('Creating sample datasets for testing...\n');

  const dataDir = path.join(__dirname, '../data');
  
  // Create directory structure
  ['dicom', 'fhir', 'text', 'audio'].forEach(type => {
    const dir = path.join(dataDir, type);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Create sample FHIR resources
  await createSampleFHIR(path.join(dataDir, 'fhir'));
  
  // Create sample text reports
  await createSampleText(path.join(dataDir, 'text'));
  
  // Create sample DICOM metadata (we'll use JSON representation)
  await createSampleDICOM(path.join(dataDir, 'dicom'));

  console.log('\n✅ Sample datasets created successfully!');
}

async function createSampleFHIR(outputDir: string): Promise<void> {
  console.log('Creating sample FHIR resources...');
  
  const patients = [
    {
      resourceType: 'Patient',
      id: 'patient-001',
      name: [{
        family: 'Smith',
        given: ['John', 'Michael']
      }],
      gender: 'male',
      birthDate: '1980-05-15',
      address: [{
        line: ['123 Main Street', 'Apt 4B'],
        city: 'Boston',
        state: 'MA',
        postalCode: '02101',
        country: 'USA'
      }],
      telecom: [{
        system: 'phone',
        value: '617-555-0123',
        use: 'home'
      }, {
        system: 'email',
        value: 'john.smith@example.com'
      }],
      identifier: [{
        system: 'http://hospital.org/mrn',
        value: 'MRN-123456'
      }, {
        system: 'http://hl7.org/fhir/sid/us-ssn',
        value: '123-45-6789'
      }]
    },
    {
      resourceType: 'Patient',
      id: 'patient-002',
      name: [{
        family: 'Johnson',
        given: ['Sarah', 'Elizabeth']
      }],
      gender: 'female',
      birthDate: '1975-12-03',
      address: [{
        line: ['456 Oak Avenue'],
        city: 'Cambridge',
        state: 'MA',
        postalCode: '02139',
        country: 'USA'
      }],
      telecom: [{
        system: 'phone',
        value: '617-555-0456',
        use: 'mobile'
      }],
      identifier: [{
        system: 'http://hospital.org/mrn',
        value: 'MRN-789012'
      }]
    },
    {
      resourceType: 'Patient',
      id: 'patient-003',
      name: [{
        family: 'Garcia',
        given: ['Maria', 'Carmen']
      }],
      gender: 'female',
      birthDate: '1992-08-22',
      address: [{
        line: ['789 Elm Street'],
        city: 'Somerville',
        state: 'MA',
        postalCode: '02144',
        country: 'USA'
      }],
      telecom: [{
        system: 'phone',
        value: '617-555-0789'
      }],
      identifier: [{
        system: 'http://hospital.org/mrn',
        value: 'MRN-345678'
      }]
    }
  ];

  const observations = [
    {
      resourceType: 'Observation',
      id: 'obs-001',
      status: 'final',
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '8867-4',
          display: 'Heart rate'
        }]
      },
      subject: {
        reference: 'Patient/patient-001'
      },
      effectiveDateTime: '2024-01-15T10:30:00Z',
      valueQuantity: {
        value: 72,
        unit: 'beats/minute',
        system: 'http://unitsofmeasure.org',
        code: '/min'
      },
      performer: [{
        reference: 'Practitioner/dr-jones',
        display: 'Dr. Robert Jones'
      }]
    }
  ];

  const encounters = [
    {
      resourceType: 'Encounter',
      id: 'enc-001',
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'IMP',
        display: 'inpatient encounter'
      },
      subject: {
        reference: 'Patient/patient-001'
      },
      period: {
        start: '2024-01-15T08:00:00Z',
        end: '2024-01-17T16:00:00Z'
      },
      location: [{
        location: {
          display: 'Massachusetts General Hospital, Room 301'
        }
      }],
      participant: [{
        individual: {
          reference: 'Practitioner/dr-jones',
          display: 'Dr. Robert Jones'
        }
      }]
    }
  ];

  // Write resources to files
  patients.forEach((patient, idx) => {
    fs.writeFileSync(
      path.join(outputDir, `patient-${idx + 1}.json`),
      JSON.stringify(patient, null, 2)
    );
  });

  observations.forEach((obs, idx) => {
    fs.writeFileSync(
      path.join(outputDir, `observation-${idx + 1}.json`),
      JSON.stringify(obs, null, 2)
    );
  });

  encounters.forEach((enc, idx) => {
    fs.writeFileSync(
      path.join(outputDir, `encounter-${idx + 1}.json`),
      JSON.stringify(enc, null, 2)
    );
  });

  console.log(`  ✓ Created ${patients.length} patients, ${observations.length} observations, ${encounters.length} encounters`);
}

async function createSampleText(outputDir: string): Promise<void> {
  console.log('Creating sample clinical text reports...');
  
  const reports = [
    {
      filename: 'radiology-report-001.txt',
      content: `RADIOLOGY REPORT

Patient: John Michael Smith
MRN: MRN-123456
DOB: 05/15/1980
Exam Date: January 15, 2024
Ordering Physician: Dr. Robert Jones

CLINICAL INDICATION:
Chest pain, rule out pneumonia

TECHNIQUE:
Frontal and lateral chest radiographs were obtained.

FINDINGS:
The heart size is normal. The lungs are clear without focal consolidation, 
pleural effusion, or pneumothorax. No acute bony abnormality is identified.

IMPRESSION:
No acute cardiopulmonary process.

Electronically signed by Dr. Emily Chen, MD
Date: 01/15/2024 14:30
Massachusetts General Hospital
Phone: 617-555-0100
`
    },
    {
      filename: 'radiology-report-002.txt',
      content: `RADIOLOGY REPORT

Patient: Sarah Elizabeth Johnson
MRN: MRN-789012
DOB: 12/03/1975
SSN: 987-65-4321
Exam Date: February 10, 2024
Ordering Physician: Dr. Michael Brown

CLINICAL INDICATION:
Follow-up CT scan for known lung nodule

TECHNIQUE:
CT chest without contrast

FINDINGS:
Previously identified 8mm nodule in the right upper lobe is stable in size
compared to prior exam from 08/15/2023. No new pulmonary nodules. No 
lymphadenopathy. Heart and great vessels are unremarkable.

IMPRESSION:
Stable right upper lobe pulmonary nodule. Recommend continued surveillance
in 6 months.

Dictated by Dr. James Wilson, MD on 02/10/2024 at 16:45
Transcribed by Mary Anderson
Cambridge Medical Center, 456 Oak Avenue, Cambridge, MA 02139
Contact: 617-555-0456
`
    },
    {
      filename: 'clinical-note-001.txt',
      content: `PROGRESS NOTE

Patient: Maria Carmen Garcia
MRN: MRN-345678
DOB: 08/22/1992
Visit Date: March 5, 2024
Provider: Dr. Lisa Martinez

CHIEF COMPLAINT:
Annual physical examination

HISTORY OF PRESENT ILLNESS:
31-year-old female presents for routine annual physical. Patient reports
feeling well overall. No current complaints. Last menstrual period was
02/28/2024. Patient is sexually active and uses oral contraceptives.

PAST MEDICAL HISTORY:
- Asthma (childhood, resolved)
- Appendectomy (2010)

MEDICATIONS:
- Ortho Tri-Cyclen (oral contraceptive)
- Multivitamin daily

ALLERGIES:
Penicillin (rash)

SOCIAL HISTORY:
Non-smoker, occasional alcohol use (1-2 drinks per week)
Works as software engineer
Lives at 789 Elm Street, Somerville, MA 02144
Emergency contact: Carlos Garcia (brother) 617-555-0999

PHYSICAL EXAMINATION:
Vital Signs: BP 118/72, HR 68, Temp 98.4°F, Wt 135 lbs
General: Well-appearing, no acute distress
HEENT: Normal
Cardiovascular: Regular rate and rhythm, no murmurs
Respiratory: Clear to auscultation bilaterally
Abdomen: Soft, non-tender

ASSESSMENT AND PLAN:
Healthy 31-year-old female. Continue current medications. Recommended
screening labs ordered. Follow up in 1 year or as needed.

Electronically signed: Dr. Lisa Martinez, MD
Somerville Family Practice
Date: 03/05/2024 11:30
`
    },
    {
      filename: 'discharge-summary-001.txt',
      content: `DISCHARGE SUMMARY

Patient Name: Robert James Williams
Medical Record Number: MRN-456789
Date of Birth: June 10, 1965
Social Security Number: 555-66-7777
Admission Date: April 1, 2024
Discharge Date: April 5, 2024
Attending Physician: Dr. Patricia Lee

ADMISSION DIAGNOSIS:
Acute myocardial infarction

DISCHARGE DIAGNOSIS:
ST-elevation myocardial infarction (STEMI), anterior wall

HOSPITAL COURSE:
58-year-old male presented to emergency department on 04/01/2024 at 02:30
with acute onset chest pain. EKG showed ST elevations in leads V1-V4.
Patient was taken emergently to cardiac catheterization lab where he
underwent successful PCI with drug-eluting stent placement to proximal LAD.

Post-procedure course was uncomplicated. Patient was monitored in CCU for
48 hours then transferred to telemetry floor. Cardiac enzymes trended down
appropriately. Echocardiogram showed LVEF 45% with anterior wall hypokinesis.

DISCHARGE MEDICATIONS:
- Aspirin 81mg daily
- Clopidogrel 75mg daily
- Atorvastatin 80mg daily
- Metoprolol 50mg twice daily
- Lisinopril 10mg daily

FOLLOW-UP:
Cardiology clinic in 2 weeks with Dr. Patricia Lee
Phone: 617-555-0200
Address: Boston Heart Center, 100 Medical Drive, Boston, MA 02115

Patient discharged home with wife on 04/05/2024 at 14:00.
Home address: 321 Pine Road, Brookline, MA 02445
Home phone: 617-555-0321

Electronically signed: Dr. Patricia Lee, MD
Date: 04/05/2024 15:30
`
    }
  ];

  reports.forEach(report => {
    fs.writeFileSync(
      path.join(outputDir, report.filename),
      report.content
    );
  });

  console.log(`  ✓ Created ${reports.length} clinical text reports`);
}

async function createSampleDICOM(outputDir: string): Promise<void> {
  console.log('Creating sample DICOM metadata (JSON format)...');
  
  const dicomSamples = [
    {
      filename: 'ct-chest-001.json',
      metadata: {
        '00080005': { vr: 'CS', Value: ['ISO_IR 100'] },
        '00080008': { vr: 'CS', Value: ['ORIGINAL', 'PRIMARY', 'AXIAL'] },
        '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.2'] },
        '00080018': { vr: 'UI', Value: ['1.2.840.113619.2.55.3.123456789.001'] },
        '00080020': { vr: 'DA', Value: ['20240115'] },
        '00080030': { vr: 'TM', Value: ['143000'] },
        '00080050': { vr: 'SH', Value: ['ACC123456'] },
        '00080090': { vr: 'PN', Value: [{ Alphabetic: 'Jones^Robert^Dr' }] },
        '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Smith^John^Michael' }] },
        '00100020': { vr: 'LO', Value: ['MRN-123456'] },
        '00100030': { vr: 'DA', Value: ['19800515'] },
        '00100040': { vr: 'CS', Value: ['M'] },
        '00101010': { vr: 'AS', Value: ['043Y'] },
        '00101030': { vr: 'DS', Value: ['75.5'] },
        '00200010': { vr: 'SH', Value: ['STUDY001'] },
        '00200011': { vr: 'IS', Value: ['1'] },
        '00200013': { vr: 'IS', Value: ['1'] },
        '00280010': { vr: 'US', Value: [512] },
        '00280011': { vr: 'US', Value: [512] },
        '00280030': { vr: 'DS', Value: ['0.625', '0.625'] },
        '00280100': { vr: 'US', Value: [16] },
        '00280101': { vr: 'US', Value: [16] },
        '00280102': { vr: 'US', Value: [15] },
        '00280103': { vr: 'US', Value: [0] },
        '00321060': { vr: 'LO', Value: ['Chest CT with contrast'] },
        '00400244': { vr: 'DA', Value: ['20240115'] },
        '00400245': { vr: 'TM', Value: ['143000'] }
      }
    },
    {
      filename: 'ct-brain-001.json',
      metadata: {
        '00080005': { vr: 'CS', Value: ['ISO_IR 100'] },
        '00080008': { vr: 'CS', Value: ['ORIGINAL', 'PRIMARY', 'AXIAL'] },
        '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.2'] },
        '00080018': { vr: 'UI', Value: ['1.2.840.113619.2.55.3.987654321.001'] },
        '00080020': { vr: 'DA', Value: ['20240210'] },
        '00080030': { vr: 'TM', Value: ['091500'] },
        '00080050': { vr: 'SH', Value: ['ACC789012'] },
        '00080090': { vr: 'PN', Value: [{ Alphabetic: 'Brown^Michael^Dr' }] },
        '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Johnson^Sarah^Elizabeth' }] },
        '00100020': { vr: 'LO', Value: ['MRN-789012'] },
        '00100030': { vr: 'DA', Value: ['19751203'] },
        '00100040': { vr: 'CS', Value: ['F'] },
        '00101010': { vr: 'AS', Value: ['048Y'] },
        '00200010': { vr: 'SH', Value: ['STUDY002'] },
        '00200011': { vr: 'IS', Value: ['2'] },
        '00200013': { vr: 'IS', Value: ['1'] },
        '00280010': { vr: 'US', Value: [512] },
        '00280011': { vr: 'US', Value: [512] },
        '00321060': { vr: 'LO', Value: ['Brain CT without contrast'] }
      }
    },
    {
      filename: 'mr-spine-001.json',
      metadata: {
        '00080005': { vr: 'CS', Value: ['ISO_IR 100'] },
        '00080008': { vr: 'CS', Value: ['ORIGINAL', 'PRIMARY'] },
        '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.4'] },
        '00080018': { vr: 'UI', Value: ['1.2.840.113619.2.55.3.456789123.001'] },
        '00080020': { vr: 'DA', Value: ['20240305'] },
        '00080030': { vr: 'TM', Value: ['103000'] },
        '00080050': { vr: 'SH', Value: ['ACC345678'] },
        '00080090': { vr: 'PN', Value: [{ Alphabetic: 'Martinez^Lisa^Dr' }] },
        '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Garcia^Maria^Carmen' }] },
        '00100020': { vr: 'LO', Value: ['MRN-345678'] },
        '00100030': { vr: 'DA', Value: ['19920822'] },
        '00100040': { vr: 'CS', Value: ['F'] },
        '00101010': { vr: 'AS', Value: ['031Y'] },
        '00101020': { vr: 'DS', Value: ['165'] },
        '00101030': { vr: 'DS', Value: ['61.2'] },
        '00200010': { vr: 'SH', Value: ['STUDY003'] },
        '00200011': { vr: 'IS', Value: ['1'] },
        '00200013': { vr: 'IS', Value: ['1'] },
        '00280010': { vr: 'US', Value: [512] },
        '00280011': { vr: 'US', Value: [512] },
        '00321060': { vr: 'LO', Value: ['MRI Lumbar Spine'] }
      }
    }
  ];

  dicomSamples.forEach(sample => {
    fs.writeFileSync(
      path.join(outputDir, sample.filename),
      JSON.stringify(sample.metadata, null, 2)
    );
  });

  console.log(`  ✓ Created ${dicomSamples.length} DICOM metadata samples`);
}

if (require.main === module) {
  createSampleDatasets().catch(console.error);
}

export { createSampleDatasets, DATASETS };
