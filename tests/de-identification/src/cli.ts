#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { TextDeidentifier } from './text-deidentifier';
import { DICOMDeidentifier } from './dicom-deidentifier';
import { DICOMBinaryDeidentifier } from './dicom-binary-deidentifier';
import { FHIRDeidentifier } from './fhir-deidentifier';
import { AudioDeidentifier } from './audio-deidentifier';
import { HL7Deidentifier } from './hl7-deidentifier';

interface CLIOptions {
  input: string;
  output?: string;
  type?: 'auto' | 'dicom' | 'dicom-binary' | 'fhir' | 'text' | 'audio' | 'hl7';
  batch?: boolean;
  verbose?: boolean;
  report?: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }
  
  const options = parseArgs(args);
  
  if (!options.input) {
    console.error('❌ Error: Input file or directory required');
    console.error('Use --help for usage information');
    process.exit(1);
  }
  
  if (!fs.existsSync(options.input)) {
    console.error(`❌ Error: Input path does not exist: ${options.input}`);
    process.exit(1);
  }
  
  const stats = fs.statSync(options.input);
  
  if (stats.isDirectory() || options.batch) {
    await processBatch(options);
  } else {
    await processSingleFile(options);
  }
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    input: '',
    type: 'auto',
    batch: false,
    verbose: false,
    report: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '-i':
      case '--input':
        options.input = args[++i];
        break;
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
      case '-t':
      case '--type':
        options.type = args[++i] as any;
        break;
      case '-b':
      case '--batch':
        options.batch = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-r':
      case '--report':
        options.report = true;
        break;
      default:
        if (!options.input && !arg.startsWith('-')) {
          options.input = arg;
        }
    }
  }
  
  return options;
}

async function processSingleFile(options: CLIOptions): Promise<void> {
  console.log(`\n🔒 De-identifying: ${options.input}\n`);
  
  const type = options.type === 'auto' ? detectFileType(options.input) : options.type;
  
  if (options.verbose) {
    console.log(`Detected type: ${type}`);
  }
  
  let deidentifier: any;
  let isBinaryDICOM = false;
  
  switch (type) {
    case 'dicom':
      deidentifier = new DICOMDeidentifier();
      break;
    case 'dicom-binary':
      deidentifier = new DICOMBinaryDeidentifier();
      isBinaryDICOM = true;
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
    case 'hl7':
      deidentifier = new HL7Deidentifier();
      break;
    default:
      console.error(`❌ Unsupported file type: ${type}`);
      process.exit(1);
  }
  
  try {
    let result: any;
    let metrics: any;
    let outputPath: string;
    
    if (isBinaryDICOM) {
      outputPath = options.output || generateOutputPath(options.input);
      await deidentifier.deidentifyToFile(options.input, outputPath);
      metrics = deidentifier.getMetrics();
      result = { deidentified: outputPath };
    } else {
      result = await deidentifier.deidentify(options.input);
      metrics = deidentifier.getMetrics();
      
      // Save output
      outputPath = options.output || generateOutputPath(options.input);
      const outputDir = path.dirname(outputPath);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, result.deidentified);
      result.outputPath = outputPath;
    }
    
    console.log('✅ De-identification complete!');
    console.log(`   PHI detected: ${metrics.phiDetected}`);
    console.log(`   PHI redacted: ${metrics.phiRedacted}`);
    console.log(`   Redaction rate: ${metrics.redactionRate.toFixed(1)}%`);
    console.log(`   Output saved to: ${outputPath}`);
    
    if (options.report) {
      const reportPath = outputPath.replace(/\.[^.]+$/, '_report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        input: options.input,
        output: outputPath,
        type,
        metrics,
        phiEntities: result.phiEntities,
        validation: result.validationDetails,
        timestamp: new Date().toISOString()
      }, null, 2));
      console.log(`   Report saved to: ${reportPath}`);
    }
    
    if (result.integrityValid === false && result.validationDetails && result.validationDetails.errors) {
      console.warn('\n⚠️  Warning: File validation issues detected');
      result.validationDetails.errors.forEach((err: string) => {
        console.warn(`   - ${err}`);
      });
    }
    
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function processBatch(options: CLIOptions): Promise<void> {
  const inputDir = fs.statSync(options.input).isDirectory() ? options.input : path.dirname(options.input);
  const files = getFilesRecursive(inputDir);
  
  console.log(`\n🔒 Batch de-identification: ${files.length} files\n`);
  
  let processed = 0;
  let failed = 0;
  let totalPhiDetected = 0;
  let totalPhiRedacted = 0;
  
  for (const file of files) {
    try {
      const type = detectFileType(file);
      
      if (type === 'unknown') {
        if (options.verbose) {
          console.log(`⊘ Skipping: ${file} (unknown type)`);
        }
        continue;
      }
      
      let deidentifier: any;
      
      let isBinaryDICOM = false;
      
      switch (type) {
        case 'dicom':
          deidentifier = new DICOMDeidentifier();
          break;
        case 'dicom-binary':
          deidentifier = new DICOMBinaryDeidentifier();
          isBinaryDICOM = true;
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
        case 'hl7':
          deidentifier = new HL7Deidentifier();
          break;
        default:
          continue;
      }
      
      let metrics: any;
      const outputPath = options.output 
        ? path.join(options.output, path.relative(inputDir, file))
        : generateOutputPath(file);
      
      if (isBinaryDICOM) {
        await deidentifier.deidentifyToFile(file, outputPath);
        metrics = deidentifier.getMetrics();
      } else {
        const result = await deidentifier.deidentify(file);
        metrics = deidentifier.getMetrics();
        
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, result.deidentified);
      }
      
      totalPhiDetected += metrics.phiDetected;
      totalPhiRedacted += metrics.phiRedacted;
      
      processed++;
      
      if (options.verbose) {
        console.log(`✓ ${file} → ${outputPath} (${metrics.phiRedacted}/${metrics.phiDetected} PHI)`);
      } else {
        process.stdout.write(`\rProcessed: ${processed}/${files.length}`);
      }
      
    } catch (error: any) {
      failed++;
      if (options.verbose) {
        console.error(`✗ ${file}: ${error.message}`);
      }
    }
  }
  
  console.log(`\n\n✅ Batch processing complete!`);
  console.log(`   Files processed: ${processed}`);
  console.log(`   Files failed: ${failed}`);
  console.log(`   Total PHI detected: ${totalPhiDetected}`);
  console.log(`   Total PHI redacted: ${totalPhiRedacted}`);
  console.log(`   Overall redaction rate: ${(totalPhiRedacted / totalPhiDetected * 100).toFixed(1)}%`);
}

function detectFileType(filepath: string): 'dicom' | 'dicom-binary' | 'fhir' | 'text' | 'audio' | 'hl7' | 'unknown' {
  const ext = path.extname(filepath).toLowerCase();
  
  if (ext === '.dcm') return 'dicom-binary';
  if (ext === '.wav' || ext === '.mp3') return 'audio';
  if (ext === '.txt') return 'text';
  if (ext === '.hl7') return 'hl7';
  
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

function generateOutputPath(inputPath: string): string {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  
  const outputDir = path.join(dir, 'deidentified');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  return path.join(outputDir, `${base}_deidentified${ext}`);
}

function getFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      files.push(...getFilesRecursive(fullPath));
    } else if (stat.isFile()) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function printHelp(): void {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║        XASE De-Identification CLI Tool                     ║
╚════════════════════════════════════════════════════════════╝

USAGE:
  xase-deidentify [options] <input>

OPTIONS:
  -i, --input <path>      Input file or directory (required)
  -o, --output <path>     Output file or directory (default: ./deidentified/)
  -t, --type <type>       File type: auto, dicom, fhir, text, audio (default: auto)
  -b, --batch             Process directory recursively
  -v, --verbose           Verbose output
  -r, --report            Generate detailed JSON report
  -h, --help              Show this help message

EXAMPLES:
  # De-identify a single file
  xase-deidentify input.txt
  
  # De-identify with custom output
  xase-deidentify -i input.txt -o output.txt
  
  # Batch process directory
  xase-deidentify -b -i ./data/ -o ./deidentified/
  
  # Generate detailed report
  xase-deidentify -r input.json
  
  # Verbose batch processing
  xase-deidentify -b -v -i ./clinical-notes/

SUPPORTED FILE TYPES:
  • DICOM: .dcm, .json (with DICOM tags)
  • FHIR: .json (with resourceType)
  • Text: .txt (clinical notes, reports)
  • Audio: .wav, .mp3 (with metadata)

For more information, visit: https://github.com/xaseai/xase-sheets
  `);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main as runCLI };
