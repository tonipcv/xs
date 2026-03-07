/**
 * Manifest Validator
 * 
 * Valida consistência entre manifest.json, checksums.txt e README.md
 * Garante integridade do pacote de entrega.
 */

import { createHash } from 'crypto';
// Logger simples se não existir módulo
const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
};

export interface ManifestFile {
  path: string;
  size: number;
  checksum: string;
  checksumAlgorithm: 'sha256';
  records?: number;
  format?: string;
  compression?: string;
}

export interface DeliveryManifest {
  version: string;
  createdAt: string;
  datasetId: string;
  tenantId: string;
  jobId: string;
  task: string;
  modality: string;
  format: string;
  runtime: string;
  
  files: ManifestFile[];
  
  statistics: {
    totalFiles: number;
    totalSizeBytes: number;
    totalRecords: number;
    averageRecordSizeBytes: number;
  };
  
  checksums: {
    algorithm: string;
    manifestChecksum: string;
    files: Record<string, string>;
  };
  
  metadata?: {
    schema?: object;
    sampleRecord?: object;
    dataQuality?: object;
  };
}

export interface ChecksumEntry {
  file: string;
  hash: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifestValid: boolean;
  checksumsValid: boolean;
  readmeValid: boolean;
  consistencyValid: boolean;
}

export class ManifestValidator {
  /**
   * Valida manifest.json completo
   */
  validateManifest(manifest: unknown): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      manifestValid: true,
      checksumsValid: true,
      readmeValid: true,
      consistencyValid: true,
    };

    // Verifica estrutura básica
    if (!manifest || typeof manifest !== 'object') {
      result.errors.push('Manifest must be an object');
      result.valid = false;
      result.manifestValid = false;
      return result;
    }

    const m = manifest as DeliveryManifest;

    // Campos obrigatórios
    const requiredFields = [
      'version', 'createdAt', 'datasetId', 'tenantId', 'jobId',
      'task', 'modality', 'format', 'runtime', 'files', 'statistics', 'checksums'
    ];

    for (const field of requiredFields) {
      if (!(field in m)) {
        result.errors.push(`Missing required field: ${field}`);
        result.manifestValid = false;
      }
    }

    // Valida version
    if (m.version && !/^\d+\.\d+$/.test(m.version)) {
      result.errors.push(`Invalid version format: ${m.version} (expected X.Y)`);
      result.manifestValid = false;
    }

    // Valida createdAt
    if (m.createdAt) {
      const date = new Date(m.createdAt);
      if (isNaN(date.getTime())) {
        result.errors.push(`Invalid createdAt: ${m.createdAt}`);
        result.manifestValid = false;
      }
    }

    // Valida files array
    if (Array.isArray(m.files)) {
      if (m.files.length === 0) {
        result.warnings.push('No files in manifest');
      }

      for (let i = 0; i < m.files.length; i++) {
        const file = m.files[i];
        const fileValidation = this.validateFileEntry(file, i);
        result.errors.push(...fileValidation.errors);
        result.warnings.push(...fileValidation.warnings);
        if (!fileValidation.valid) {
          result.manifestValid = false;
        }
      }
    } else {
      result.errors.push('files must be an array');
      result.manifestValid = false;
    }

    // Valida statistics
    if (m.statistics) {
      if (typeof m.statistics.totalFiles !== 'number' || m.statistics.totalFiles < 0) {
        result.errors.push('Invalid statistics.totalFiles');
        result.manifestValid = false;
      }
      if (typeof m.statistics.totalSizeBytes !== 'number' || m.statistics.totalSizeBytes < 0) {
        result.errors.push('Invalid statistics.totalSizeBytes');
        result.manifestValid = false;
      }
    }

    // Valida checksums
    if (m.checksums) {
      if (m.checksums.algorithm !== 'sha256') {
        result.warnings.push(`Checksum algorithm ${m.checksums.algorithm} not standard (expected sha256)`);
      }

      if (!m.checksums.manifestChecksum) {
        result.errors.push('Missing manifestChecksum');
        result.manifestValid = false;
      }

      if (!m.checksums.files || typeof m.checksums.files !== 'object') {
        result.errors.push('Missing or invalid checksums.files');
        result.manifestValid = false;
      }
    }

    // Verifica consistência entre arquivos e checksums
    if (m.files && m.checksums?.files) {
      const filePaths = m.files.map(f => f.path);
      const checksumPaths = Object.keys(m.checksums.files);

      // Arquivos sem checksum
      for (const path of filePaths) {
        if (!checksumPaths.includes(path)) {
          result.errors.push(`File ${path} missing in checksums`);
          result.consistencyValid = false;
        }
      }

      // Checksums para arquivos que não existem
      for (const path of checksumPaths) {
        if (!filePaths.includes(path)) {
          result.warnings.push(`Checksum exists for non-existent file: ${path}`);
        }
      }
    }

    // Valida consistência statistics
    if (m.files && m.statistics) {
      const actualFiles = m.files.length;
      if (actualFiles !== m.statistics.totalFiles) {
        result.errors.push(`File count mismatch: files=${actualFiles}, statistics.totalFiles=${m.statistics.totalFiles}`);
        result.consistencyValid = false;
      }

      const actualSize = m.files.reduce((sum, f) => sum + (f.size || 0), 0);
      if (Math.abs(actualSize - m.statistics.totalSizeBytes) > 1) {
        result.errors.push(`Size mismatch: calculated=${actualSize}, statistics.totalSizeBytes=${m.statistics.totalSizeBytes}`);
        result.consistencyValid = false;
      }
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  /**
   * Valida entrada individual de arquivo
   */
  private validateFileEntry(file: ManifestFile, index: number): { 
    valid: boolean; 
    errors: string[]; 
    warnings: string[] 
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!file.path) {
      errors.push(`File ${index}: missing path`);
    }

    if (typeof file.size !== 'number' || file.size < 0) {
      errors.push(`File ${index} (${file.path}): invalid size`);
    }

    if (!file.checksum) {
      errors.push(`File ${index} (${file.path}): missing checksum`);
    } else if (!/^[a-f0-9]{64}$/i.test(file.checksum)) {
      errors.push(`File ${index} (${file.path}): invalid SHA256 checksum format`);
    }

    if (file.checksumAlgorithm && file.checksumAlgorithm !== 'sha256') {
      warnings.push(`File ${index} (${file.path}): non-standard checksum algorithm ${file.checksumAlgorithm}`);
    }

    if (file.records !== undefined && (typeof file.records !== 'number' || file.records < 0)) {
      warnings.push(`File ${index} (${file.path}): invalid records count`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Parse e valida checksums.txt
   */
  parseChecksums(content: string): ChecksumEntry[] {
    const entries: ChecksumEntry[] = [];
    const lines = content.trim().split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Formato: <hash>  <filename> (formato Unix standard)
      const match = trimmed.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
      if (match) {
        entries.push({
          file: match[2],
          hash: match[1].toLowerCase(),
        });
      }
    }

    return entries;
  }

  /**
   * Valida checksums.txt contra manifest
   */
  validateChecksums(
    checksumsContent: string,
    manifest: DeliveryManifest
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      manifestValid: true,
      checksumsValid: true,
      readmeValid: true,
      consistencyValid: true,
    };

    const entries = this.parseChecksums(checksumsContent);

    if (entries.length === 0) {
      result.errors.push('No valid checksum entries found');
      result.checksumsValid = false;
      result.valid = false;
      return result;
    }

    // Cria mapa de checksums do manifest
    const manifestChecksums = new Map<string, string>();
    if (manifest.checksums?.files) {
      for (const [path, hash] of Object.entries(manifest.checksums.files)) {
        manifestChecksums.set(path, hash.toLowerCase());
      }
    }

    // Compara checksums
    for (const entry of entries) {
      const manifestHash = manifestChecksums.get(entry.file);
      
      if (!manifestHash) {
        result.errors.push(`File ${entry.file} in checksums.txt but not in manifest`);
        result.consistencyValid = false;
      } else if (manifestHash !== entry.hash) {
        result.errors.push(`Checksum mismatch for ${entry.file}: manifest=${manifestHash}, checksums.txt=${entry.hash}`);
        result.consistencyValid = false;
      }
    }

    // Verifica arquivos no manifest que não estão em checksums.txt
    for (const file of manifest.files || []) {
      const found = entries.some(e => e.file === file.path);
      if (!found) {
        result.errors.push(`File ${file.path} in manifest but not in checksums.txt`);
        result.consistencyValid = false;
      }
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  /**
   * Gera checksums.txt a partir do manifest
   */
  generateChecksumsTxt(manifest: DeliveryManifest): string {
    const lines: string[] = [
      '# Checksums for dataset delivery',
      `# Generated: ${new Date().toISOString()}`,
      `# Dataset: ${manifest.datasetId}`,
      `# Job: ${manifest.jobId}`,
      '',
    ];

    for (const file of manifest.files || []) {
      lines.push(`${file.checksum.toLowerCase()}  ${file.path}`);
    }

    // Adiciona checksum do próprio manifest
    if (manifest.checksums?.manifestChecksum) {
      lines.push('');
      lines.push(`# Manifest checksum: ${manifest.checksums.manifestChecksum}`);
    }

    return lines.join('\n');
  }

  /**
   * Valida README.md básico
   */
  validateReadme(content: string, manifest: DeliveryManifest): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      manifestValid: true,
      checksumsValid: true,
      readmeValid: true,
      consistencyValid: true,
    };

    // Verifica seções essenciais
    const requiredSections = ['# Dataset', '## Format', '## Files'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        result.warnings.push(`README missing section: ${section}`);
      }
    }

    // Verifica se menciona datasetId
    if (!content.includes(manifest.datasetId)) {
      result.warnings.push('README does not mention datasetId');
    }

    // Verifica se menciona formato
    if (!content.includes(manifest.format)) {
      result.warnings.push(`README does not mention format: ${manifest.format}`);
    }

    result.readmeValid = result.errors.length === 0;
    result.valid = result.errors.length === 0;
    return result;
  }

  /**
   * Validação completa de todos os artefatos
   */
  validateDelivery(
    manifest: unknown,
    checksumsTxt: string,
    readme: string
  ): ValidationResult {
    // Valida manifest
    const manifestResult = this.validateManifest(manifest);
    
    if (!manifestResult.valid || !(manifest as DeliveryManifest)?.files) {
      return manifestResult;
    }

    const m = manifest as DeliveryManifest;

    // Valida checksums
    const checksumsResult = this.validateChecksums(checksumsTxt, m);

    // Valida README
    const readmeResult = this.validateReadme(readme, m);

    // Merge results
    const result: ValidationResult = {
      valid: manifestResult.valid && checksumsResult.valid && readmeResult.valid,
      errors: [...manifestResult.errors, ...checksumsResult.errors, ...readmeResult.errors],
      warnings: [...manifestResult.warnings, ...checksumsResult.warnings, ...readmeResult.warnings],
      manifestValid: manifestResult.manifestValid,
      checksumsValid: checksumsResult.checksumsValid,
      readmeValid: readmeResult.readmeValid,
      consistencyValid: manifestResult.consistencyValid && checksumsResult.consistencyValid,
    };

    return result;
  }

  /**
   * Calcula checksum de arquivo
   */
  calculateChecksum(content: string | Buffer): string {
    const hash = createHash('sha256');
    hash.update(content);
    return hash.digest('hex').toLowerCase();
  }

  /**
   * Gera manifest completo a partir de resultados de entrega
   */
  generateManifest(params: {
    datasetId: string;
    tenantId: string;
    jobId: string;
    task: string;
    modality: string;
    format: string;
    runtime: string;
    files: Array<{
      path: string;
      size: number;
      checksum: string;
      records?: number;
      format?: string;
    }>;
    metadata?: object;
  }): DeliveryManifest {
    const { files, metadata, ...rest } = params;

    // Calcula estatísticas
    const totalSizeBytes = files.reduce((sum, f) => sum + f.size, 0);
    const totalRecords = files.reduce((sum, f) => sum + (f.records || 0), 0);

    const manifestFiles: ManifestFile[] = files.map(f => ({
      path: f.path,
      size: f.size,
      checksum: f.checksum.toLowerCase(),
      checksumAlgorithm: 'sha256',
      records: f.records,
      format: f.format,
    }));

    // Gera checksum do manifest
    const manifestContent = JSON.stringify({
      ...rest,
      files: manifestFiles,
      statistics: {
        totalFiles: files.length,
        totalSizeBytes,
        totalRecords,
        averageRecordSizeBytes: totalRecords > 0 ? Math.round(totalSizeBytes / totalRecords) : 0,
      },
    });
    const manifestChecksum = this.calculateChecksum(manifestContent);

    // Gera checksums dos arquivos
    const fileChecksums: Record<string, string> = {};
    for (const file of files) {
      fileChecksums[file.path] = file.checksum.toLowerCase();
    }

    return {
      version: '1.0',
      createdAt: new Date().toISOString(),
      ...rest,
      files: manifestFiles,
      statistics: {
        totalFiles: files.length,
        totalSizeBytes,
        totalRecords,
        averageRecordSizeBytes: totalRecords > 0 ? Math.round(totalSizeBytes / totalRecords) : 0,
      },
      checksums: {
        algorithm: 'sha256',
        manifestChecksum,
        files: fileChecksums,
      },
      metadata,
    };
  }
}

// Singleton instance
let validator: ManifestValidator | null = null;

export function getManifestValidator(): ManifestValidator {
  if (!validator) {
    validator = new ManifestValidator();
  }
  return validator;
}

export function resetManifestValidator(): void {
  validator = null;
}
