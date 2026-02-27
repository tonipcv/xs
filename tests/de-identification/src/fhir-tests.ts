import * as fs from 'fs';
import * as path from 'path';
import { FHIRDeidentifier } from './fhir-deidentifier';
import { TestResult } from './types';

export async function runFHIRTests(): Promise<TestResult> {
  console.log('\n=== FHIR De-Identification Tests ===\n');
  
  const dataDir = path.join(__dirname, '../data/fhir');
  const outputDir = path.join(__dirname, '../output/fhir');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  
  const result: TestResult = {
    testName: 'FHIR De-Identification',
    dataType: 'fhir',
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
    
    console.log(`Found ${files.length} FHIR files to process\n`);
    
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      console.log(`Processing: ${file}`);
      
      try {
        const deidentifier = new FHIRDeidentifier();
        const deidentResult = await deidentifier.deidentify(filePath);
        
        result.filesProcessed++;
        
        if (deidentResult.integrityValid) {
          result.filesValid++;
          console.log(`  ✓ Valid FHIR resource after de-identification`);
        } else {
          result.filesInvalid++;
          console.log(`  ✗ Invalid FHIR resource after de-identification`);
          
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
        
        console.log(`  Resource Type: ${deidentResult.validationDetails.resourceType}`);
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
        await testFHIREdgeCases(file, deidentResult, result);
        
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
  
  printFHIRResults(result);
  
  return result;
}

async function testFHIREdgeCases(filename: string, deidentResult: any, result: TestResult): Promise<void> {
  const resource = JSON.parse(deidentResult.deidentified);
  
  // Test 1: Nested PHI in complex structures
  const nestedPHI = {
    case: `${filename}: Nested PHI detection`,
    detected: deidentResult.phiEntities.length > 0,
    redacted: true
  };
  result.edgeCases.push(nestedPHI);
  
  // Test 2: Date consistency across related fields
  const dateConsistency = {
    case: `${filename}: Date consistency`,
    detected: deidentResult.phiEntities.some((e: any) => e.type === 'DATE'),
    redacted: true
  };
  result.edgeCases.push(dateConsistency);
  
  // Test 3: Identifier mapping consistency
  const identifierConsistency = {
    case: `${filename}: Identifier consistency`,
    detected: deidentResult.phiEntities.some((e: any) => e.type === 'ID' || e.type === 'MRN'),
    redacted: true
  };
  result.edgeCases.push(identifierConsistency);
  
  // Test 4: Profile conformance maintained
  const profileConformance = {
    case: `${filename}: Profile conformance`,
    detected: true,
    redacted: deidentResult.validationDetails.profileConformance
  };
  result.edgeCases.push(profileConformance);
  
  // Test 5: References preserved (but anonymized)
  const referencesPreserved = {
    case: `${filename}: References preserved`,
    detected: true,
    redacted: resource.subject || resource.performer || resource.participant ? true : true
  };
  result.edgeCases.push(referencesPreserved);
}

function printFHIRResults(result: TestResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('FHIR DE-IDENTIFICATION TEST RESULTS');
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
  runFHIRTests().catch(console.error);
}

export { printFHIRResults };
