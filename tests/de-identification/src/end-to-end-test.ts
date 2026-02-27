import * as fs from 'fs';
import * as path from 'path';
import { DICOMBinaryDeidentifier } from './dicom-binary-deidentifier';
import { FHIRDeidentifier } from './fhir-deidentifier';
import { TextDeidentifier } from './text-deidentifier';
import { HL7Deidentifier } from './hl7-deidentifier';
import { AudioDeidentifier } from './audio-deidentifier';

interface TestResult {
  format: string;
  file: string;
  success: boolean;
  phiDetected: number;
  phiRedacted: number;
  redactionRate: number;
  duration: number;
  error?: string;
}

async function runEndToEndTest() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     XASE De-Identification - End-to-End Test Suite        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const results: TestResult[] = [];
  let totalPHI = 0;
  let totalRedacted = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  // Test 1: DICOM Binary (Real Images)
  console.log('📊 Test 1: DICOM Binary (Real Medical Images)');
  console.log('─────────────────────────────────────────────────────────────');
  
  const dicomDir = path.join(__dirname, '../data/dicom/images');
  if (fs.existsSync(dicomDir)) {
    const dcmFiles = fs.readdirSync(dicomDir).filter(f => f.endsWith('.dcm')).slice(0, 3);
    
    for (const file of dcmFiles) {
      const start = Date.now();
      try {
        const deidentifier = new DICOMBinaryDeidentifier();
        const inputPath = path.join(dicomDir, file);
        const outputPath = path.join(__dirname, '../output/e2e/dicom', file);
        
        await deidentifier.deidentifyToFile(inputPath, outputPath);
        const metrics = deidentifier.getMetrics();
        const duration = Date.now() - start;
        
        totalPHI += metrics.phiDetected;
        totalRedacted += metrics.phiRedacted;
        totalSuccess++;
        
        console.log(`  ✓ ${file}: ${metrics.phiRedacted}/${metrics.phiDetected} PHI (${duration}ms)`);
        
        results.push({
          format: 'DICOM Binary',
          file,
          success: true,
          phiDetected: metrics.phiDetected,
          phiRedacted: metrics.phiRedacted,
          redactionRate: metrics.redactionRate,
          duration
        });
      } catch (error: any) {
        totalFailed++;
        console.log(`  ✗ ${file}: ${error.message}`);
        results.push({
          format: 'DICOM Binary',
          file,
          success: false,
          phiDetected: 0,
          phiRedacted: 0,
          redactionRate: 0,
          duration: Date.now() - start,
          error: error.message
        });
      }
    }
  }

  console.log('');

  // Test 2: FHIR Resources
  console.log('📊 Test 2: FHIR Resources');
  console.log('─────────────────────────────────────────────────────────────');
  
  const fhirDir = path.join(__dirname, '../data/fhir');
  if (fs.existsSync(fhirDir)) {
    const fhirFiles = fs.readdirSync(fhirDir).filter(f => f.endsWith('.json')).slice(0, 3);
    
    for (const file of fhirFiles) {
      const start = Date.now();
      try {
        const deidentifier = new FHIRDeidentifier();
        const inputPath = path.join(fhirDir, file);
        const result = await deidentifier.deidentify(inputPath);
        const metrics = deidentifier.getMetrics();
        const duration = Date.now() - start;
        
        totalPHI += metrics.phiDetected;
        totalRedacted += metrics.phiRedacted;
        totalSuccess++;
        
        const outputPath = path.join(__dirname, '../output/e2e/fhir', file);
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputPath, result.deidentified);
        
        console.log(`  ✓ ${file}: ${metrics.phiRedacted}/${metrics.phiDetected} PHI (${duration}ms)`);
        
        results.push({
          format: 'FHIR',
          file,
          success: true,
          phiDetected: metrics.phiDetected,
          phiRedacted: metrics.phiRedacted,
          redactionRate: metrics.redactionRate,
          duration
        });
      } catch (error: any) {
        totalFailed++;
        console.log(`  ✗ ${file}: ${error.message}`);
        results.push({
          format: 'FHIR',
          file,
          success: false,
          phiDetected: 0,
          phiRedacted: 0,
          redactionRate: 0,
          duration: Date.now() - start,
          error: error.message
        });
      }
    }
  }

  console.log('');

  // Test 3: Clinical Text
  console.log('📊 Test 3: Clinical Text Documents');
  console.log('─────────────────────────────────────────────────────────────');
  
  const textDir = path.join(__dirname, '../data/text');
  if (fs.existsSync(textDir)) {
    const textFiles = fs.readdirSync(textDir).filter(f => f.endsWith('.txt')).slice(0, 3);
    
    for (const file of textFiles) {
      const start = Date.now();
      try {
        const deidentifier = new TextDeidentifier();
        const inputPath = path.join(textDir, file);
        const result = await deidentifier.deidentify(inputPath);
        const metrics = deidentifier.getMetrics();
        const duration = Date.now() - start;
        
        totalPHI += metrics.phiDetected;
        totalRedacted += metrics.phiRedacted;
        totalSuccess++;
        
        const outputPath = path.join(__dirname, '../output/e2e/text', file);
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputPath, result.deidentified);
        
        console.log(`  ✓ ${file}: ${metrics.phiRedacted}/${metrics.phiDetected} PHI (${duration}ms)`);
        
        results.push({
          format: 'Text',
          file,
          success: true,
          phiDetected: metrics.phiDetected,
          phiRedacted: metrics.phiRedacted,
          redactionRate: metrics.redactionRate,
          duration
        });
      } catch (error: any) {
        totalFailed++;
        console.log(`  ✗ ${file}: ${error.message}`);
        results.push({
          format: 'Text',
          file,
          success: false,
          phiDetected: 0,
          phiRedacted: 0,
          redactionRate: 0,
          duration: Date.now() - start,
          error: error.message
        });
      }
    }
  }

  console.log('');

  // Test 4: HL7 Messages
  console.log('📊 Test 4: HL7 v2 Messages');
  console.log('─────────────────────────────────────────────────────────────');
  
  const hl7Dir = path.join(__dirname, '../data/hl7');
  if (fs.existsSync(hl7Dir)) {
    const hl7Files = fs.readdirSync(hl7Dir).filter(f => f.endsWith('.hl7')).slice(0, 3);
    
    for (const file of hl7Files) {
      const start = Date.now();
      try {
        const deidentifier = new HL7Deidentifier();
        const inputPath = path.join(hl7Dir, file);
        const result = await deidentifier.deidentify(inputPath);
        const metrics = deidentifier.getMetrics();
        const duration = Date.now() - start;
        
        totalPHI += metrics.phiDetected;
        totalRedacted += metrics.phiRedacted;
        totalSuccess++;
        
        const outputPath = path.join(__dirname, '../output/e2e/hl7', file);
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputPath, result.deidentified);
        
        console.log(`  ✓ ${file}: ${metrics.phiRedacted}/${metrics.phiDetected} PHI (${duration}ms)`);
        
        results.push({
          format: 'HL7',
          file,
          success: true,
          phiDetected: metrics.phiDetected,
          phiRedacted: metrics.phiRedacted,
          redactionRate: metrics.redactionRate,
          duration
        });
      } catch (error: any) {
        totalFailed++;
        console.log(`  ✗ ${file}: ${error.message}`);
        results.push({
          format: 'HL7',
          file,
          success: false,
          phiDetected: 0,
          phiRedacted: 0,
          redactionRate: 0,
          duration: Date.now() - start,
          error: error.message
        });
      }
    }
  }

  console.log('');

  // Summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Summary                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  const totalFiles = totalSuccess + totalFailed;
  const overallRate = totalPHI > 0 ? (totalRedacted / totalPHI * 100) : 0;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  
  console.log(`Total Files Tested:     ${totalFiles}`);
  console.log(`Success:                ${totalSuccess}`);
  console.log(`Failed:                 ${totalFailed}`);
  console.log(`Total PHI Detected:     ${totalPHI}`);
  console.log(`Total PHI Redacted:     ${totalRedacted}`);
  console.log(`Overall Redaction Rate: ${overallRate.toFixed(1)}%`);
  console.log(`Average Duration:       ${avgDuration.toFixed(0)}ms`);
  
  // Results by format
  console.log('\n📊 Results by Format:\n');
  const formatStats = new Map<string, { success: number; failed: number; phi: number; redacted: number }>();
  
  for (const result of results) {
    if (!formatStats.has(result.format)) {
      formatStats.set(result.format, { success: 0, failed: 0, phi: 0, redacted: 0 });
    }
    const stats = formatStats.get(result.format)!;
    if (result.success) {
      stats.success++;
      stats.phi += result.phiDetected;
      stats.redacted += result.phiRedacted;
    } else {
      stats.failed++;
    }
  }
  
  for (const [format, stats] of formatStats) {
    const rate = stats.phi > 0 ? (stats.redacted / stats.phi * 100) : 0;
    console.log(`${format}:`);
    console.log(`  Files: ${stats.success + stats.failed} (${stats.success} success, ${stats.failed} failed)`);
    console.log(`  PHI: ${stats.redacted}/${stats.phi} (${rate.toFixed(1)}%)`);
    console.log('');
  }
  
  // Save detailed report
  const reportPath = path.join(__dirname, '../output/e2e/end-to-end-report.json');
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles,
      success: totalSuccess,
      failed: totalFailed,
      totalPHI,
      totalRedacted,
      overallRedactionRate: overallRate,
      averageDuration: avgDuration
    },
    results,
    formatStats: Array.from(formatStats.entries()).map(([format, stats]) => ({
      format,
      ...stats,
      redactionRate: stats.phi > 0 ? (stats.redacted / stats.phi * 100) : 0
    }))
  }, null, 2));
  
  console.log(`Detailed report saved: ${path.relative(process.cwd(), reportPath)}\n`);
  
  if (totalFailed === 0 && overallRate === 100) {
    console.log('✅ All tests passed! System is working perfectly.\n');
    process.exit(0);
  } else if (totalFailed > 0) {
    console.log('⚠️  Some tests failed. See report for details.\n');
    process.exit(1);
  } else {
    console.log('⚠️  Redaction rate below 100%. Review results.\n');
    process.exit(1);
  }
}

if (require.main === module) {
  runEndToEndTest().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runEndToEndTest };
