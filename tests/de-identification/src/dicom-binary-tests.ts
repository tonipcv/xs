import * as fs from 'fs';
import * as path from 'path';
import { DICOMBinaryDeidentifier } from './dicom-binary-deidentifier';

async function runDICOMBinaryTests() {
  console.log('\n=== DICOM Binary (.dcm) De-identification Tests ===\n');

  const inputDir = path.join(__dirname, '../data/dicom/images');
  const outputDir = path.join(__dirname, '../output/dicom/binary-deidentified');

  if (!fs.existsSync(inputDir)) {
    console.error(`Input directory not found: ${inputDir}`);
    console.log('Run: npx ts-node src/fetch-real-dicom.ts first');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const dcmFiles = fs.readdirSync(inputDir).filter(f => f.toLowerCase().endsWith('.dcm'));
  
  if (dcmFiles.length === 0) {
    console.error('No .dcm files found in input directory');
    console.log('Run: npx ts-node src/fetch-real-dicom.ts first');
    process.exit(1);
  }

  console.log(`Found ${dcmFiles.length} DICOM file(s)\n`);

  let totalPHI = 0;
  let totalRedacted = 0;
  let successCount = 0;
  let failCount = 0;

  const results: Array<{
    file: string;
    success: boolean;
    phiDetected: number;
    phiRedacted: number;
    redactionRate: number;
    error?: string;
  }> = [];

  for (const file of dcmFiles) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);

    try {
      console.log(`Processing: ${file}`);
      
      const deidentifier = new DICOMBinaryDeidentifier();
      await deidentifier.deidentifyToFile(inputPath, outputPath);
      
      const metrics = deidentifier.getMetrics();
      
      totalPHI += metrics.phiDetected;
      totalRedacted += metrics.phiRedacted;
      successCount++;

      console.log(`  ✓ PHI detected: ${metrics.phiDetected}`);
      console.log(`  ✓ PHI redacted: ${metrics.phiRedacted}`);
      console.log(`  ✓ Redaction rate: ${metrics.redactionRate.toFixed(1)}%`);
      console.log(`  ✓ Output: ${path.relative(process.cwd(), outputPath)}\n`);

      results.push({
        file,
        success: true,
        phiDetected: metrics.phiDetected,
        phiRedacted: metrics.phiRedacted,
        redactionRate: metrics.redactionRate
      });

      // Verify output file exists and has content
      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        throw new Error('Output file is empty');
      }

    } catch (error: any) {
      failCount++;
      console.log(`  ✗ Error: ${error.message}\n`);
      
      results.push({
        file,
        success: false,
        phiDetected: 0,
        phiRedacted: 0,
        redactionRate: 0,
        error: error.message
      });
    }
  }

  console.log('\n=== Summary ===\n');
  console.log(`Total files: ${dcmFiles.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total PHI detected: ${totalPHI}`);
  console.log(`Total PHI redacted: ${totalRedacted}`);
  
  const overallRate = totalPHI > 0 ? (totalRedacted / totalPHI * 100) : 0;
  console.log(`Overall redaction rate: ${overallRate.toFixed(1)}%`);

  // Save detailed report
  const reportPath = path.join(outputDir, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: dcmFiles.length,
      success: successCount,
      failed: failCount,
      totalPHI,
      totalRedacted,
      overallRedactionRate: overallRate
    },
    results
  }, null, 2));

  console.log(`\nDetailed report: ${path.relative(process.cwd(), reportPath)}`);

  if (failCount > 0) {
    console.log('\n⚠️  Some files failed processing. See report for details.');
  } else {
    console.log('\n✅ All files processed successfully!');
  }
}

if (require.main === module) {
  runDICOMBinaryTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runDICOMBinaryTests };
