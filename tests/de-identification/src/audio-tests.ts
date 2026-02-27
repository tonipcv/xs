import * as fs from 'fs';
import * as path from 'path';
import { AudioDeidentifier } from './audio-deidentifier';
import { TestResult } from './types';

export async function runAudioTests(): Promise<TestResult> {
  console.log('\n=== Audio De-Identification Tests ===\n');
  
  const dataDir = path.join(__dirname, '../data/audio');
  const outputDir = path.join(__dirname, '../output/audio');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const audioFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.wav'));
  console.log(`Found ${audioFiles.length} audio files to process\n`);
  
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  
  let filesValid = 0;
  let filesInvalid = 0;
  let totalPhiDetected = 0;
  let totalPhiRedacted = 0;
  const errors: Array<{ file: string; error: string; severity: 'low' | 'medium' | 'high' }> = [];
  const edgeCases: Array<{ case: string; detected: boolean; redacted: boolean }> = [];
  
  for (const file of audioFiles) {
    const filePath = path.join(dataDir, file);
    
    try {
      console.log(`Processing: ${file}`);
      
      const deidentifier = new AudioDeidentifier();
      const result = await deidentifier.deidentify(filePath);
      
      const metrics = deidentifier.getMetrics();
      totalPhiDetected += metrics.phiDetected;
      totalPhiRedacted += metrics.phiRedacted;
      
      if (result.integrityValid) {
        filesValid++;
        console.log(`  ✓ Valid after de-identification`);
      } else {
        filesInvalid++;
        console.log(`  ✗ Invalid after de-identification`);
        errors.push({
          file,
          error: result.validationDetails.errors.join(', '),
          severity: 'medium'
        });
      }
      
      console.log(`  PHI detected: ${metrics.phiDetected}`);
      console.log(`  PHI redacted: ${metrics.phiRedacted}`);
      console.log(`  Redaction rate: ${metrics.redactionRate.toFixed(1)}%`);
      
      // Test edge cases
      const phiTypes = new Set(result.phiEntities.map(e => e.type));
      edgeCases.push({
        case: `${file}: Multiple PHI types`,
        detected: phiTypes.size >= 3,
        redacted: metrics.redactionRate >= 95
      });
      
      edgeCases.push({
        case: `${file}: Names detected`,
        detected: result.phiEntities.some(e => e.type === 'NAME'),
        redacted: !result.deidentified.includes('John') && !result.deidentified.includes('Jane')
      });
      
      edgeCases.push({
        case: `${file}: Dates detected`,
        detected: result.phiEntities.some(e => e.type === 'DATE'),
        redacted: !result.deidentified.includes('2024')
      });
      
      // Save detailed report
      const reportPath = path.join(outputDir, `report_${file.replace('.wav', '.json')}`);
      fs.writeFileSync(reportPath, JSON.stringify({
        file,
        metrics,
        phiEntities: result.phiEntities,
        validation: result.validationDetails,
        redactionMap: Array.from(result.redactionMap.entries())
      }, null, 2));
      
    } catch (error: any) {
      filesInvalid++;
      console.log(`  ✗ Error: ${error.message}`);
      errors.push({
        file,
        error: error.message,
        severity: 'high'
      });
    }
    
    console.log('');
  }
  
  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  
  const result: TestResult = {
    testName: 'Audio De-Identification',
    dataType: 'audio',
    timestamp: new Date(),
    filesProcessed: audioFiles.length,
    filesValid,
    filesInvalid,
    phiDetected: totalPhiDetected,
    phiRedacted: totalPhiRedacted,
    falsePositives: 0,
    processingTimeMs: endTime - startTime,
    memoryUsageMB: endMemory - startMemory,
    errors,
    edgeCases
  };
  
  printSummary(result);
  
  return result;
}

function printSummary(result: TestResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('AUDIO DE-IDENTIFICATION TEST RESULTS');
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
  
  const edgeCasesPassed = result.edgeCases.filter(ec => ec.detected && ec.redacted).length;
  console.log(`\nEdge Cases Tested: ${result.edgeCases.length}`);
  console.log(`  Passed: ${edgeCasesPassed}/${result.edgeCases.length}`);
  
  console.log('\n' + '='.repeat(60) + '\n');
}

if (require.main === module) {
  runAudioTests().catch(console.error);
}

export { AudioDeidentifier };
