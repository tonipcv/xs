import * as fs from 'fs';
import * as path from 'path';
import { TextDeidentifier } from './text-deidentifier';
import { DICOMDeidentifier } from './dicom-deidentifier';
import { FHIRDeidentifier } from './fhir-deidentifier';

interface BenchmarkResult {
  testName: string;
  dataType: 'dicom' | 'fhir' | 'text';
  fileCount: number;
  totalSizeBytes: number;
  processingTimeMs: number;
  throughputMBps: number;
  avgTimePerFile: number;
  peakMemoryMB: number;
  phiDetected: number;
  phiRedacted: number;
  errorsEncountered: number;
}

interface StressTestResult {
  concurrentFiles: number;
  totalFiles: number;
  successRate: number;
  avgProcessingTime: number;
  peakMemory: number;
  throughput: number;
}

async function runPerformanceBenchmarks(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        PERFORMANCE BENCHMARKING SUITE                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  const results: BenchmarkResult[] = [];
  
  // Benchmark 1: Small files (< 10KB)
  console.log('📊 Benchmark 1: Small Files Performance...\n');
  results.push(await benchmarkSmallFiles());
  
  // Benchmark 2: Medium files (10-100KB)
  console.log('\n📊 Benchmark 2: Medium Files Performance...\n');
  results.push(await benchmarkMediumFiles());
  
  // Benchmark 3: Large files (> 100KB)
  console.log('\n📊 Benchmark 3: Large Files Performance...\n');
  results.push(await benchmarkLargeFiles());
  
  // Benchmark 4: Batch processing
  console.log('\n📊 Benchmark 4: Batch Processing...\n');
  results.push(await benchmarkBatchProcessing());
  
  // Stress test
  console.log('\n🔥 Stress Test: High Volume Processing...\n');
  const stressResults = await runStressTest();
  
  // Generate report
  generateBenchmarkReport(results, stressResults);
}

async function benchmarkSmallFiles(): Promise<BenchmarkResult> {
  const testFiles = generateTestFiles('small', 50, 5000); // 50 files, ~5KB each
  return await benchmarkFiles(testFiles, 'Small Files (<10KB)', 'text');
}

async function benchmarkMediumFiles(): Promise<BenchmarkResult> {
  const testFiles = generateTestFiles('medium', 20, 50000); // 20 files, ~50KB each
  return await benchmarkFiles(testFiles, 'Medium Files (10-100KB)', 'text');
}

async function benchmarkLargeFiles(): Promise<BenchmarkResult> {
  const testFiles = generateTestFiles('large', 5, 200000); // 5 files, ~200KB each
  return await benchmarkFiles(testFiles, 'Large Files (>100KB)', 'text');
}

async function benchmarkBatchProcessing(): Promise<BenchmarkResult> {
  const testFiles = generateTestFiles('batch', 100, 10000); // 100 files, ~10KB each
  return await benchmarkFiles(testFiles, 'Batch Processing (100 files)', 'text');
}

function generateTestFiles(category: string, count: number, sizeBytes: number): string[] {
  const tempDir = path.join(__dirname, '../data/benchmark', category);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const files: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const content = generateRealisticMedicalText(sizeBytes);
    const filename = `test-${category}-${i.toString().padStart(4, '0')}.txt`;
    const filepath = path.join(tempDir, filename);
    
    fs.writeFileSync(filepath, content);
    files.push(filepath);
  }
  
  return files;
}

function generateRealisticMedicalText(targetSize: number): string {
  const templates = [
    `RADIOLOGY REPORT

Patient: {NAME}
MRN: MRN-{ID}
DOB: {DOB}
Exam Date: {DATE}
Ordering Physician: Dr. {PHYSICIAN}

CLINICAL INDICATION:
{INDICATION}

TECHNIQUE:
{TECHNIQUE}

FINDINGS:
{FINDINGS}

IMPRESSION:
{IMPRESSION}

Electronically signed by Dr. {RADIOLOGIST}, MD
Date: {SIGN_DATE}
{HOSPITAL}
Phone: {PHONE}
`,
    `PROGRESS NOTE

Patient: {NAME}
MRN: MRN-{ID}
DOB: {DOB}
Visit Date: {DATE}
Provider: Dr. {PROVIDER}

CHIEF COMPLAINT:
{COMPLAINT}

HISTORY OF PRESENT ILLNESS:
{HPI}

PAST MEDICAL HISTORY:
{PMH}

MEDICATIONS:
{MEDS}

PHYSICAL EXAMINATION:
{PE}

ASSESSMENT AND PLAN:
{PLAN}

Electronically signed: Dr. {PROVIDER}, MD
{CLINIC}
Date: {SIGN_DATE}
`,
    `DISCHARGE SUMMARY

Patient Name: {NAME}
Medical Record Number: MRN-{ID}
Date of Birth: {DOB}
Social Security Number: {SSN}
Admission Date: {ADM_DATE}
Discharge Date: {DISCH_DATE}
Attending Physician: Dr. {ATTENDING}

ADMISSION DIAGNOSIS:
{ADM_DX}

DISCHARGE DIAGNOSIS:
{DISCH_DX}

HOSPITAL COURSE:
{COURSE}

DISCHARGE MEDICATIONS:
{MEDS}

FOLLOW-UP:
{FOLLOWUP}

Patient discharged home on {DISCH_DATE}.
Home address: {ADDRESS}
Home phone: {PHONE}

Electronically signed: Dr. {ATTENDING}, MD
Date: {SIGN_DATE}
`
  ];
  
  let content = '';
  
  while (content.length < targetSize) {
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    const filled = template
      .replace(/{NAME}/g, generateName())
      .replace(/{ID}/g, generateID())
      .replace(/{DOB}/g, generateDate())
      .replace(/{DATE}/g, generateDate())
      .replace(/{ADM_DATE}/g, generateDate())
      .replace(/{DISCH_DATE}/g, generateDate())
      .replace(/{SIGN_DATE}/g, generateDate())
      .replace(/{SSN}/g, generateSSN())
      .replace(/{PHONE}/g, generatePhone())
      .replace(/{ADDRESS}/g, generateAddress())
      .replace(/{PHYSICIAN}/g, generatePhysicianName())
      .replace(/{PROVIDER}/g, generatePhysicianName())
      .replace(/{RADIOLOGIST}/g, generatePhysicianName())
      .replace(/{ATTENDING}/g, generatePhysicianName())
      .replace(/{HOSPITAL}/g, generateHospital())
      .replace(/{CLINIC}/g, generateClinic())
      .replace(/{INDICATION}/g, generateIndication())
      .replace(/{TECHNIQUE}/g, generateTechnique())
      .replace(/{FINDINGS}/g, generateFindings())
      .replace(/{IMPRESSION}/g, generateImpression())
      .replace(/{COMPLAINT}/g, generateComplaint())
      .replace(/{HPI}/g, generateHPI())
      .replace(/{PMH}/g, generatePMH())
      .replace(/{MEDS}/g, generateMeds())
      .replace(/{PE}/g, generatePE())
      .replace(/{PLAN}/g, generatePlan())
      .replace(/{ADM_DX}/g, generateDiagnosis())
      .replace(/{DISCH_DX}/g, generateDiagnosis())
      .replace(/{COURSE}/g, generateCourse())
      .replace(/{FOLLOWUP}/g, generateFollowup());
    
    content += filled + '\n\n';
  }
  
  return content.substring(0, targetSize);
}

function generateName(): string {
  const first = ['John', 'Mary', 'James', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda'];
  const middle = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const last = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
  
  return `${first[Math.floor(Math.random() * first.length)]} ${middle[Math.floor(Math.random() * middle.length)]}. ${last[Math.floor(Math.random() * last.length)]}`;
}

function generatePhysicianName(): string {
  const names = ['Anderson', 'Thompson', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee'];
  return names[Math.floor(Math.random() * names.length)];
}

function generateID(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSSN(): string {
  return `${Math.floor(100 + Math.random() * 900)}-${Math.floor(10 + Math.random() * 90)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generatePhone(): string {
  return `${Math.floor(200 + Math.random() * 800)}-555-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generateDate(): string {
  const month = Math.floor(1 + Math.random() * 12);
  const day = Math.floor(1 + Math.random() * 28);
  const year = 2020 + Math.floor(Math.random() * 5);
  return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
}

function generateAddress(): string {
  const number = Math.floor(100 + Math.random() * 9900);
  const streets = ['Main St', 'Oak Ave', 'Elm Rd', 'Maple Dr', 'Pine Ln'];
  const cities = ['Boston', 'Cambridge', 'Somerville', 'Brookline', 'Newton'];
  const street = streets[Math.floor(Math.random() * streets.length)];
  const city = cities[Math.floor(Math.random() * cities.length)];
  const zip = Math.floor(10000 + Math.random() * 90000);
  
  return `${number} ${street}, ${city}, MA ${zip}`;
}

function generateHospital(): string {
  const names = ['General Hospital', 'Medical Center', 'Regional Hospital', 'Community Hospital'];
  return names[Math.floor(Math.random() * names.length)];
}

function generateClinic(): string {
  const names = ['Family Practice', 'Primary Care', 'Internal Medicine', 'Health Center'];
  return names[Math.floor(Math.random() * names.length)];
}

function generateIndication(): string {
  return 'Chest pain, rule out pneumonia';
}

function generateTechnique(): string {
  return 'Frontal and lateral chest radiographs were obtained.';
}

function generateFindings(): string {
  return 'The heart size is normal. The lungs are clear without focal consolidation, pleural effusion, or pneumothorax.';
}

function generateImpression(): string {
  return 'No acute cardiopulmonary process.';
}

function generateComplaint(): string {
  return 'Annual physical examination';
}

function generateHPI(): string {
  return 'Patient presents for routine follow-up. Reports feeling well overall with no acute complaints.';
}

function generatePMH(): string {
  return '- Hypertension\n- Type 2 Diabetes\n- Hyperlipidemia';
}

function generateMeds(): string {
  return '- Lisinopril 10mg daily\n- Metformin 500mg twice daily\n- Atorvastatin 20mg daily';
}

function generatePE(): string {
  return 'Vital Signs: BP 120/80, HR 72, Temp 98.6°F\nGeneral: Well-appearing, no acute distress';
}

function generatePlan(): string {
  return 'Continue current medications. Follow up in 3 months.';
}

function generateDiagnosis(): string {
  return 'Acute myocardial infarction';
}

function generateCourse(): string {
  return 'Patient underwent successful cardiac catheterization with stent placement. Post-procedure course was uncomplicated.';
}

function generateFollowup(): string {
  return 'Cardiology clinic in 2 weeks';
}

async function benchmarkFiles(files: string[], testName: string, dataType: 'dicom' | 'fhir' | 'text'): Promise<BenchmarkResult> {
  const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  let peakMemory = startMemory;
  
  const totalSize = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  
  const startTime = Date.now();
  
  let phiDetected = 0;
  let phiRedacted = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      const deidentifier = new TextDeidentifier();
      const result = await deidentifier.deidentify(file);
      
      const metrics = deidentifier.getMetrics();
      phiDetected += metrics.phiDetected;
      phiRedacted += metrics.phiRedacted;
      
      const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      peakMemory = Math.max(peakMemory, currentMemory);
    } catch (error) {
      errors++;
    }
  }
  
  const endTime = Date.now();
  const processingTime = endTime - startTime;
  
  const throughput = (totalSize / 1024 / 1024) / (processingTime / 1000);
  
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Total size: ${(totalSize / 1024).toFixed(2)} KB`);
  console.log(`  Processing time: ${processingTime}ms`);
  console.log(`  Throughput: ${throughput.toFixed(2)} MB/s`);
  console.log(`  Avg time/file: ${(processingTime / files.length).toFixed(2)}ms`);
  console.log(`  Peak memory: ${peakMemory.toFixed(2)} MB`);
  console.log(`  PHI detected: ${phiDetected}`);
  console.log(`  PHI redacted: ${phiRedacted}`);
  console.log(`  Errors: ${errors}`);
  
  return {
    testName,
    dataType,
    fileCount: files.length,
    totalSizeBytes: totalSize,
    processingTimeMs: processingTime,
    throughputMBps: throughput,
    avgTimePerFile: processingTime / files.length,
    peakMemoryMB: peakMemory,
    phiDetected,
    phiRedacted,
    errorsEncountered: errors
  };
}

async function runStressTest(): Promise<StressTestResult[]> {
  const results: StressTestResult[] = [];
  const testSizes = [10, 50, 100, 200];
  
  for (const size of testSizes) {
    console.log(`\n  Testing with ${size} concurrent files...`);
    
    const files = generateTestFiles(`stress-${size}`, size, 10000);
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    
    let successful = 0;
    const promises = files.map(async (file) => {
      try {
        const deidentifier = new TextDeidentifier();
        await deidentifier.deidentify(file);
        successful++;
      } catch (error) {
        // Error handled
      }
    });
    
    await Promise.all(promises);
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    const processingTime = endTime - startTime;
    
    const result: StressTestResult = {
      concurrentFiles: size,
      totalFiles: size,
      successRate: (successful / size) * 100,
      avgProcessingTime: processingTime / size,
      peakMemory: endMemory,
      throughput: (size * 10) / (processingTime / 1000)
    };
    
    results.push(result);
    
    console.log(`    Success rate: ${result.successRate.toFixed(1)}%`);
    console.log(`    Avg time: ${result.avgProcessingTime.toFixed(2)}ms`);
    console.log(`    Peak memory: ${result.peakMemory.toFixed(2)} MB`);
    console.log(`    Throughput: ${result.throughput.toFixed(2)} files/s`);
  }
  
  return results;
}

function generateBenchmarkReport(results: BenchmarkResult[], stressResults: StressTestResult[]): void {
  console.log('\n\n╔════════════════════════════════════════════════════════════╗');
  console.log('║           PERFORMANCE BENCHMARK REPORT                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log('THROUGHPUT ANALYSIS');
  console.log('─'.repeat(60));
  results.forEach(r => {
    console.log(`\n${r.testName}:`);
    console.log(`  Files: ${r.fileCount}`);
    console.log(`  Size: ${(r.totalSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`  Throughput: ${r.throughputMBps.toFixed(2)} MB/s`);
    console.log(`  Avg Time/File: ${r.avgTimePerFile.toFixed(2)}ms`);
    console.log(`  Redaction Rate: ${(r.phiRedacted / r.phiDetected * 100).toFixed(1)}%`);
  });
  
  console.log('\n\nSTRESS TEST RESULTS');
  console.log('─'.repeat(60));
  stressResults.forEach(r => {
    console.log(`\n${r.concurrentFiles} Concurrent Files:`);
    console.log(`  Success Rate: ${r.successRate.toFixed(1)}%`);
    console.log(`  Avg Processing Time: ${r.avgProcessingTime.toFixed(2)}ms`);
    console.log(`  Throughput: ${r.throughput.toFixed(2)} files/s`);
    console.log(`  Peak Memory: ${r.peakMemory.toFixed(2)} MB`);
  });
  
  console.log('\n\nPERFORMANCE SUMMARY');
  console.log('─'.repeat(60));
  
  const avgThroughput = results.reduce((sum, r) => sum + r.throughputMBps, 0) / results.length;
  const avgRedactionRate = results.reduce((sum, r) => sum + (r.phiRedacted / r.phiDetected * 100), 0) / results.length;
  const maxStressSuccess = Math.max(...stressResults.map(r => r.successRate));
  
  console.log(`Average Throughput: ${avgThroughput.toFixed(2)} MB/s`);
  console.log(`Average Redaction Rate: ${avgRedactionRate.toFixed(1)}%`);
  console.log(`Max Concurrent Files (100% success): ${stressResults.find(r => r.successRate === 100)?.concurrentFiles || 'N/A'}`);
  console.log(`Highest Stress Test Success: ${maxStressSuccess.toFixed(1)}%`);
  
  console.log('\n' + '═'.repeat(60) + '\n');
  
  // Save detailed report
  const reportDir = path.join(__dirname, '../output');
  const reportPath = path.join(reportDir, 'performance-benchmark.json');
  
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    benchmarks: results,
    stressTests: stressResults,
    summary: {
      avgThroughput,
      avgRedactionRate,
      maxStressSuccess
    }
  }, null, 2));
  
  console.log(`📄 Detailed report saved to: ${reportPath}\n`);
}

if (require.main === module) {
  runPerformanceBenchmarks().catch(console.error);
}

export { runPerformanceBenchmarks };
export type { BenchmarkResult, StressTestResult };
