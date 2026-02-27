import * as fs from 'fs';
import * as path from 'path';
import { TextDeidentifier } from './text-deidentifier';
import { TestResult } from './types';

export async function runTextTests(): Promise<TestResult> {
  console.log('\n=== Text/Clinical Notes De-Identification Tests ===\n');
  
  const dataDir = path.join(__dirname, '../data/text');
  const outputDir = path.join(__dirname, '../output/text');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  
  const result: TestResult = {
    testName: 'Text De-Identification',
    dataType: 'text',
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
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt'));
    
    console.log(`Found ${files.length} text files to process\n`);
    
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      console.log(`Processing: ${file}`);
      
      try {
        const deidentifier = new TextDeidentifier();
        const deidentResult = await deidentifier.deidentify(filePath);
        
        result.filesProcessed++;
        
        if (deidentResult.integrityValid) {
          result.filesValid++;
          console.log(`  ✓ Text structure preserved`);
        } else {
          result.filesInvalid++;
          console.log(`  ✗ Text structure compromised`);
          
          result.errors.push({
            file,
            error: deidentResult.validationDetails.errors.join(', '),
            severity: 'medium'
          });
        }
        
        // Collect metrics
        const metrics = deidentifier.getMetrics();
        result.phiDetected += metrics.phiDetected;
        result.phiRedacted += metrics.phiRedacted;
        
        console.log(`  PHI detected: ${metrics.phiDetected}`);
        console.log(`  PHI redacted: ${metrics.phiRedacted}`);
        console.log(`  Redaction rate: ${metrics.redactionRate.toFixed(1)}%`);
        
        // Analyze PHI types
        const phiTypes = analyzePHITypes(deidentResult.phiEntities);
        console.log(`  PHI types found: ${Object.keys(phiTypes).join(', ')}`);
        
        // Save de-identified output
        const outputPath = path.join(outputDir, `deidentified_${file}`);
        fs.writeFileSync(outputPath, deidentResult.deidentified);
        
        // Save detailed report
        const reportPath = path.join(outputDir, `report_${file.replace('.txt', '.json')}`);
        const report = {
          originalFile: file,
          phiDetected: metrics.phiDetected,
          phiRedacted: metrics.phiRedacted,
          phiTypes,
          entities: deidentResult.phiEntities,
          redactionMap: Array.from(deidentResult.redactionMap.entries()),
          validation: deidentResult.validationDetails
        };
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Test edge cases
        await testTextEdgeCases(file, deidentResult, result);
        
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
  
  printTextResults(result);
  
  return result;
}

function analyzePHITypes(entities: any[]): Record<string, number> {
  const types: Record<string, number> = {};
  
  entities.forEach(entity => {
    types[entity.type] = (types[entity.type] || 0) + 1;
  });
  
  return types;
}

async function testTextEdgeCases(filename: string, deidentResult: any, result: TestResult): Promise<void> {
  const originalText = deidentResult.original;
  const deidentifiedText = deidentResult.deidentified;
  
  // Test 1: Names in various formats
  const nameFormats = {
    case: `${filename}: Name format detection`,
    detected: deidentResult.phiEntities.some((e: any) => e.type === 'NAME'),
    redacted: !deidentifiedText.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/)
  };
  result.edgeCases.push(nameFormats);
  
  // Test 2: Dates in multiple formats
  const dateFormats = {
    case: `${filename}: Multiple date formats`,
    detected: deidentResult.phiEntities.some((e: any) => e.type === 'DATE'),
    redacted: deidentResult.phiEntities.filter((e: any) => e.type === 'DATE').length > 0
  };
  result.edgeCases.push(dateFormats);
  
  // Test 3: Phone numbers and contact info
  const contactInfo = {
    case: `${filename}: Contact information`,
    detected: deidentResult.phiEntities.some((e: any) => e.type === 'PHONE' || e.type === 'EMAIL'),
    redacted: !deidentifiedText.match(/\d{3}-\d{3}-\d{4}/)
  };
  result.edgeCases.push(contactInfo);
  
  // Test 4: Addresses
  const addresses = {
    case: `${filename}: Address detection`,
    detected: deidentResult.phiEntities.some((e: any) => e.type === 'LOCATION'),
    redacted: !deidentifiedText.match(/\d+\s+[A-Z][a-z]+\s+(Street|Avenue|Road)/)
  };
  result.edgeCases.push(addresses);
  
  // Test 5: Medical record numbers
  const mrn = {
    case: `${filename}: MRN detection`,
    detected: deidentResult.phiEntities.some((e: any) => e.type === 'MRN'),
    redacted: !deidentifiedText.match(/MRN[:\s-]*[A-Z0-9]{6,}/)
  };
  result.edgeCases.push(mrn);
  
  // Test 6: SSN detection
  const ssn = {
    case: `${filename}: SSN detection`,
    detected: deidentResult.phiEntities.some((e: any) => e.type === 'SSN'),
    redacted: !deidentifiedText.match(/\d{3}-\d{2}-\d{4}/)
  };
  result.edgeCases.push(ssn);
  
  // Test 7: Medical content preservation
  const medicalTerms = ['patient', 'diagnosis', 'treatment', 'exam', 'findings', 'impression', 'clinical'];
  const medicalContentPreserved = {
    case: `${filename}: Medical content preserved`,
    detected: true,
    redacted: medicalTerms.some(term => deidentifiedText.toLowerCase().includes(term))
  };
  result.edgeCases.push(medicalContentPreserved);
  
  // Test 8: Document structure preserved
  const structurePreserved = {
    case: `${filename}: Document structure`,
    detected: true,
    redacted: deidentifiedText.length > originalText.length * 0.5 && 
              deidentifiedText.split('\n').length === originalText.split('\n').length
  };
  result.edgeCases.push(structurePreserved);
}

function printTextResults(result: TestResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('TEXT DE-IDENTIFICATION TEST RESULTS');
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
  
  const edgeCasesByFile = result.edgeCases.reduce((acc, ec) => {
    const file = ec.case.split(':')[0];
    if (!acc[file]) acc[file] = [];
    acc[file].push(ec);
    return acc;
  }, {} as Record<string, any[]>);
  
  console.log(`\nEdge Case Details:`);
  Object.entries(edgeCasesByFile).forEach(([file, cases]) => {
    const passed = cases.filter(c => c.redacted).length;
    console.log(`  ${file}: ${passed}/${cases.length} passed`);
  });
  
  console.log('\n' + '='.repeat(60) + '\n');
}

if (require.main === module) {
  runTextTests().catch(console.error);
}

export { printTextResults };
