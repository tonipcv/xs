/**
 * Tests for MultimodalPackager with REAL linked patient data
 * 
 * Testes reais para empacotamento multimodal de dados de pacientes.
 * Cria registros de texto, imagem e áudio e valida o empacotamento.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { 
  MultimodalPackager, 
  PatientRecord, 
  getMultimodalPackager, 
  resetMultimodalPackager 
} from '@/lib/preparation/deliver/multimodal-packager';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('MultimodalPackager - REAL Linked Patient Data', () => {
  let packager: MultimodalPackager;
  let tempDir: string;
  let testRecords: PatientRecord[] = [];

  beforeAll(async () => {
    tempDir = path.join('/tmp', 'multimodal-packager-test', Date.now().toString());
    
    // Cria estrutura de diretórios
    await fs.mkdir(path.join(tempDir, 'text'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'images'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'audio'), { recursive: true });

    // Cria arquivos de teste para Patient 1
    const patient1Id = 'PATIENT_001';
    const encounter1Id = 'ENC_001';
    
    // EHR record
    await fs.writeFile(
      path.join(tempDir, 'text', 'ehr_p1.json'),
      JSON.stringify({ patientId: patient1Id, mrn: 'MRN001', diagnosis: 'Hypertension' })
    );
    
    // Clinical note
    await fs.writeFile(
      path.join(tempDir, 'text', 'note_p1.txt'),
      'Patient John Doe presents with elevated blood pressure. MRN: MRN001'
    );
    
    // DICOM (simulado)
    await fs.writeFile(
      path.join(tempDir, 'images', 'ct_p1.dcm'),
      Buffer.alloc(256 * 256 * 2, 0)
    );
    
    // Audio
    await fs.writeFile(
      path.join(tempDir, 'audio', 'dictation_p1.wav'),
      'Patient John Doe follow-up visit. Medications: Lisinopril 10mg daily.'
    );

    // Cria arquivos para Patient 2
    const patient2Id = 'PATIENT_002';
    const encounter2Id = 'ENC_002';
    
    await fs.writeFile(
      path.join(tempDir, 'text', 'ehr_p2.json'),
      JSON.stringify({ patientId: patient2Id, mrn: 'MRN002', diagnosis: 'Diabetes' })
    );
    
    await fs.writeFile(
      path.join(tempDir, 'text', 'note_p2.txt'),
      'Patient Jane Smith diabetes check. MRN: MRN002'
    );

    // Cria registros de paciente
    testRecords = [
      {
        patientId: patient1Id,
        modality: 'structured',
        dataType: 'ehr',
        filePath: path.join(tempDir, 'text', 'ehr_p1.json'),
        metadata: { acquisitionDate: '2024-01-15', encounterId: encounter1Id },
        linkKeys: { patientMrn: 'MRN001', encounterId: encounter1Id },
      },
      {
        patientId: patient1Id,
        modality: 'text',
        dataType: 'note',
        filePath: path.join(tempDir, 'text', 'note_p1.txt'),
        metadata: { acquisitionDate: '2024-01-15', provider: 'Dr. Smith', encounterId: encounter1Id },
        linkKeys: { patientMrn: 'MRN001', encounterId: encounter1Id },
      },
      {
        patientId: patient1Id,
        modality: 'image',
        dataType: 'dicom',
        filePath: path.join(tempDir, 'images', 'ct_p1.dcm'),
        metadata: { acquisitionDate: '2024-01-15', modality: 'CT', bodyPart: 'CHEST', encounterId: encounter1Id },
        linkKeys: { patientMrn: 'MRN001', encounterId: encounter1Id },
      },
      {
        patientId: patient1Id,
        modality: 'audio',
        dataType: 'audio_note',
        filePath: path.join(tempDir, 'audio', 'dictation_p1.wav'),
        metadata: { acquisitionDate: '2024-01-15', provider: 'Dr. Smith', encounterId: encounter1Id, duration: 120 },
        linkKeys: { patientMrn: 'MRN001', encounterId: encounter1Id },
      },
      {
        patientId: patient2Id,
        modality: 'structured',
        dataType: 'ehr',
        filePath: path.join(tempDir, 'text', 'ehr_p2.json'),
        metadata: { acquisitionDate: '2024-01-16', encounterId: encounter2Id },
        linkKeys: { patientMrn: 'MRN002', encounterId: encounter2Id },
      },
      {
        patientId: patient2Id,
        modality: 'text',
        dataType: 'note',
        filePath: path.join(tempDir, 'text', 'note_p2.txt'),
        metadata: { acquisitionDate: '2024-01-16', provider: 'Dr. Johnson', encounterId: encounter2Id },
        linkKeys: { patientMrn: 'MRN002', encounterId: encounter2Id },
      },
    ];
  }, 60000);

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetMultimodalPackager();
    packager = getMultimodalPackager({
      packageBy: 'patient',
      includeText: true,
      includeImages: true,
      includeAudio: true,
      anonymize: true,
      compression: 'none',
    });
  });

  describe('Patient Packaging', () => {
    it('should package records by patient', async () => {
      const outputDir = path.join(tempDir, 'output');
      const result = await packager.packageByPatient(testRecords, outputDir);

      expect(result.success).toBe(true);
      expect(result.totalPatients).toBe(2);
      expect(result.totalRecords).toBe(testRecords.length);
      expect(result.packages.length).toBe(2);
    });

    it('should create separate directories for each patient', async () => {
      const outputDir = path.join(tempDir, 'output2');
      await packager.packageByPatient(testRecords, outputDir);

      // Verifica diretórios criados
      const p1Dir = path.join(outputDir, 'patient_PATIENT_001');
      const p2Dir = path.join(outputDir, 'patient_PATIENT_002');

      const p1Exists = await fs.access(p1Dir).then(() => true).catch(() => false);
      const p2Exists = await fs.access(p2Dir).then(() => true).catch(() => false);

      expect(p1Exists).toBe(true);
      expect(p2Exists).toBe(true);
    });

    it('should organize files by modality', async () => {
      const outputDir = path.join(tempDir, 'output3');
      await packager.packageByPatient(testRecords, outputDir);

      const p1Dir = path.join(outputDir, 'patient_PATIENT_001');
      
      // Verifica subdiretórios
      const textExists = await fs.access(path.join(p1Dir, 'text')).then(() => true).catch(() => false);
      const imagesExists = await fs.access(path.join(p1Dir, 'images')).then(() => true).catch(() => false);
      const audioExists = await fs.access(path.join(p1Dir, 'audio')).then(() => true).catch(() => false);

      expect(textExists).toBe(true);
      expect(imagesExists).toBe(true);
      expect(audioExists).toBe(true);
    });

    it('should track record counts correctly', async () => {
      const outputDir = path.join(tempDir, 'output4');
      const result = await packager.packageByPatient(testRecords, outputDir);

      const p1Package = result.packages.find(p => p.patientId === 'PATIENT_001');
      expect(p1Package).toBeDefined();
      expect(p1Package!.textCount).toBe(2); // EHR + note
      expect(p1Package!.imageCount).toBe(1); // CT
      expect(p1Package!.audioCount).toBe(1); // Audio
    });
  });

  describe('Manifest Generation', () => {
    it('should generate patient manifest', async () => {
      const outputDir = path.join(tempDir, 'output5');
      await packager.packageByPatient(testRecords, outputDir);

      const manifestPath = path.join(outputDir, 'patient_PATIENT_001', 'manifest.json');
      const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false);
      expect(manifestExists).toBe(true);

      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.recordCount).toBe(4);
      expect(manifest.modalities).toContain('text');
      expect(manifest.modalities).toContain('image');
      expect(manifest.modalities).toContain('audio');
    });

    it('should generate master manifest', async () => {
      const outputDir = path.join(tempDir, 'output6');
      await packager.packageByPatient(testRecords, outputDir);

      const masterManifestPath = path.join(outputDir, 'master_manifest.json');
      const exists = await fs.access(masterManifestPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const content = await fs.readFile(masterManifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      expect(manifest.totalPatients).toBe(2);
      expect(manifest.totalRecords).toBe(6);
      expect(manifest.patients.length).toBe(2);
    });

    it('should include link integrity in manifest', async () => {
      const outputDir = path.join(tempDir, 'output7');
      await packager.packageByPatient(testRecords, outputDir);

      const manifestPath = path.join(outputDir, 'patient_PATIENT_001', 'manifest.json');
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      expect(manifest.linkIntegrity).toBeDefined();
      expect(manifest.linkIntegrity.totalLinks).toBeGreaterThan(0);
      expect(manifest.linkIntegrity.validLinks).toBeGreaterThan(0);
    });
  });

  describe('Link Index Generation', () => {
    it('should generate link index for cross-references', async () => {
      const outputDir = path.join(tempDir, 'output8');
      await packager.packageByPatient(testRecords, outputDir);

      const linkIndexPath = path.join(outputDir, 'patient_PATIENT_001', 'link_index.json');
      const exists = await fs.access(linkIndexPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const content = await fs.readFile(linkIndexPath, 'utf-8');
      const index = JSON.parse(content);

      expect(Array.isArray(index)).toBe(true);
      expect(index.length).toBeGreaterThan(0);
    });
  });

  describe('README Generation', () => {
    it('should generate README for each patient', async () => {
      const outputDir = path.join(tempDir, 'output9');
      await packager.packageByPatient(testRecords, outputDir);

      const readmePath = path.join(outputDir, 'patient_PATIENT_001', 'README.md');
      const exists = await fs.access(readmePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const content = await fs.readFile(readmePath, 'utf-8');
      expect(content).toContain('Patient Package: PATIENT_001');
      expect(content).toContain('Text Records:');
      expect(content).toContain('Images:');
    });
  });

  describe('Configuration Options', () => {
    it('should respect includeText option', async () => {
      const noTextPackager = getMultimodalPackager({ includeText: false });
      const outputDir = path.join(tempDir, 'output10');
      
      await noTextPackager.packageByPatient(testRecords, outputDir);

      const textDir = path.join(outputDir, 'patient_PATIENT_001', 'text');
      const exists = await fs.access(textDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should respect includeImages option', async () => {
      const noImagesPackager = getMultimodalPackager({ includeImages: false });
      const outputDir = path.join(tempDir, 'output11');
      
      await noImagesPackager.packageByPatient(testRecords, outputDir);

      const imagesDir = path.join(outputDir, 'patient_PATIENT_001', 'images');
      const exists = await fs.access(imagesDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should respect anonymize option', async () => {
      const anonPackager = getMultimodalPackager({ anonymize: true });
      const outputDir = path.join(tempDir, 'output12');
      
      await anonPackager.packageByPatient(testRecords, outputDir);

      const readmePath = path.join(outputDir, 'patient_PATIENT_001', 'README.md');
      const content = await fs.readFile(readmePath, 'utf-8');
      
      expect(content).toContain('anonymized');
    });
  });

  describe('Size Tracking', () => {
    it('should calculate total size correctly', async () => {
      const outputDir = path.join(tempDir, 'output13');
      const result = await packager.packageByPatient(testRecords, outputDir);

      expect(result.totalSizeBytes).toBeGreaterThan(0);
      
      const p1Package = result.packages.find(p => p.patientId === 'PATIENT_001');
      expect(p1Package!.totalSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing files gracefully', async () => {
      const recordsWithMissingFile: PatientRecord[] = [
        {
          patientId: 'PATIENT_003',
          modality: 'text',
          dataType: 'note',
          filePath: '/non/existent/file.txt',
          metadata: {},
          linkKeys: {},
        },
      ];

      const outputDir = path.join(tempDir, 'output14');
      const result = await packager.packageByPatient(recordsWithMissingFile, outputDir);

      expect(result.success).toBe(true); // Continua mesmo com erro
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const p1 = getMultimodalPackager();
      const p2 = getMultimodalPackager();
      expect(p1).toBe(p2);
    });

    it('should create new instance after reset', () => {
      const p1 = getMultimodalPackager();
      resetMultimodalPackager();
      const p2 = getMultimodalPackager();
      expect(p1).not.toBe(p2);
    });
  });
});
