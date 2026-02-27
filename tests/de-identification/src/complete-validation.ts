import * as fs from 'fs';
import * as path from 'path';
import { DICOMBinaryDeidentifier } from './dicom-binary-deidentifier';
import { FHIRDeidentifier } from './fhir-deidentifier';
import { TextDeidentifier } from './text-deidentifier';
import { HL7Deidentifier } from './hl7-deidentifier';
import { AudioDeidentifier } from './audio-deidentifier';

interface ValidationResult {
  component: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

async function runCompleteValidation() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     XASE De-Identification - Complete Validation          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const results: ValidationResult[] = [];

  // 1. Check Dependencies
  console.log('📦 Validating Dependencies...');
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const requiredDeps = ['dicom-parser', 'express', 'fhir', 'multer'];
    const missing = requiredDeps.filter(dep => !pkg.dependencies[dep]);
    
    if (missing.length === 0) {
      results.push({
        component: 'Dependencies',
        status: 'pass',
        message: 'All required dependencies installed'
      });
      console.log('  ✓ All dependencies present\n');
    } else {
      results.push({
        component: 'Dependencies',
        status: 'fail',
        message: `Missing dependencies: ${missing.join(', ')}`
      });
      console.log(`  ✗ Missing: ${missing.join(', ')}\n`);
    }
  } catch (error: any) {
    results.push({
      component: 'Dependencies',
      status: 'fail',
      message: error.message
    });
    console.log(`  ✗ Error: ${error.message}\n`);
  }

  // 2. Check Data Directories
  console.log('📁 Validating Data Directories...');
  const requiredDirs = [
    'data/dicom/images',
    'data/fhir',
    'data/text',
    'data/audio',
    'data/hl7',
    'output'
  ];
  
  let dirsOk = true;
  for (const dir of requiredDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).length;
      console.log(`  ✓ ${dir} (${files} items)`);
    } else {
      console.log(`  ⚠️  ${dir} (missing)`);
      dirsOk = false;
    }
  }
  
  results.push({
    component: 'Data Directories',
    status: dirsOk ? 'pass' : 'warning',
    message: dirsOk ? 'All directories present' : 'Some directories missing'
  });
  console.log('');

  // 3. Test DICOM Binary
  console.log('🔬 Testing DICOM Binary Deidentifier...');
  try {
    const dicomDir = 'data/dicom/images';
    if (fs.existsSync(dicomDir)) {
      const dcmFiles = fs.readdirSync(dicomDir).filter(f => f.endsWith('.dcm'));
      if (dcmFiles.length > 0) {
        const deidentifier = new DICOMBinaryDeidentifier();
        const testFile = path.join(dicomDir, dcmFiles[0]);
        const outputPath = 'output/validation/test.dcm';
        
        await deidentifier.deidentifyToFile(testFile, outputPath);
        const metrics = deidentifier.getMetrics();
        
        results.push({
          component: 'DICOM Binary',
          status: metrics.redactionRate === 100 ? 'pass' : 'warning',
          message: `${metrics.phiRedacted}/${metrics.phiDetected} PHI redacted`,
          details: metrics
        });
        console.log(`  ✓ Working: ${metrics.redactionRate.toFixed(1)}% redaction\n`);
      } else {
        results.push({
          component: 'DICOM Binary',
          status: 'warning',
          message: 'No .dcm files to test'
        });
        console.log('  ⚠️  No .dcm files found\n');
      }
    } else {
      results.push({
        component: 'DICOM Binary',
        status: 'warning',
        message: 'DICOM directory not found'
      });
      console.log('  ⚠️  Directory not found\n');
    }
  } catch (error: any) {
    results.push({
      component: 'DICOM Binary',
      status: 'fail',
      message: error.message
    });
    console.log(`  ✗ Error: ${error.message}\n`);
  }

  // 4. Test FHIR
  console.log('🔬 Testing FHIR Deidentifier...');
  try {
    const fhirDir = 'data/fhir';
    if (fs.existsSync(fhirDir)) {
      const fhirFiles = fs.readdirSync(fhirDir).filter(f => f.endsWith('.json'));
      if (fhirFiles.length > 0) {
        const deidentifier = new FHIRDeidentifier();
        const testFile = path.join(fhirDir, fhirFiles[0]);
        
        await deidentifier.deidentify(testFile);
        const metrics = deidentifier.getMetrics();
        
        results.push({
          component: 'FHIR',
          status: metrics.redactionRate === 100 ? 'pass' : 'warning',
          message: `${metrics.phiRedacted}/${metrics.phiDetected} PHI redacted`,
          details: metrics
        });
        console.log(`  ✓ Working: ${metrics.redactionRate.toFixed(1)}% redaction\n`);
      } else {
        results.push({
          component: 'FHIR',
          status: 'warning',
          message: 'No FHIR files to test'
        });
        console.log('  ⚠️  No FHIR files found\n');
      }
    }
  } catch (error: any) {
    results.push({
      component: 'FHIR',
      status: 'fail',
      message: error.message
    });
    console.log(`  ✗ Error: ${error.message}\n`);
  }

  // 5. Test Text
  console.log('🔬 Testing Text Deidentifier...');
  try {
    const textDir = 'data/text';
    if (fs.existsSync(textDir)) {
      const textFiles = fs.readdirSync(textDir).filter(f => f.endsWith('.txt'));
      if (textFiles.length > 0) {
        const deidentifier = new TextDeidentifier();
        const testFile = path.join(textDir, textFiles[0]);
        
        await deidentifier.deidentify(testFile);
        const metrics = deidentifier.getMetrics();
        
        results.push({
          component: 'Text',
          status: metrics.redactionRate >= 95 ? 'pass' : 'warning',
          message: `${metrics.phiRedacted}/${metrics.phiDetected} PHI redacted`,
          details: metrics
        });
        console.log(`  ✓ Working: ${metrics.redactionRate.toFixed(1)}% redaction\n`);
      } else {
        results.push({
          component: 'Text',
          status: 'warning',
          message: 'No text files to test'
        });
        console.log('  ⚠️  No text files found\n');
      }
    }
  } catch (error: any) {
    results.push({
      component: 'Text',
      status: 'fail',
      message: error.message
    });
    console.log(`  ✗ Error: ${error.message}\n`);
  }

  // 6. Test HL7
  console.log('🔬 Testing HL7 Deidentifier...');
  try {
    const hl7Dir = 'data/hl7';
    if (fs.existsSync(hl7Dir)) {
      const hl7Files = fs.readdirSync(hl7Dir).filter(f => f.endsWith('.hl7'));
      if (hl7Files.length > 0) {
        const deidentifier = new HL7Deidentifier();
        const testFile = path.join(hl7Dir, hl7Files[0]);
        
        await deidentifier.deidentify(testFile);
        const metrics = deidentifier.getMetrics();
        
        results.push({
          component: 'HL7',
          status: metrics.redactionRate === 100 ? 'pass' : 'warning',
          message: `${metrics.phiRedacted}/${metrics.phiDetected} PHI redacted`,
          details: metrics
        });
        console.log(`  ✓ Working: ${metrics.redactionRate.toFixed(1)}% redaction\n`);
      } else {
        results.push({
          component: 'HL7',
          status: 'warning',
          message: 'No HL7 files to test'
        });
        console.log('  ⚠️  No HL7 files found\n');
      }
    }
  } catch (error: any) {
    results.push({
      component: 'HL7',
      status: 'fail',
      message: error.message
    });
    console.log(`  ✗ Error: ${error.message}\n`);
  }

  // 7. Check Documentation
  console.log('📚 Validating Documentation...');
  const requiredDocs = [
    'README.md',
    'QUICK_START.md',
    'SYSTEM_OVERVIEW.md',
    'DICOM_BINARY_GUIDE.md',
    'API_DOCUMENTATION.md',
    'FINAL_REPORT.md'
  ];
  
  let docsOk = true;
  for (const doc of requiredDocs) {
    if (fs.existsSync(doc)) {
      const size = fs.statSync(doc).size;
      console.log(`  ✓ ${doc} (${(size / 1024).toFixed(1)} KB)`);
    } else {
      console.log(`  ✗ ${doc} (missing)`);
      docsOk = false;
    }
  }
  
  results.push({
    component: 'Documentation',
    status: docsOk ? 'pass' : 'fail',
    message: docsOk ? 'All key documents present' : 'Some documents missing'
  });
  console.log('');

  // 8. Check Scripts
  console.log('🔧 Validating Scripts...');
  const requiredScripts = [
    'scripts/build-docker.sh',
    'scripts/deploy-k8s.sh',
    'scripts/test-api.sh'
  ];
  
  let scriptsOk = true;
  for (const script of requiredScripts) {
    if (fs.existsSync(script)) {
      console.log(`  ✓ ${script}`);
    } else {
      console.log(`  ✗ ${script} (missing)`);
      scriptsOk = false;
    }
  }
  
  results.push({
    component: 'Scripts',
    status: scriptsOk ? 'pass' : 'warning',
    message: scriptsOk ? 'All scripts present' : 'Some scripts missing'
  });
  console.log('');

  // Summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                  Validation Summary                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.status === 'pass').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const total = results.length;

  console.log(`Total Checks:  ${total}`);
  console.log(`Passed:        ${passed} ✓`);
  console.log(`Warnings:      ${warnings} ⚠️`);
  console.log(`Failed:        ${failed} ✗`);
  console.log('');

  // Results by status
  if (passed > 0) {
    console.log('✅ Passed:');
    results.filter(r => r.status === 'pass').forEach(r => {
      console.log(`   - ${r.component}: ${r.message}`);
    });
    console.log('');
  }

  if (warnings > 0) {
    console.log('⚠️  Warnings:');
    results.filter(r => r.status === 'warning').forEach(r => {
      console.log(`   - ${r.component}: ${r.message}`);
    });
    console.log('');
  }

  if (failed > 0) {
    console.log('❌ Failed:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`   - ${r.component}: ${r.message}`);
    });
    console.log('');
  }

  // Save report
  const reportPath = 'output/validation/complete-validation-report.json';
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total,
      passed,
      warnings,
      failed,
      passRate: (passed / total * 100).toFixed(1) + '%'
    },
    results
  }, null, 2));

  console.log(`Report saved: ${reportPath}\n`);

  // Overall status
  if (failed === 0 && warnings === 0) {
    console.log('✅ System is fully operational and ready for production!\n');
    process.exit(0);
  } else if (failed === 0) {
    console.log('⚠️  System is operational with minor warnings.\n');
    process.exit(0);
  } else {
    console.log('❌ System has critical issues that need attention.\n');
    process.exit(1);
  }
}

if (require.main === module) {
  runCompleteValidation().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runCompleteValidation };
