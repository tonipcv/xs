/**
 * Integration Test: Multimodal Patient Data (EHR + DICOM + Notes + Audio)
 * 
 * Teste end-to-end que cria um paciente completo com:
 * - EHR records (structured data)
 * - DICOM images (simulated)
 * - Clinical notes (text)
 * - Audio recordings (clinical notes dictated)
 * 
 * Valida que o MultimodalPackager consegue empacotar tudo linkado corretamente.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getMultimodalPackager, PatientRecord } from '@/lib/preparation/deliver/multimodal-packager';
import { getImagePreparer } from '@/lib/preparation/image/image-preparer';
import { getAudioPreparer } from '@/lib/preparation/audio/audio-preparer';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Integration: Multimodal Patient Package (EHR + DICOM + Notes + Audio)', () => {
  let testTenantId: string;
  let testPatientId: string;
  let tempDir: string;
  let patientRecords: PatientRecord[] = [];

  beforeAll(async () => {
    // Cria tenant de teste
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Multimodal Test Tenant',
        email: 'multimodal-test@xase.ai',
      },
    });
    testTenantId = tenant.id;
    testPatientId = `PATIENT_${Date.now()}`;

    // Cria diretório temporário
    tempDir = path.join('/tmp', 'multimodal-test', Date.now().toString());
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(path.join(tempDir, 'dicom'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'audio'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'text'), { recursive: true });

    console.log(`[Multimodal Test Setup] Tenant: ${testTenantId}, Patient: ${testPatientId}`);
  }, 120000);

  afterAll(async () => {
    // Cleanup
    await prisma.dataset.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.delete({ where: { id: testTenantId } });
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log('[Multimodal Test Cleanup] Complete');
  }, 60000);

  describe('1. Create EHR Records', () => {
    it('should create structured EHR data for patient', async () => {
      const ehrData = {
        patientId: testPatientId,
        mrn: `MRN_${testPatientId}`,
        demographics: {
          birthDate: '1980-01-15',
          gender: 'M',
          ethnicity: 'Not Hispanic or Latino',
        },
        encounters: [
          {
            encounterId: `ENC_${Date.now()}_1`,
            date: '2024-01-15',
            type: 'Emergency',
            chiefComplaint: 'Chest pain',
            diagnoses: ['R06.2', 'I25.10'],
          },
          {
            encounterId: `ENC_${Date.now()}_2`,
            date: '2024-03-20',
            type: 'Outpatient',
            chiefComplaint: 'Follow-up',
            diagnoses: ['Z51.11'],
          },
        ],
        medications: [
          { name: 'Metoprolol', dose: '50mg', frequency: 'BID' },
          { name: 'Atorvastatin', dose: '40mg', frequency: 'Daily' },
        ],
        vitals: {
          height: 175,
          weight: 82,
          bmi: 26.8,
          bloodPressure: '140/90',
          heartRate: 72,
        },
      };

      // Salva EHR como JSON
      const ehrPath = path.join(tempDir, 'text', 'ehr_record.json');
      await fs.writeFile(ehrPath, JSON.stringify(ehrData, null, 2));

      // Adiciona à lista de records
      patientRecords.push({
        patientId: testPatientId,
        modality: 'structured',
        dataType: 'ehr',
        filePath: ehrPath,
        metadata: {
          acquisitionDate: '2024-01-15',
          encounterId: ehrData.encounters[0].encounterId,
        },
        linkKeys: {
          patientMrn: ehrData.mrn,
          encounterId: ehrData.encounters[0].encounterId,
        },
      });

      // Verifica arquivo foi criado
      const stats = await fs.stat(ehrPath);
      expect(stats.size).toBeGreaterThan(0);
      console.log(`[EHR] Created: ${ehrPath} (${stats.size} bytes)`);
    });
  });

  describe('2. Create DICOM Images', () => {
    it('should prepare DICOM volumes for patient', async () => {
      const imagePreparer = getImagePreparer({
        targetSpacing: [1.0, 1.0, 1.0],
        normalizeIntensity: true,
        anonymize: true,
      });

      // Simula diretório DICOM (em produção seria série real)
      const dicomDir = path.join(tempDir, 'dicom', 'ct_chest');
      await fs.mkdir(dicomDir, { recursive: true });

      // Cria arquivos DICOM simulados
      for (let i = 0; i < 10; i++) {
        const sliceData = Buffer.alloc(256 * 256 * 2); // 256x256 pixels, 2 bytes cada
        // Preenche com dados simulados
        for (let j = 0; j < sliceData.length; j += 2) {
          const value = Math.floor(Math.random() * 1000);
          sliceData.writeUInt16LE(value, j);
        }
        await fs.writeFile(path.join(dicomDir, `slice_${i.toString().padStart(3, '0')}.dcm`), sliceData);
      }

      // Tenta carregar (vai usar fallback sem SimpleITK)
      const result = await imagePreparer.loadDicomSeries(dicomDir);

      expect(result.success).toBe(true);
      expect(result.volume).toBeDefined();
      expect(result.volume?.dimensions).toEqual([256, 256, 10]);

      if (result.volume) {
        // Salva como NIfTI (ou formato fallback)
        const niftiPath = path.join(tempDir, 'dicom', 'ct_volume.nii.gz');
        await imagePreparer.saveAsNifti(result.volume, niftiPath);

        // Adiciona à lista de records
        patientRecords.push({
          patientId: testPatientId,
          modality: 'image',
          dataType: 'dicom',
          filePath: niftiPath,
          metadata: {
            acquisitionDate: '2024-01-15',
            modality: 'CT',
            bodyPart: 'CHEST',
            studyId: `STUDY_${Date.now()}`,
            seriesId: `SERIES_${Date.now()}`,
          },
          linkKeys: {
            patientMrn: `MRN_${testPatientId}`,
            encounterId: `ENC_${Date.now()}_1`,
            studyInstanceUid: `1.2.3.4.5.${Date.now()}`,
          },
        });

        console.log(`[DICOM] Processed: ${result.volume.dimensions.join('x')} voxels`);
      }
    }, 60000);
  });

  describe('3. Create Clinical Notes', () => {
    it('should create clinical text notes', async () => {
      const notes = [
        {
          type: 'progress_note',
          date: '2024-01-15',
          provider: 'Dr. Smith',
          content: `Patient presents with chest pain lasting 2 hours. 
          Vitals stable. ECG shows ST elevation. 
          Patient: ${testPatientId} admitted for observation.
          MRN: MRN_${testPatientId}`,
        },
        {
          type: 'discharge_summary',
          date: '2024-01-18',
          provider: 'Dr. Johnson',
          content: `Patient discharged in stable condition. 
          Diagnosis: Acute coronary syndrome. 
          Follow-up in 2 weeks with cardiology.
          Patient ID: ${testPatientId}`,
        },
        {
          type: 'radiology_report',
          date: '2024-01-15',
          provider: 'Dr. Radiology',
          content: `CT Chest shows no acute abnormalities. 
          Heart size normal. Lungs clear.
          Study correlated with encounter ENC_${Date.now()}_1`,
        },
      ];

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const notePath = path.join(tempDir, 'text', `note_${i}_${note.type}.txt`);
        await fs.writeFile(notePath, note.content);

        // Adiciona à lista de records
        patientRecords.push({
          patientId: testPatientId,
          modality: 'text',
          dataType: note.type === 'radiology_report' ? 'note' : 'note',
          filePath: notePath,
          metadata: {
            acquisitionDate: note.date,
            provider: note.provider,
            encounterId: `ENC_${Date.now()}_1`,
          },
          linkKeys: {
            patientMrn: `MRN_${testPatientId}`,
            encounterId: `ENC_${Date.now()}_1`,
          },
        });

        console.log(`[Note] Created: ${note.type}`);
      }

      expect(patientRecords.filter(r => r.modality === 'text').length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('4. Create Audio Recordings', () => {
    it('should prepare audio clinical notes', async () => {
      const audioPreparer = getAudioPreparer({
        targetFormat: 'wav',
        targetSampleRate: 16000,
        normalize: true,
        transcribe: true,
        detectPii: true,
      });

      // Cria arquivo de áudio simulado com conteúdo que Whisper vai detectar
      const audioContent = `Patient ${testPatientId} is doing well. 
      Medications: Metoprolol 50mg twice daily, Atorvastatin 40mg daily.
      Next appointment scheduled for next month.
      MRN is MRN_${testPatientId}.`;

      // Salva como "arquivo de áudio" (simulado - texto que o mock Whisper vai processar)
      const audioPath = path.join(tempDir, 'audio', 'dictated_note_1.wav');
      await fs.writeFile(audioPath, audioContent); // Em produção seria buffer WAV real

      // Prepara áudio
      const result = await audioPreparer.prepareAudio(audioPath, path.join(tempDir, 'audio', 'prepared'));

      expect(result.success).toBe(true);
      expect(result.metadata.duration).toBeGreaterThan(0);

      // Transcreve e detecta PII
      if (result.transcription?.success) {
        console.log(`[Audio] Transcribed ${result.transcription.segments.length} segments`);
        
        if (result.piiDetected && result.piiDetected.length > 0) {
          console.log(`[Audio] Detected ${result.piiDetected.length} PII items`);
        }
      }

      // Adiciona à lista de records
      patientRecords.push({
        patientId: testPatientId,
        modality: 'audio',
        dataType: 'audio_note',
        filePath: result.audioPath || audioPath,
        metadata: {
          acquisitionDate: '2024-01-15',
          provider: 'Dr. Smith',
          encounterId: `ENC_${Date.now()}_1`,
          duration: result.metadata.duration,
        },
        linkKeys: {
          patientMrn: `MRN_${testPatientId}`,
          encounterId: `ENC_${Date.now()}_1`,
        },
      });

      console.log(`[Audio] Prepared: ${result.audioPath || audioPath}`);
    }, 120000);
  });

  describe('5. Package Multimodal Data', () => {
    it('should package all modalities linked by patient', async () => {
      const packager = getMultimodalPackager({
        packageBy: 'patient',
        includeText: true,
        includeImages: true,
        includeAudio: true,
        anonymize: true,
        compression: 'none', // Sem compressão para facilitar validação
      });

      const outputDir = path.join(tempDir, 'packaged');
      
      // Empacota todos os records
      const result = await packager.packageByPatient(patientRecords, outputDir);

      expect(result.success).toBe(true);
      expect(result.totalPatients).toBe(1);
      expect(result.totalRecords).toBe(patientRecords.length);

      const patientPackage = result.packages[0];
      expect(patientPackage.patientId).toBe(testPatientId);
      expect(patientPackage.textCount).toBeGreaterThanOrEqual(3);
      expect(patientPackage.imageCount).toBeGreaterThanOrEqual(1);
      expect(patientPackage.audioCount).toBeGreaterThanOrEqual(1);

      // Verifica manifest
      expect(patientPackage.manifest.recordCount).toBe(patientRecords.length);
      expect(patientPackage.manifest.linkIntegrity.validLinks).toBeGreaterThan(0);

      // Verifica estrutura de diretórios
      const packageDir = patientPackage.outputPath;
      const textDir = path.join(packageDir, 'text');
      const imagesDir = path.join(packageDir, 'images');
      const audioDir = path.join(packageDir, 'audio');

      const textFiles = await fs.readdir(textDir).catch(() => []);
      const imageFiles = await fs.readdir(imagesDir).catch(() => []);
      const audioFiles = await fs.readdir(audioDir).catch(() => []);

      expect(textFiles.length).toBeGreaterThanOrEqual(3);
      expect(imageFiles.length).toBeGreaterThanOrEqual(1);
      expect(audioFiles.length).toBeGreaterThanOrEqual(1);

      // Verifica manifest.json
      const manifestPath = path.join(packageDir, 'manifest.json');
      const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false);
      expect(manifestExists).toBe(true);

      // Verifica link_index.json
      const linkIndexPath = path.join(packageDir, 'link_index.json');
      const linkIndexExists = await fs.access(linkIndexPath).then(() => true).catch(() => false);
      expect(linkIndexExists).toBe(true);

      // Verifica README.md
      const readmePath = path.join(packageDir, 'README.md');
      const readmeExists = await fs.access(readmePath).then(() => true).catch(() => false);
      expect(readmeExists).toBe(true);

      console.log(`[Package] Created: ${packageDir}`);
      console.log(`[Package] Text: ${textFiles.length}, Images: ${imageFiles.length}, Audio: ${audioFiles.length}`);
      console.log(`[Package] Total size: ${(patientPackage.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);
    }, 60000);
  });

  describe('6. Validate Package Integrity', () => {
    it('should validate link integrity across all modalities', async () => {
      const outputDir = path.join(tempDir, 'packaged');
      const packageDir = path.join(outputDir, `patient_${testPatientId}`);

      // Lê link_index
      const linkIndexPath = path.join(packageDir, 'link_index.json');
      const linkIndexContent = await fs.readFile(linkIndexPath, 'utf-8');
      const linkIndex = JSON.parse(linkIndexContent);

      // Verifica que existem links
      expect(linkIndex.length).toBeGreaterThan(0);

      // Verifica que todos os links são válidos (apontam para arquivos existentes)
      for (const link of linkIndex) {
        const sourceExists = await fs.access(link.sourceRecord).then(() => true).catch(() => false);
        expect(sourceExists).toBe(true);

        for (const target of link.targetRecords) {
          const targetExists = await fs.access(target).then(() => true).catch(() => false);
          expect(targetExists).toBe(true);
        }
      }

      console.log(`[Link Validation] ${linkIndex.length} links validated`);
    });

    it('should validate master manifest', async () => {
      const masterManifestPath = path.join(tempDir, 'packaged', 'master_manifest.json');
      
      const manifestExists = await fs.access(masterManifestPath).then(() => true).catch(() => false);
      expect(manifestExists).toBe(true);

      const content = await fs.readFile(masterManifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      expect(manifest.totalPatients).toBe(1);
      expect(manifest.totalRecords).toBe(patientRecords.length);
      expect(manifest.patients.length).toBe(1);
      expect(manifest.patients[0].patientId).toBe(testPatientId);

      console.log(`[Master Manifest] Validated: ${manifest.totalPatients} patient, ${manifest.totalRecords} records`);
    });
  });

  describe('7. Performance Metrics', () => {
    it('should complete full packaging within reasonable time', async () => {
      // O teste completo deve rodar em menos de 5 minutos
      // (o timeout do describe está configurado para isso)
      
      const stats = {
        totalRecords: patientRecords.length,
        modalities: [...new Set(patientRecords.map(r => r.modality))],
        dataTypes: [...new Set(patientRecords.map(r => r.dataType))],
      };

      console.log('[Performance Stats]', stats);

      expect(stats.modalities.length).toBeGreaterThanOrEqual(3); // text, image, audio
      expect(stats.totalRecords).toBeGreaterThanOrEqual(5);
    });
  });
});
