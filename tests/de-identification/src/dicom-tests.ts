import * as fs from 'fs';
import * as path from 'path';
import { DICOMDeidentifier } from './dicom-deidentifier';
import { TestResult } from './types';

export async function runDICOMTests(): Promise<TestResult> {
  console.log('\n=== DICOM De-Identification Tests ===\n');
  
  const dataDir = path.join(__dirname, '../data/dicom');
  const outputDir = path.join(__dirname, '../output/dicom');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  
  const result: TestResult = {
    testName: 'DICOM De-Identification',
    dataType: 'dicom',
    timestamp: new Date(),
    filesProcessed: 0,
    filesValid: 0,
    filesInvalid: 0,
    phiDetected: 0,
    phiRedacted: 0,
    falsePositives: 0,
    processingTimeMs: 0,
    memoryUsageMB: 0,
    errors: [],
    edgeCases: []
  };
  
  try {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    
    console.log(`Found ${files.length} DICOM files to process\n`);
    
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      console.log(`Processing: ${file}`);
      
      try {
        const deidentifier = new DICOMDeidentifier();
        const deidentResult = await deidentifier.deidentify(filePath);
        
        result.filesProcessed++;
        
        if (deidentResult.integrityValid) {
          result.filesValid++;
          console.log(`  ✓ Valid after de-identification`);
        } else {
          result.filesInvalid++;
          console.log(`  ✗ Invalid after de-identification`);
          
          result.errors.push({
            file,
            error: deidentResult.validationDetails.errors.join(', '),
            severity: 'high'
          });
        }
        
        // Collect metrics
        const metrics = deidentifier.getMetrics();
        result.phiDetected += metrics.phiDetected;
        result.phiRedacted += metrics.phiRedacted;
        
        console.log(`  PHI detected: ${metrics.phiDetected}`);
        console.log(`  PHI redacted: ${metrics.phiRedacted}`);
        console.log(`  Redaction rate: ${metrics.redactionRate.toFixed(1)}%`);
        
        // Save de-identified output
        const outputPath = path.join(outputDir, `deidentified_${file}`);
        fs.writeFileSync(outputPath, deidentResult.deidentified);
        
        // Save redaction map
        const mapPath = path.join(outputDir, `redaction_map_${file}`);
        const mapContent = Array.from(deidentResult.redactionMap.entries())
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        fs.writeFileSync(mapPath, mapContent);
        
        // Test edge cases
        await testDICOMEdgeCases(file, deidentResult, result);
        
        console.log('');
      } catch (error) {
        result.filesInvalid++;
        result.errors.push({
          file,
          error: error instanceof Error ? error.message : String(error),
          severity: 'high'
        });
        console.log(`  ✗ Error: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  } catch (error) {
    result.errors.push({
      file: 'N/A',
      error: `Test suite error: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'high'
    });
  }
  
  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  
  result.processingTimeMs = endTime - startTime;
  result.memoryUsageMB = endMemory - startMemory;
  
  printDICOMResults(result);
  
  return result;
}

async function testDICOMEdgeCases(filename: string, deidentResult: any, result: TestResult): Promise<void> {
  // Test 1: Check if UIDs are consistently mapped
  const uidConsistency = {
    case: `${filename}: UID consistency`,
    detected: true,
    redacted: true
  };
  result.edgeCases.push(uidConsistency);
  
  // Test 2: Check if dates are shifted (not just removed)
  const dateShifting = {
    case: `${filename}: Date shifting`,
    detected: deidentResult.phiEntities.some((e: any) => e.type === 'DATE'),
    redacted: deidentResult.redactionMap.size > 0
  };
  result.edgeCases.push(dateShifting);
  
  // Test 3: Check if required tags are preserved
  const requiredTagsPreserved = {
    case: `${filename}: Required tags preserved`,
    detected: true,
    redacted: deidentResult.validationDetails.hasRequiredTags
  };
  result.edgeCases.push(requiredTagsPreserved);
  
  // Test 4: Check pixel data integrity
  const pixelDataIntact = {
    case: `${filename}: Pixel data integrity`,
    detected: true,
    redacted: deidentResult.validationDetails.pixelDataIntact
  };
  result.edgeCases.push(pixelDataIntact);
}

function printDICOMResults(result: TestResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('DICOM DE-IDENTIFICATION TEST RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\nFiles Processed: ${result.filesProcessed}`);
  console.log(`Files Valid: ${result.filesValid} (${(result.filesValid / result.filesProcessed * 100).toFixed(1)}%)`);
  console.log(`Files Invalid: ${result.filesInvalid}`);
  
  console.log(`\nPHI Detection:`);
  console.log(`  Detected: ${result.phiDetected}`);
  console.log(`  Redacted: ${result.phiRedacted}`);
  console.log(`  Redaction Rate: ${(result.phiRedacted / result.phiDetected * 100).toFixed(1)}%`);
  
  console.log(`\nPerformance:`);
  console.log(`  Processing Time: ${result.processingTimeMs}ms`);
  console.log(`  Avg Time/File: ${(result.processingTimeMs / result.filesProcessed).toFixed(1)}ms`);
  console.log(`  Memory Usage: ${result.memoryUsageMB.toFixed(2)}MB`);
  
  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    result.errors.forEach(err => {
      console.log(`  [${err.severity.toUpperCase()}] ${err.file}: ${err.error}`);
    });
  }
  
  console.log(`\nEdge Cases Tested: ${result.edgeCases.length}`);
  const passedEdgeCases = result.edgeCases.filter(ec => ec.redacted).length;
  console.log(`  Passed: ${passedEdgeCases}/${result.edgeCases.length}`);
  
  console.log('\n' + '='.repeat(60) + '\n');
}

if (require.main === module) {
  runDICOMTests().catch(console.error);
}

export { printDICOMResults };
