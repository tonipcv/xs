import * as fs from 'fs';
import * as path from 'path';
import { DICOMBinaryDeidentifier } from './dicom-binary-deidentifier';
import { FHIRDeidentifier } from './fhir-deidentifier';
import { TextDeidentifier } from './text-deidentifier';
import { HL7Deidentifier } from './hl7-deidentifier';

interface BenchmarkResult {
  format: string;
  fileCount: number;
  totalSize: number;
  totalPHI: number;
  totalRedacted: number;
  totalDuration: number;
  avgDuration: number;
  throughput: number;
  filesPerSecond: number;
  redactionRate: number;
  memoryUsed: number;
}

async function runAdvancedBenchmark() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        XASE De-Identification - Advanced Benchmark        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const results: BenchmarkResult[] = [];
  const startMemory = process.memoryUsage().heapUsed;

  // Benchmark DICOM Binary
  console.log('⚡ Benchmarking DICOM Binary...');
  const dicomDir = 'data/dicom/images';
  if (fs.existsSync(dicomDir)) {
    const dcmFiles = fs.readdirSync(dicomDir).filter(f => f.endsWith('.dcm'));
    
    let totalPHI = 0;
    let totalRedacted = 0;
    let totalSize = 0;
    let totalDuration = 0;
    
    for (const file of dcmFiles) {
      const filePath = path.join(dicomDir, file);
      const fileSize = fs.statSync(filePath).size;
      totalSize += fileSize;
      
      const start = Date.now();
      try {
        const deidentifier = new DICOMBinaryDeidentifier();
        await deidentifier.deidentifyToFile(filePath, `output/benchmark/${file}`);
        const metrics = deidentifier.getMetrics();
        
        totalPHI += metrics.phiDetected;
        totalRedacted += metrics.phiRedacted;
        totalDuration += Date.now() - start;
      } catch (error) {
        console.log(`  ⚠️  Skipped ${file}`);
      }
    }
    
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryUsed = memoryAfter - startMemory;
    
    results.push({
      format: 'DICOM Binary',
      fileCount: dcmFiles.length,
      totalSize,
      totalPHI,
      totalRedacted,
      totalDuration,
      avgDuration: totalDuration / dcmFiles.length,
      throughput: (totalSize / 1024 / 1024) / (totalDuration / 1000),
      filesPerSecond: dcmFiles.length / (totalDuration / 1000),
      redactionRate: totalPHI > 0 ? (totalRedacted / totalPHI * 100) : 0,
      memoryUsed
    });
    
    console.log(`  Files: ${dcmFiles.length}`);
    console.log(`  Size: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`  Duration: ${totalDuration}ms`);
    console.log(`  Throughput: ${((totalSize / 1024 / 1024) / (totalDuration / 1000)).toFixed(2)} MB/s`);
    console.log(`  Files/sec: ${(dcmFiles.length / (totalDuration / 1000)).toFixed(1)}`);
    console.log(`  PHI: ${totalRedacted}/${totalPHI} (${totalPHI > 0 ? (totalRedacted / totalPHI * 100).toFixed(1) : 0}%)`);
    console.log(`  Memory: ${(memoryUsed / 1024 / 1024).toFixed(2)} MB\n`);
  }

  // Benchmark FHIR
  console.log('⚡ Benchmarking FHIR...');
  const fhirDir = 'data/fhir';
  if (fs.existsSync(fhirDir)) {
    const fhirFiles = fs.readdirSync(fhirDir).filter(f => f.endsWith('.json'));
    
    let totalPHI = 0;
    let totalRedacted = 0;
    let totalSize = 0;
    let totalDuration = 0;
    
    for (const file of fhirFiles) {
      const filePath = path.join(fhirDir, file);
      const fileSize = fs.statSync(filePath).size;
      totalSize += fileSize;
      
      const start = Date.now();
      const deidentifier = new FHIRDeidentifier();
      await deidentifier.deidentify(filePath);
      const metrics = deidentifier.getMetrics();
      
      totalPHI += metrics.phiDetected;
      totalRedacted += metrics.phiRedacted;
      totalDuration += Date.now() - start;
    }
    
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryUsed = memoryAfter - startMemory;
    
    results.push({
      format: 'FHIR',
      fileCount: fhirFiles.length,
      totalSize,
      totalPHI,
      totalRedacted,
      totalDuration,
      avgDuration: totalDuration / fhirFiles.length,
      throughput: (totalSize / 1024 / 1024) / (totalDuration / 1000),
      filesPerSecond: fhirFiles.length / (totalDuration / 1000),
      redactionRate: totalPHI > 0 ? (totalRedacted / totalPHI * 100) : 0,
      memoryUsed
    });
    
    console.log(`  Files: ${fhirFiles.length}`);
    console.log(`  Size: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`  Duration: ${totalDuration}ms`);
    console.log(`  Throughput: ${((totalSize / 1024 / 1024) / (totalDuration / 1000)).toFixed(2)} MB/s`);
    console.log(`  Files/sec: ${(fhirFiles.length / (totalDuration / 1000)).toFixed(1)}`);
    console.log(`  PHI: ${totalRedacted}/${totalPHI} (${(totalRedacted / totalPHI * 100).toFixed(1)}%)`);
    console.log(`  Memory: ${(memoryUsed / 1024 / 1024).toFixed(2)} MB\n`);
  }

  // Benchmark Text
  console.log('⚡ Benchmarking Clinical Text...');
  const textDir = 'data/text';
  if (fs.existsSync(textDir)) {
    const textFiles = fs.readdirSync(textDir).filter(f => f.endsWith('.txt'));
    
    let totalPHI = 0;
    let totalRedacted = 0;
    let totalSize = 0;
    let totalDuration = 0;
    
    for (const file of textFiles) {
      const filePath = path.join(textDir, file);
      const fileSize = fs.statSync(filePath).size;
      totalSize += fileSize;
      
      const start = Date.now();
      const deidentifier = new TextDeidentifier();
      await deidentifier.deidentify(filePath);
      const metrics = deidentifier.getMetrics();
      
      totalPHI += metrics.phiDetected;
      totalRedacted += metrics.phiRedacted;
      totalDuration += Date.now() - start;
    }
    
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryUsed = memoryAfter - startMemory;
    
    results.push({
      format: 'Clinical Text',
      fileCount: textFiles.length,
      totalSize,
      totalPHI,
      totalRedacted,
      totalDuration,
      avgDuration: totalDuration / textFiles.length,
      throughput: (totalSize / 1024 / 1024) / (totalDuration / 1000),
      filesPerSecond: textFiles.length / (totalDuration / 1000),
      redactionRate: totalPHI > 0 ? (totalRedacted / totalPHI * 100) : 0,
      memoryUsed
    });
    
    console.log(`  Files: ${textFiles.length}`);
    console.log(`  Size: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`  Duration: ${totalDuration}ms`);
    console.log(`  Throughput: ${((totalSize / 1024 / 1024) / (totalDuration / 1000)).toFixed(2)} MB/s`);
    console.log(`  Files/sec: ${(textFiles.length / (totalDuration / 1000)).toFixed(1)}`);
    console.log(`  PHI: ${totalRedacted}/${totalPHI} (${(totalRedacted / totalPHI * 100).toFixed(1)}%)`);
    console.log(`  Memory: ${(memoryUsed / 1024 / 1024).toFixed(2)} MB\n`);
  }

  // Benchmark HL7
  console.log('⚡ Benchmarking HL7 v2...');
  const hl7Dir = 'data/hl7';
  if (fs.existsSync(hl7Dir)) {
    const hl7Files = fs.readdirSync(hl7Dir).filter(f => f.endsWith('.hl7'));
    
    let totalPHI = 0;
    let totalRedacted = 0;
    let totalSize = 0;
    let totalDuration = 0;
    
    for (const file of hl7Files) {
      const filePath = path.join(hl7Dir, file);
      const fileSize = fs.statSync(filePath).size;
      totalSize += fileSize;
      
      const start = Date.now();
      const deidentifier = new HL7Deidentifier();
      await deidentifier.deidentify(filePath);
      const metrics = deidentifier.getMetrics();
      
      totalPHI += metrics.phiDetected;
      totalRedacted += metrics.phiRedacted;
      totalDuration += Date.now() - start;
    }
    
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryUsed = memoryAfter - startMemory;
    
    results.push({
      format: 'HL7 v2',
      fileCount: hl7Files.length,
      totalSize,
      totalPHI,
      totalRedacted,
      totalDuration,
      avgDuration: totalDuration / hl7Files.length,
      throughput: (totalSize / 1024 / 1024) / (totalDuration / 1000),
      filesPerSecond: hl7Files.length / (totalDuration / 1000),
      redactionRate: totalPHI > 0 ? (totalRedacted / totalPHI * 100) : 0,
      memoryUsed
    });
    
    console.log(`  Files: ${hl7Files.length}`);
    console.log(`  Size: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`  Duration: ${totalDuration}ms`);
    console.log(`  Throughput: ${((totalSize / 1024 / 1024) / (totalDuration / 1000)).toFixed(2)} MB/s`);
    console.log(`  Files/sec: ${(hl7Files.length / (totalDuration / 1000)).toFixed(1)}`);
    console.log(`  PHI: ${totalRedacted}/${totalPHI} (${(totalRedacted / totalPHI * 100).toFixed(1)}%)`);
    console.log(`  Memory: ${(memoryUsed / 1024 / 1024).toFixed(2)} MB\n`);
  }

  // Summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Benchmark Summary                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const totalFiles = results.reduce((sum, r) => sum + r.fileCount, 0);
  const totalPHI = results.reduce((sum, r) => sum + r.totalPHI, 0);
  const totalRedacted = results.reduce((sum, r) => sum + r.totalRedacted, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.totalDuration, 0);
  const totalSize = results.reduce((sum, r) => sum + r.totalSize, 0);
  const avgMemory = results.reduce((sum, r) => sum + r.memoryUsed, 0) / results.length;

  console.log(`Total Files:           ${totalFiles}`);
  console.log(`Total Size:            ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total Duration:        ${totalDuration}ms`);
  console.log(`Total PHI:             ${totalRedacted}/${totalPHI} (${(totalRedacted / totalPHI * 100).toFixed(1)}%)`);
  console.log(`Overall Throughput:    ${((totalSize / 1024 / 1024) / (totalDuration / 1000)).toFixed(2)} MB/s`);
  console.log(`Overall Files/sec:     ${(totalFiles / (totalDuration / 1000)).toFixed(1)}`);
  console.log(`Average Memory:        ${(avgMemory / 1024 / 1024).toFixed(2)} MB`);
  console.log('');

  // Performance comparison table
  console.log('📊 Performance by Format:\n');
  console.log('Format          | Files | Avg Time | Files/s | Redaction | Memory');
  console.log('----------------|-------|----------|---------|-----------|--------');
  
  for (const result of results) {
    const format = result.format.padEnd(15);
    const files = String(result.fileCount).padEnd(5);
    const avgTime = `${result.avgDuration.toFixed(1)}ms`.padEnd(8);
    const filesPerSec = result.filesPerSecond.toFixed(1).padEnd(7);
    const redaction = `${result.redactionRate.toFixed(1)}%`.padEnd(9);
    const memory = `${(result.memoryUsed / 1024 / 1024).toFixed(1)}MB`;
    
    console.log(`${format} | ${files} | ${avgTime} | ${filesPerSec} | ${redaction} | ${memory}`);
  }
  console.log('');

  // Save report
  const reportPath = 'output/benchmark/advanced-benchmark-report.json';
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles,
      totalSize,
      totalPHI,
      totalRedacted,
      totalDuration,
      overallThroughput: (totalSize / 1024 / 1024) / (totalDuration / 1000),
      overallFilesPerSecond: totalFiles / (totalDuration / 1000),
      overallRedactionRate: (totalRedacted / totalPHI * 100),
      averageMemory: avgMemory
    },
    results
  }, null, 2));

  console.log(`Detailed report saved: ${reportPath}\n`);
  console.log('✅ Benchmark complete!\n');
}

if (require.main === module) {
  runAdvancedBenchmark().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runAdvancedBenchmark };
