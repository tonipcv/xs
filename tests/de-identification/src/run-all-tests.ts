import * as fs from 'fs';
import * as path from 'path';
import { runDICOMTests } from './dicom-tests';
import { runFHIRTests } from './fhir-tests';
import { runTextTests } from './text-tests';
import { createSampleDatasets } from './download-datasets';
import { TestResult } from './types';

interface ComprehensiveReport {
  timestamp: Date;
  totalTests: number;
  totalFilesProcessed: number;
  totalFilesValid: number;
  totalPHIDetected: number;
  totalPHIRedacted: number;
  overallRedactionRate: number;
  totalProcessingTimeMs: number;
  totalMemoryUsageMB: number;
  testResults: TestResult[];
  summary: {
    dicom: TestSummary;
    fhir: TestSummary;
    text: TestSummary;
  };
}

interface TestSummary {
  filesProcessed: number;
  validityRate: number;
  redactionRate: number;
  avgProcessingTime: number;
  edgeCasePassRate: number;
  errors: number;
}

async function runAllTests(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   XASE De-Identification Quality Testing Suite            ║');
  console.log('║   Comprehensive PHI Redaction & Integrity Validation       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const overallStartTime = Date.now();
  
  // Step 1: Create sample datasets
  console.log('📦 Step 1: Creating sample datasets...\n');
  try {
    await createSampleDatasets();
  } catch (error) {
    console.error('Error creating datasets:', error);
    process.exit(1);
  }
  
  // Step 2: Run all tests
  const results: TestResult[] = [];
  
  console.log('\n🧪 Step 2: Running de-identification tests...\n');
  
  // DICOM Tests
  try {
    const dicomResult = await runDICOMTests();
    results.push(dicomResult);
  } catch (error) {
    console.error('DICOM tests failed:', error);
  }
  
  // FHIR Tests
  try {
    const fhirResult = await runFHIRTests();
    results.push(fhirResult);
  } catch (error) {
    console.error('FHIR tests failed:', error);
  }
  
  // Text Tests
  try {
    const textResult = await runTextTests();
    results.push(textResult);
  } catch (error) {
    console.error('Text tests failed:', error);
  }
  
  const overallEndTime = Date.now();
  
  // Step 3: Generate comprehensive report
  console.log('\n📊 Step 3: Generating comprehensive report...\n');
  
  const report = generateComprehensiveReport(results, overallStartTime, overallEndTime);
  
  // Save report
  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const reportPath = path.join(outputDir, 'comprehensive-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  const summaryPath = path.join(outputDir, 'test-summary.txt');
  fs.writeFileSync(summaryPath, generateTextSummary(report));
  
  // Print final summary
  printFinalSummary(report);
  
  console.log(`\n✅ All tests completed!`);
  console.log(`📄 Full report saved to: ${reportPath}`);
  console.log(`📄 Summary saved to: ${summaryPath}`);
  console.log('');
}

function generateComprehensiveReport(
  results: TestResult[],
  startTime: number,
  endTime: number
): ComprehensiveReport {
  const totalFilesProcessed = results.reduce((sum, r) => sum + r.filesProcessed, 0);
  const totalFilesValid = results.reduce((sum, r) => sum + r.filesValid, 0);
  const totalPHIDetected = results.reduce((sum, r) => sum + r.phiDetected, 0);
  const totalPHIRedacted = results.reduce((sum, r) => sum + r.phiRedacted, 0);
  
  const dicomResult = results.find(r => r.dataType === 'dicom');
  const fhirResult = results.find(r => r.dataType === 'fhir');
  const textResult = results.find(r => r.dataType === 'text');
  
  return {
    timestamp: new Date(),
    totalTests: results.length,
    totalFilesProcessed,
    totalFilesValid,
    totalPHIDetected,
    totalPHIRedacted,
    overallRedactionRate: totalPHIDetected > 0 ? (totalPHIRedacted / totalPHIDetected) * 100 : 0,
    totalProcessingTimeMs: endTime - startTime,
    totalMemoryUsageMB: results.reduce((sum, r) => sum + r.memoryUsageMB, 0),
    testResults: results,
    summary: {
      dicom: dicomResult ? createTestSummary(dicomResult) : createEmptySummary(),
      fhir: fhirResult ? createTestSummary(fhirResult) : createEmptySummary(),
      text: textResult ? createTestSummary(textResult) : createEmptySummary()
    }
  };
}

function createTestSummary(result: TestResult): TestSummary {
  const edgeCasesPassed = result.edgeCases.filter(ec => ec.redacted).length;
  
  return {
    filesProcessed: result.filesProcessed,
    validityRate: result.filesProcessed > 0 ? (result.filesValid / result.filesProcessed) * 100 : 0,
    redactionRate: result.phiDetected > 0 ? (result.phiRedacted / result.phiDetected) * 100 : 0,
    avgProcessingTime: result.filesProcessed > 0 ? result.processingTimeMs / result.filesProcessed : 0,
    edgeCasePassRate: result.edgeCases.length > 0 ? (edgeCasesPassed / result.edgeCases.length) * 100 : 0,
    errors: result.errors.length
  };
}

function createEmptySummary(): TestSummary {
  return {
    filesProcessed: 0,
    validityRate: 0,
    redactionRate: 0,
    avgProcessingTime: 0,
    edgeCasePassRate: 0,
    errors: 0
  };
}

function generateTextSummary(report: ComprehensiveReport): string {
  const lines: string[] = [];
  
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  XASE DE-IDENTIFICATION QUALITY TEST SUMMARY');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Test Date: ${report.timestamp.toISOString()}`);
  lines.push('');
  
  lines.push('OVERALL METRICS');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`Total Files Processed:     ${report.totalFilesProcessed}`);
  lines.push(`Total Files Valid:         ${report.totalFilesValid} (${(report.totalFilesValid / report.totalFilesProcessed * 100).toFixed(1)}%)`);
  lines.push(`Total PHI Detected:        ${report.totalPHIDetected}`);
  lines.push(`Total PHI Redacted:        ${report.totalPHIRedacted}`);
  lines.push(`Overall Redaction Rate:    ${report.overallRedactionRate.toFixed(1)}%`);
  lines.push(`Total Processing Time:     ${report.totalProcessingTimeMs}ms (${(report.totalProcessingTimeMs / 1000).toFixed(2)}s)`);
  lines.push(`Total Memory Usage:        ${report.totalMemoryUsageMB.toFixed(2)}MB`);
  lines.push('');
  
  lines.push('DICOM RESULTS');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`Files Processed:           ${report.summary.dicom.filesProcessed}`);
  lines.push(`Validity Rate:             ${report.summary.dicom.validityRate.toFixed(1)}%`);
  lines.push(`Redaction Rate:            ${report.summary.dicom.redactionRate.toFixed(1)}%`);
  lines.push(`Avg Processing Time:       ${report.summary.dicom.avgProcessingTime.toFixed(1)}ms`);
  lines.push(`Edge Case Pass Rate:       ${report.summary.dicom.edgeCasePassRate.toFixed(1)}%`);
  lines.push(`Errors:                    ${report.summary.dicom.errors}`);
  lines.push('');
  
  lines.push('FHIR RESULTS');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`Files Processed:           ${report.summary.fhir.filesProcessed}`);
  lines.push(`Validity Rate:             ${report.summary.fhir.validityRate.toFixed(1)}%`);
  lines.push(`Redaction Rate:            ${report.summary.fhir.redactionRate.toFixed(1)}%`);
  lines.push(`Avg Processing Time:       ${report.summary.fhir.avgProcessingTime.toFixed(1)}ms`);
  lines.push(`Edge Case Pass Rate:       ${report.summary.fhir.edgeCasePassRate.toFixed(1)}%`);
  lines.push(`Errors:                    ${report.summary.fhir.errors}`);
  lines.push('');
  
  lines.push('TEXT/CLINICAL NOTES RESULTS');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`Files Processed:           ${report.summary.text.filesProcessed}`);
  lines.push(`Validity Rate:             ${report.summary.text.validityRate.toFixed(1)}%`);
  lines.push(`Redaction Rate:            ${report.summary.text.redactionRate.toFixed(1)}%`);
  lines.push(`Avg Processing Time:       ${report.summary.text.avgProcessingTime.toFixed(1)}ms`);
  lines.push(`Edge Case Pass Rate:       ${report.summary.text.edgeCasePassRate.toFixed(1)}%`);
  lines.push(`Errors:                    ${report.summary.text.errors}`);
  lines.push('');
  
  lines.push('QUALITY ASSESSMENT');
  lines.push('───────────────────────────────────────────────────────────────');
  
  const overallValidity = (report.totalFilesValid / report.totalFilesProcessed) * 100;
  const overallEdgeCases = report.testResults.reduce((sum, r) => {
    const passed = r.edgeCases.filter(ec => ec.redacted).length;
    return sum + (r.edgeCases.length > 0 ? (passed / r.edgeCases.length) * 100 : 0);
  }, 0) / report.testResults.length;
  
  lines.push(`File Integrity:            ${getQualityRating(overallValidity)}`);
  lines.push(`PHI Redaction:             ${getQualityRating(report.overallRedactionRate)}`);
  lines.push(`Edge Case Handling:        ${getQualityRating(overallEdgeCases)}`);
  lines.push('');
  
  lines.push('RECOMMENDATIONS');
  lines.push('───────────────────────────────────────────────────────────────');
  
  if (report.overallRedactionRate < 95) {
    lines.push('⚠ Redaction rate below 95% - review PHI detection patterns');
  }
  if (overallValidity < 95) {
    lines.push('⚠ File validity below 95% - review integrity preservation');
  }
  if (overallEdgeCases < 80) {
    lines.push('⚠ Edge case pass rate below 80% - review complex scenarios');
  }
  
  const totalErrors = report.testResults.reduce((sum, r) => sum + r.errors.length, 0);
  if (totalErrors > 0) {
    lines.push(`⚠ ${totalErrors} errors encountered - review error logs`);
  }
  
  if (report.overallRedactionRate >= 95 && overallValidity >= 95 && overallEdgeCases >= 80 && totalErrors === 0) {
    lines.push('✅ All quality metrics passed - system ready for production');
  }
  
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

function getQualityRating(percentage: number): string {
  if (percentage >= 95) return `EXCELLENT (${percentage.toFixed(1)}%)`;
  if (percentage >= 85) return `GOOD (${percentage.toFixed(1)}%)`;
  if (percentage >= 75) return `ACCEPTABLE (${percentage.toFixed(1)}%)`;
  return `NEEDS IMPROVEMENT (${percentage.toFixed(1)}%)`;
}

function printFinalSummary(report: ComprehensiveReport): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              FINAL TEST SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  console.log('📊 Overall Metrics:');
  console.log(`   Files Processed: ${report.totalFilesProcessed}`);
  console.log(`   Files Valid: ${report.totalFilesValid} (${(report.totalFilesValid / report.totalFilesProcessed * 100).toFixed(1)}%)`);
  console.log(`   PHI Detected: ${report.totalPHIDetected}`);
  console.log(`   PHI Redacted: ${report.totalPHIRedacted}`);
  console.log(`   Redaction Rate: ${report.overallRedactionRate.toFixed(1)}%`);
  console.log('');
  
  console.log('⚡ Performance:');
  console.log(`   Total Time: ${(report.totalProcessingTimeMs / 1000).toFixed(2)}s`);
  console.log(`   Memory Usage: ${report.totalMemoryUsageMB.toFixed(2)}MB`);
  console.log('');
  
  console.log('🎯 Quality Ratings:');
  const overallValidity = (report.totalFilesValid / report.totalFilesProcessed) * 100;
  console.log(`   File Integrity: ${getQualityRating(overallValidity)}`);
  console.log(`   PHI Redaction: ${getQualityRating(report.overallRedactionRate)}`);
  console.log('');
  
  console.log('📋 By Data Type:');
  console.log(`   DICOM:  ${report.summary.dicom.filesProcessed} files, ${report.summary.dicom.redactionRate.toFixed(1)}% redaction`);
  console.log(`   FHIR:   ${report.summary.fhir.filesProcessed} files, ${report.summary.fhir.redactionRate.toFixed(1)}% redaction`);
  console.log(`   Text:   ${report.summary.text.filesProcessed} files, ${report.summary.text.redactionRate.toFixed(1)}% redaction`);
  console.log('');
}

if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runAllTests, generateComprehensiveReport };
