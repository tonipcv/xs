import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TextDeidentifier } from './text-deidentifier';
import { DICOMDeidentifier } from './dicom-deidentifier';
import { FHIRDeidentifier } from './fhir-deidentifier';
import { AudioDeidentifier } from './audio-deidentifier';

interface BatchConfig {
  inputDir: string;
  outputDir: string;
  concurrency?: number;
  fileTypes?: Array<'dicom' | 'fhir' | 'text' | 'audio'>;
  recursive?: boolean;
  generateReports?: boolean;
  onProgress?: (progress: BatchProgress) => void;
}

interface BatchProgress {
  total: number;
  processed: number;
  failed: number;
  phiDetected: number;
  phiRedacted: number;
  currentFile?: string;
}

interface BatchResult {
  success: boolean;
  filesProcessed: number;
  filesFailed: number;
  totalPhiDetected: number;
  totalPhiRedacted: number;
  redactionRate: number;
  processingTimeMs: number;
  errors: Array<{ file: string; error: string }>;
}

export class BatchProcessor {
  private config: Required<BatchConfig>;
  private progress: BatchProgress;

  constructor(config: BatchConfig) {
    this.config = {
      inputDir: config.inputDir,
      outputDir: config.outputDir,
      concurrency: config.concurrency || Math.max(1, os.cpus().length - 1),
      fileTypes: config.fileTypes || ['dicom', 'fhir', 'text', 'audio'],
      recursive: config.recursive !== false,
      generateReports: config.generateReports !== false,
      onProgress: config.onProgress || (() => {})
    };

    this.progress = {
      total: 0,
      processed: 0,
      failed: 0,
      phiDetected: 0,
      phiRedacted: 0
    };
  }

  async process(): Promise<BatchResult> {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║           BATCH PROCESSING - OPTIMIZED PIPELINE           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();

    // Discover files
    console.log(`📂 Scanning directory: ${this.config.inputDir}`);
    const files = this.discoverFiles();
    this.progress.total = files.length;

    console.log(`   Found ${files.length} files to process`);
    console.log(`   Concurrency: ${this.config.concurrency} workers\n`);

    if (files.length === 0) {
      return {
        success: true,
        filesProcessed: 0,
        filesFailed: 0,
        totalPhiDetected: 0,
        totalPhiRedacted: 0,
        redactionRate: 0,
        processingTimeMs: Date.now() - startTime,
        errors: []
      };
    }

    // Create output directory
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Process files in batches
    const errors: Array<{ file: string; error: string }> = [];
    const batchSize = this.config.concurrency;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(file => this.processFile(file))
      );

      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          errors.push({
            file: batch[idx],
            error: result.reason?.message || 'Unknown error'
          });
          this.progress.failed++;
        } else {
          this.progress.processed++;
          this.progress.phiDetected += result.value.phiDetected;
          this.progress.phiRedacted += result.value.phiRedacted;
        }
      });

      this.config.onProgress(this.progress);
      this.printProgress();
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    console.log('\n\n✅ Batch processing complete!\n');

    const result: BatchResult = {
      success: this.progress.failed === 0,
      filesProcessed: this.progress.processed,
      filesFailed: this.progress.failed,
      totalPhiDetected: this.progress.phiDetected,
      totalPhiRedacted: this.progress.phiRedacted,
      redactionRate: this.progress.phiDetected > 0 
        ? (this.progress.phiRedacted / this.progress.phiDetected) * 100 
        : 0,
      processingTimeMs: processingTime,
      errors
    };

    this.printSummary(result);

    // Save batch report
    if (this.config.generateReports) {
      const reportPath = path.join(this.config.outputDir, 'batch-report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        ...result,
        config: this.config,
        timestamp: new Date().toISOString()
      }, null, 2));
      console.log(`\n📄 Batch report saved to: ${reportPath}`);
    }

    return result;
  }

  private discoverFiles(): string[] {
    const files: string[] = [];

    const scan = (dir: string) => {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (this.config.recursive && !item.startsWith('.') && item !== 'node_modules') {
            scan(fullPath);
          }
        } else if (stat.isFile()) {
          const type = this.detectFileType(fullPath);
          if (type !== 'unknown' && this.config.fileTypes.includes(type)) {
            files.push(fullPath);
          }
        }
      }
    };

    scan(this.config.inputDir);
    return files;
  }

  private async processFile(filepath: string): Promise<{ phiDetected: number; phiRedacted: number }> {
    const type = this.detectFileType(filepath);
    
    let deidentifier: any;
    
    switch (type) {
      case 'dicom':
        deidentifier = new DICOMDeidentifier();
        break;
      case 'fhir':
        deidentifier = new FHIRDeidentifier();
        break;
      case 'text':
        deidentifier = new TextDeidentifier();
        break;
      case 'audio':
        deidentifier = new AudioDeidentifier();
        break;
      default:
        throw new Error(`Unsupported file type: ${type}`);
    }

    const result = await deidentifier.deidentify(filepath);
    const metrics = deidentifier.getMetrics();

    // Save de-identified file
    const relativePath = path.relative(this.config.inputDir, filepath);
    const outputPath = path.join(this.config.outputDir, relativePath);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, result.deidentified);

    // Save report if enabled
    if (this.config.generateReports) {
      const reportPath = outputPath.replace(/\.[^.]+$/, '_report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        original: filepath,
        deidentified: outputPath,
        type,
        metrics,
        validation: result.validationDetails,
        timestamp: new Date().toISOString()
      }, null, 2));
    }

    return {
      phiDetected: metrics.phiDetected,
      phiRedacted: metrics.phiRedacted
    };
  }

  private detectFileType(filepath: string): 'dicom' | 'fhir' | 'text' | 'audio' | 'unknown' {
    const ext = path.extname(filepath).toLowerCase();

    if (ext === '.dcm') return 'dicom';
    if (ext === '.wav' || ext === '.mp3') return 'audio';
    if (ext === '.txt') return 'text';

    if (ext === '.json') {
      try {
        const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        if (content.resourceType) return 'fhir';
        if (content['00100010']) return 'dicom';
      } catch {
        return 'unknown';
      }
    }

    return 'unknown';
  }

  private printProgress(): void {
    const percent = ((this.progress.processed + this.progress.failed) / this.progress.total * 100).toFixed(1);
    const bar = this.createProgressBar(this.progress.processed + this.progress.failed, this.progress.total);
    
    process.stdout.write(`\r${bar} ${percent}% (${this.progress.processed}/${this.progress.total})`);
  }

  private createProgressBar(current: number, total: number, width: number = 40): string {
    const filled = Math.floor((current / total) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }

  private printSummary(result: BatchResult): void {
    console.log('═'.repeat(60));
    console.log('BATCH PROCESSING SUMMARY');
    console.log('═'.repeat(60));
    console.log(`\nFiles Processed: ${result.filesProcessed}`);
    console.log(`Files Failed: ${result.filesFailed}`);
    console.log(`Success Rate: ${(result.filesProcessed / (result.filesProcessed + result.filesFailed) * 100).toFixed(1)}%`);
    console.log(`\nPHI Detected: ${result.totalPhiDetected}`);
    console.log(`PHI Redacted: ${result.totalPhiRedacted}`);
    console.log(`Redaction Rate: ${result.redactionRate.toFixed(1)}%`);
    console.log(`\nProcessing Time: ${(result.processingTimeMs / 1000).toFixed(2)}s`);
    console.log(`Throughput: ${(result.filesProcessed / (result.processingTimeMs / 1000)).toFixed(2)} files/s`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors (${result.errors.length}):`);
      result.errors.slice(0, 10).forEach(err => {
        console.log(`   ${path.basename(err.file)}: ${err.error}`);
      });
      if (result.errors.length > 10) {
        console.log(`   ... and ${result.errors.length - 10} more`);
      }
    }

    console.log('\n' + '═'.repeat(60));
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: npx ts-node src/batch-processor.ts <input-dir> <output-dir> [options]

Options:
  --concurrency <n>    Number of concurrent workers (default: CPU count - 1)
  --no-recursive       Don't scan subdirectories
  --no-reports         Don't generate per-file reports
  --types <types>      Comma-separated file types: dicom,fhir,text,audio

Example:
  npx ts-node src/batch-processor.ts ./data ./output --concurrency 4
    `);
    process.exit(1);
  }

  const config: BatchConfig = {
    inputDir: args[0],
    outputDir: args[1],
    concurrency: parseInt(args.find((a, i) => args[i - 1] === '--concurrency') || '') || undefined,
    recursive: !args.includes('--no-recursive'),
    generateReports: !args.includes('--no-reports'),
    fileTypes: args.find((a, i) => args[i - 1] === '--types')?.split(',') as any
  };

  const processor = new BatchProcessor(config);
  await processor.process();
}

if (require.main === module) {
  main().catch(console.error);
}

export { BatchConfig, BatchProgress, BatchResult };
