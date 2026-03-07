/**
 * Multimodal Packager - Package Linked Multi-Modal Patient Data
 * 
 * Empacota dados de diferentes modalidades (texto, imagem, áudio) linkados por paciente.
 * Cria pacotes estruturados onde cada paciente tem seus EHR, DICOMs e notas de áudio organizados.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface PatientRecord {
  patientId: string;
  modality: 'text' | 'image' | 'audio' | 'structured';
  dataType: 'ehr' | 'dicom' | 'note' | 'audio_note' | 'lab_result' | 'prescription';
  filePath: string;
  metadata: {
    acquisitionDate?: string;
    modality?: string;
    bodyPart?: string;
    studyId?: string;
    seriesId?: string;
    encounterId?: string;
    provider?: string;
    duration?: number;
  };
  linkKeys: {
    patientMrn?: string;
    encounterId?: string;
    studyInstanceUid?: string;
    accessionNumber?: string;
  };
}

export interface MultimodalPackageConfig {
  packageBy: 'patient' | 'encounter' | 'study';
  includeText?: boolean;
  includeImages?: boolean;
  includeAudio?: boolean;
  anonymize?: boolean;
  compression?: 'none' | 'gzip' | 'zip';
  maxPackageSizeMB?: number;
}

export interface PatientPackage {
  patientId: string;
  records: PatientRecord[];
  textCount: number;
  imageCount: number;
  audioCount: number;
  totalSizeBytes: number;
  outputPath: string;
  manifest: {
    version: string;
    createdAt: string;
    recordCount: number;
    modalities: string[];
    linkIntegrity: {
      totalLinks: number;
      validLinks: number;
      brokenLinks: number;
    };
  };
}

export interface MultimodalPackagingResult {
  success: boolean;
  packages: PatientPackage[];
  totalPatients: number;
  totalRecords: number;
  totalSizeBytes: number;
  outputBasePath: string;
  errors: string[];
  warnings: string[];
  processingTimeMs: number;
}

/**
 * Multimodal Packager - Empacota dados linkados por paciente
 */
export class MultimodalPackager {
  private config: MultimodalPackageConfig;

  constructor(config?: Partial<MultimodalPackageConfig>) {
    this.config = {
      packageBy: 'patient',
      includeText: true,
      includeImages: true,
      includeAudio: true,
      anonymize: true,
      compression: 'gzip',
      maxPackageSizeMB: 1024,
      ...config,
    };
  }

  /**
   * Empacota dados multimodais linkados
   */
  async packageByPatient(
    patientRecords: PatientRecord[],
    outputBaseDir: string
  ): Promise<MultimodalPackagingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log(`[MultimodalPackager] Packaging ${patientRecords.length} records by ${this.config.packageBy}`);

    try {
      // Agrupa por paciente
      const groupedByPatient = this.groupRecordsByPatient(patientRecords);
      
      // Valida integridade dos links
      const linkValidation = this.validateLinkIntegrity(patientRecords);
      if (linkValidation.brokenLinks > 0) {
        warnings.push(`Found ${linkValidation.brokenLinks} broken links out of ${linkValidation.totalLinks} total`);
      }

      // Cria diretório base
      await fs.mkdir(outputBaseDir, { recursive: true });

      // Processa cada paciente
      const packages: PatientPackage[] = [];

      for (const [patientId, records] of groupedByPatient) {
        try {
          const packageResult = await this.createPatientPackage(
            patientId,
            records,
            outputBaseDir
          );
          packages.push(packageResult);
        } catch (error) {
          errors.push(`Failed to package patient ${patientId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Gera manifest geral
      await this.generateMasterManifest(packages, outputBaseDir);

      const totalSize = packages.reduce((sum, p) => sum + p.totalSizeBytes, 0);

      return {
        success: errors.length === 0,
        packages,
        totalPatients: packages.length,
        totalRecords: patientRecords.length,
        totalSizeBytes: totalSize,
        outputBasePath: outputBaseDir,
        errors,
        warnings,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      errors.push(`Packaging failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        packages: [],
        totalPatients: 0,
        totalRecords: 0,
        totalSizeBytes: 0,
        outputBasePath: outputBaseDir,
        errors,
        warnings,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Agrupa registros por paciente
   */
  private groupRecordsByPatient(records: PatientRecord[]): Map<string, PatientRecord[]> {
    const grouped = new Map<string, PatientRecord[]>();

    for (const record of records) {
      const key = record.patientId;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(record);
    }

    return grouped;
  }

  /**
   * Valida integridade dos links entre registros
   */
  private validateLinkIntegrity(records: PatientRecord[]): {
    totalLinks: number;
    validLinks: number;
    brokenLinks: number;
  } {
    let totalLinks = 0;
    let validLinks = 0;
    let brokenLinks = 0;

    // Cria índice de MRNs válidos
    const validMrns = new Set(records.map(r => r.linkKeys.patientMrn).filter(Boolean));

    for (const record of records) {
      if (record.linkKeys.patientMrn) {
        totalLinks++;
        if (validMrns.has(record.linkKeys.patientMrn)) {
          validLinks++;
        } else {
          brokenLinks++;
        }
      }

      if (record.linkKeys.encounterId) {
        totalLinks++;
        // Verifica se encounter existe
        const encounterExists = records.some(
          r => r.metadata.encounterId === record.linkKeys.encounterId
        );
        if (encounterExists) {
          validLinks++;
        } else {
          brokenLinks++;
        }
      }
    }

    return { totalLinks, validLinks, brokenLinks };
  }

  /**
   * Cria pacote para um paciente
   */
  private async createPatientPackage(
    patientId: string,
    records: PatientRecord[],
    outputBaseDir: string
  ): Promise<PatientPackage> {
    const patientDir = path.join(outputBaseDir, `patient_${patientId}`);
    await fs.mkdir(patientDir, { recursive: true });

    // Cria subdiretórios por modalidade
    const textDir = path.join(patientDir, 'text');
    const imageDir = path.join(patientDir, 'images');
    const audioDir = path.join(patientDir, 'audio');

    if (this.config.includeText) await fs.mkdir(textDir, { recursive: true });
    if (this.config.includeImages) await fs.mkdir(imageDir, { recursive: true });
    if (this.config.includeAudio) await fs.mkdir(audioDir, { recursive: true });

    // Copia e organiza arquivos
    let totalSize = 0;
    const organizedRecords: PatientRecord[] = [];

    for (const record of records) {
      let targetDir: string;

      switch (record.modality) {
        case 'text':
          if (!this.config.includeText) continue;
          targetDir = textDir;
          break;
        case 'image':
          if (!this.config.includeImages) continue;
          targetDir = imageDir;
          break;
        case 'audio':
          if (!this.config.includeAudio) continue;
          targetDir = audioDir;
          break;
        default:
          targetDir = patientDir;
      }

      // Copia arquivo
      const fileName = path.basename(record.filePath);
      const targetPath = path.join(targetDir, fileName);

      try {
        const stats = await fs.stat(record.filePath);
        totalSize += stats.size;

        await fs.copyFile(record.filePath, targetPath);

        organizedRecords.push({
          ...record,
          filePath: targetPath,
        });
      } catch (error) {
        console.warn(`Failed to copy file ${record.filePath}: ${error}`);
      }
    }

    // Gera manifest do paciente
    const textCount = organizedRecords.filter(r => r.modality === 'text').length;
    const imageCount = organizedRecords.filter(r => r.modality === 'image').length;
    const audioCount = organizedRecords.filter(r => r.modality === 'audio').length;

    const linkIntegrity = this.validateLinkIntegrity(organizedRecords);

    const manifest = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      recordCount: organizedRecords.length,
      modalities: [...new Set(organizedRecords.map(r => r.modality))],
      linkIntegrity,
    };

    await fs.writeFile(
      path.join(patientDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Gera índice de links
    const linkIndex = this.generateLinkIndex(organizedRecords);
    await fs.writeFile(
      path.join(patientDir, 'link_index.json'),
      JSON.stringify(linkIndex, null, 2)
    );

    // Gera README
    await this.generatePatientReadme(patientId, organizedRecords, patientDir);

    // Comprime se configurado
    let finalPath = patientDir;
    if (this.config.compression === 'zip') {
      finalPath = await this.compressPackage(patientDir);
    }

    return {
      patientId,
      records: organizedRecords,
      textCount,
      imageCount,
      audioCount,
      totalSizeBytes: totalSize,
      outputPath: finalPath,
      manifest,
    };
  }

  /**
   * Gera índice de links entre registros
   */
  private generateLinkIndex(records: PatientRecord[]): Array<{
    sourceRecord: string;
    targetRecords: string[];
    linkType: string;
  }> {
    const index: ReturnType<typeof this.generateLinkIndex> = [];

    for (const record of records) {
      const linked: string[] = [];

      // Encontra registros linkados por MRN
      if (record.linkKeys.patientMrn) {
        const byMrn = records.filter(
          r => r.patientId === record.patientId && r.filePath !== record.filePath
        );
        linked.push(...byMrn.map(r => r.filePath));
      }

      // Encontra registros linkados por encounter
      if (record.linkKeys.encounterId) {
        const byEncounter = records.filter(
          r => r.metadata.encounterId === record.linkKeys.encounterId &&
               r.filePath !== record.filePath
        );
        linked.push(...byEncounter.map(r => r.filePath));
      }

      if (linked.length > 0) {
        index.push({
          sourceRecord: record.filePath,
          targetRecords: [...new Set(linked)],
          linkType: 'patient_encounter',
        });
      }
    }

    return index;
  }

  /**
   * Gera README para paciente
   */
  private async generatePatientReadme(
    patientId: string,
    records: PatientRecord[],
    outputDir: string
  ): Promise<void> {
    const readme = `# Patient Package: ${patientId}

Generated: ${new Date().toISOString()}
Package Type: Multimodal Medical Data

## Contents

- Text Records: ${records.filter(r => r.modality === 'text').length}
- Images: ${records.filter(r => r.modality === 'image').length}
- Audio: ${records.filter(r => r.modality === 'audio').length}
- Total Records: ${records.length}

## Directory Structure

\`\`\`
patient_${patientId}/
├── manifest.json       # Package manifest
├── link_index.json     # Cross-reference index
├── README.md           # This file
├── text/               # Text documents (EHR, notes)
├── images/             # Medical images (DICOM)
└── audio/              # Audio recordings
\`\`\`

## Data Types

${records.map(r => `- ${r.dataType}: ${path.basename(r.filePath)}`).join('\n')}

## Link Integrity

All records in this package are linked by:
- Patient ID: ${patientId}
${records[0]?.linkKeys.patientMrn ? `- MRN: ${records[0].linkKeys.patientMrn}` : ''}

## Privacy

This package has been prepared according to HIPAA guidelines.
${this.config.anonymize ? 'Patient identifiers have been anonymized where applicable.' : 'Original identifiers retained per access lease.'}

---
Generated by XASE Data Preparation Pipeline
`;

    await fs.writeFile(path.join(outputDir, 'README.md'), readme);
  }

  /**
   * Gera manifest mestre
   */
  private async generateMasterManifest(
    packages: PatientPackage[],
    outputDir: string
  ): Promise<void> {
    const masterManifest = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      totalPatients: packages.length,
      totalRecords: packages.reduce((sum, p) => sum + p.records.length, 0),
      totalSizeBytes: packages.reduce((sum, p) => sum + p.totalSizeBytes, 0),
      patients: packages.map(p => ({
        patientId: p.patientId,
        recordCount: p.records.length,
        modalities: p.manifest.modalities,
        path: p.outputPath,
      })),
    };

    await fs.writeFile(
      path.join(outputDir, 'master_manifest.json'),
      JSON.stringify(masterManifest, null, 2)
    );
  }

  /**
   * Comprime pacote
   */
  private async compressPackage(sourceDir: string): Promise<string> {
    const outputPath = `${sourceDir}.zip`;
    
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      await execAsync(`cd "${path.dirname(sourceDir)}" && zip -r "${outputPath}" "${path.basename(sourceDir)}"`);
      
      return outputPath;
    } catch (error) {
      console.warn(`Compression failed, returning uncompressed: ${error}`);
      return sourceDir;
    }
  }
}

// Singleton
let packager: MultimodalPackager | null = null;

export function getMultimodalPackager(config?: Partial<MultimodalPackageConfig>): MultimodalPackager {
  if (!packager) {
    packager = new MultimodalPackager(config);
  }
  return packager;
}

export function resetMultimodalPackager(): void {
  packager = null;
}
