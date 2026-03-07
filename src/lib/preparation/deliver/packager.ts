import { CompilationResult, PreparationRequest } from '../preparation.types';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { S3Uploader } from '../utils/s3-uploader';
import { getVersionManager } from '../versioning/dataset-version-manager';
import { ManifestValidator, DeliveryManifest } from '../validation/manifest-validator';

export interface PackageResult {
  manifestPath: string;
  checksumPath: string;
  readmePath: string;
  baseDir: string;
  s3Prefix?: string;
  version?: number;
  manifest?: DeliveryManifest;
}

export class Packager {
  private s3Uploader: S3Uploader;
  private useS3: boolean;

  constructor() {
    this.s3Uploader = new S3Uploader();
    this.useS3 = process.env.PREPARATION_OUTPUT_S3 === 'true' || !!process.env.S3_BUCKET;
  }

  async package(
    datasetId: string,
    jobId: string,
    compilation: CompilationResult,
    request: PreparationRequest
  ): Promise<PackageResult> {
    const layoutPattern = request.output?.layout ?? 'prepared/{datasetId}/{jobId}';
    const resolvedLayout = this.resolveLayout(layoutPattern, datasetId, jobId);

    if (this.useS3) {
      return this.packageToS3(resolvedLayout, compilation, request);
    } else {
      return this.packageToLocal(resolvedLayout, compilation, request);
    }
  }

  private async packageToS3(
    resolvedLayout: string,
    compilation: CompilationResult,
    request: PreparationRequest
  ): Promise<PackageResult> {
    const s3Prefix = `preparation/${resolvedLayout}`;

    // Create and upload manifest
    const manifest = await this.createManifest(compilation, request);
    const manifestFilename = request.output?.manifestFile ?? 'manifest.json';
    const manifestPath = await this.s3Uploader.uploadJson(
      `${s3Prefix}/${manifestFilename}`,
      manifest
    );

    // Create and upload checksums
    const checksums = await this.createChecksums(compilation.outputPaths);
    const checksumFilename = request.output?.checksumFile ?? 'checksums.txt';
    const checksumPath = await this.s3Uploader.uploadString(
      `${s3Prefix}/${checksumFilename}`,
      checksums,
      'text/plain'
    );

    // Create and upload README
    const readme = this.createReadme(compilation, request);
    const readmeFilename = request.output?.readmeFile ?? 'README.md';
    const readmePath = await this.s3Uploader.uploadString(
      `${s3Prefix}/${readmeFilename}`,
      readme,
      'text/markdown'
    );

    return {
      manifestPath,
      checksumPath,
      readmePath,
      baseDir: `s3://${this.s3Uploader.getBucket()}/${s3Prefix}`,
      s3Prefix,
      manifest: manifest as DeliveryManifest,
    };
  }

  private async packageToLocal(
    resolvedLayout: string,
    compilation: CompilationResult,
    request: PreparationRequest
  ): Promise<PackageResult> {
    const outputDir = path.join('/tmp', resolvedLayout);
    await fs.mkdir(outputDir, { recursive: true });

    const manifest = await this.createManifest(compilation, request);
    const manifestFilename = request.output?.manifestFile ?? 'manifest.json';
    const manifestPath = path.join(outputDir, manifestFilename);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const checksums = await this.createChecksums(compilation.outputPaths);
    const checksumFilename = request.output?.checksumFile ?? 'checksums.txt';
    const checksumPath = path.join(outputDir, checksumFilename);
    await fs.writeFile(checksumPath, checksums);

    const readme = this.createReadme(compilation, request);
    const readmeFilename = request.output?.readmeFile ?? 'README.md';
    const readmePath = path.join(outputDir, readmeFilename);
    await fs.writeFile(readmePath, readme);

    return { 
      manifestPath, 
      checksumPath, 
      readmePath, 
      baseDir: outputDir,
      manifest: manifest as DeliveryManifest,
    };
  }

  private async createManifest(
    compilation: CompilationResult,
    request: PreparationRequest,
    schema?: Record<string, string>,
    qualityReport?: { score: number; issues: string[] }
  ): Promise<unknown> {
    return {
      version: '1.0',
      task: request.task,
      modality: request.modality,
      target: request.target,
      config: request.config ?? {},
      license: request.license,
      privacy: request.privacy,
      output: request.output,
      schema: schema ?? this.inferSchema(request.task),
      quality: qualityReport ?? { score: 0, issues: [] },
      compilation: {
        format: compilation.format,
        shardCount: compilation.shardCount,
        totalSizeBytes: compilation.totalSizeBytes,
        recordCount: compilation.recordCount,
        stats: compilation.stats,
      },
      files: compilation.outputPaths.map((p) => path.basename(p)),
      createdAt: new Date().toISOString(),
    };
  }

  private inferSchema(task: string): Record<string, string> {
    const schemas: Record<string, Record<string, string>> = {
      'pre-training': {
        text: 'string',
        token_count: 'number',
        document_count: 'number',
        document_ids: 'string[]',
      },
      'fine-tuning': {
        messages: 'Message[]',
        text: 'string',
        template: 'string',
      },
      'rag': {
        text: 'string',
        chunk_id: 'string',
        source_id: 'string',
        chunk_index: 'number',
        start_offset: 'number',
        end_offset: 'number',
      },
      'eval': {
        input: 'string',
        expected_output: 'string',
        label: 'string',
        metadata: 'object',
      },
      'dpo': {
        chosen: 'string',
        rejected: 'string',
        context: 'string',
      },
    };
    return schemas[task] ?? { text: 'string' };
  }

  private async createChecksums(filePaths: string[]): Promise<string> {
    const checksums: string[] = [];

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        checksums.push(`${hash}  ${path.basename(filePath)}`);
      } catch {
        continue;
      }
    }

    return checksums.join('\n') + '\n';
  }

  private createReadme(
    compilation: CompilationResult,
    request: PreparationRequest,
    schema?: Record<string, string>,
    qualityReport?: { score: number; issues: string[] }
  ): string {
    const schemaSection = schema
      ? `## Schema\n\n| Field | Type |\n|-------|------|\n${Object.entries(schema)
          .map(([k, v]) => `| ${k} | ${v} |`)
          .join('\n')}\n`
      : '';

    const qualitySection = qualityReport
      ? `## Quality Report\n\n- **Score**: ${qualityReport.score.toFixed(2)}/1.0\n- **Issues**: ${qualityReport.issues.length > 0 ? qualityReport.issues.join(', ') : 'None'}\n`
      : '';

    return `# Dataset Preparation Output

## Overview
- **Task**: ${request.task}
- **Modality**: ${request.modality}
- **Target Runtime**: ${request.target.runtime}
- **Format**: ${request.target.format}
- **License**: ${request.license.type}
- **PII Handling**: ${request.privacy.piiHandling}

## Compilation Results
- **Shards**: ${compilation.shardCount}
- **Total Size**: ${(compilation.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB
- **Records**: ${compilation.recordCount}

## Files
${compilation.outputPaths.map((p) => `- ${path.basename(p)}`).join('\n')}

${schemaSection}

${qualitySection}

## Usage
Load this dataset using your training framework. See manifest.json for detailed metadata.

## Verification
Verify file integrity using checksums.txt:

\`\`\`bash
sha256sum -c checksums.txt
\`\`\`

## Limitations
- Dataset prepared for specific task: ${request.task}
- Review quality report before training
- Verify license compliance for commercial use

---
Generated by XASE Data Preparation Pipeline
`;
  }

  private resolveLayout(layout: string, datasetId: string, jobId: string): string {
    return layout.replace('{datasetId}', datasetId).replace('{jobId}', jobId);
  }

  /**
   * Registra versão após packaging bem-sucedido
   */
  async registerVersion(
    datasetId: string,
    jobId: string,
    packageResult: PackageResult,
    description?: string
  ): Promise<{ version: number; message: string }> {
    const versionManager = getVersionManager();

    // Detecta mudanças (simplificado - em produção compararia com versão anterior)
    const changes = packageResult.manifest ? [
      {
        type: 'added' as const,
        description: `Packaged ${packageResult.manifest.files.length} files`,
        count: packageResult.manifest.statistics.totalRecords,
      },
    ] : [];

    const version = await versionManager.registerVersion(datasetId, jobId, {
      description: description || `Packaged dataset version`,
      changes,
    });

    return {
      version: version.version,
      message: `Registered version ${version.version} for dataset ${datasetId}`,
    };
  }

  /**
   * Valida manifest antes do upload
   */
  validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
    const validator = new ManifestValidator();
    const result = validator.validateManifest(manifest);
    return {
      valid: result.valid,
      errors: result.errors,
    };
  }
}
