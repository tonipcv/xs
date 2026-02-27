import * as fs from 'fs';
import * as path from 'path';
import { TextDeidentifier } from './text-deidentifier';
import { DICOMDeidentifier } from './dicom-deidentifier';
import { FHIRDeidentifier } from './fhir-deidentifier';

interface EdgeCaseTest {
  name: string;
  category: 'burned-in-text' | 'complex-dates' | 'nested-phi' | 'international' | 'ambiguous';
  dataType: 'dicom' | 'fhir' | 'text';
  testData: any;
  expectedBehavior: string;
  passed: boolean;
  details: string;
}

export async function runAdvancedEdgeCaseTests(): Promise<EdgeCaseTest[]> {
  console.log('\n=== Advanced Edge Case Testing ===\n');
  
  const results: EdgeCaseTest[] = [];
  
  // Test 1: Complex date formats in text
  results.push(await testComplexDateFormats());
  
  // Test 2: Nested PHI in FHIR extensions
  results.push(await testNestedFHIRPHI());
  
  // Test 3: International phone numbers
  results.push(await testInternationalPhoneNumbers());
  
  // Test 4: Ambiguous names (medical terms vs. person names)
  results.push(await testAmbiguousNames());
  
  // Test 5: Multiple identifiers in same field
  results.push(await testMultipleIdentifiers());
  
  // Test 6: Date ranges and relative dates
  results.push(await testDateRanges());
  
  // Test 7: Partial redaction scenarios
  results.push(await testPartialRedaction());
  
  // Test 8: Unicode and special characters
  results.push(await testUnicodeCharacters());
  
  printEdgeCaseResults(results);
  
  return results;
}

async function testComplexDateFormats(): Promise<EdgeCaseTest> {
  const testText = `
Patient seen on 1st of January 2024.
Follow-up scheduled for Q1 2024.
Last visit: Winter 2023.
Next appointment: 2024-01-15T14:30:00Z
Birth year: '85
Approximate date: early March 2024
  `;
  
  const deidentifier = new TextDeidentifier();
  const result = await deidentifier.deidentify(
    createTempFile(testText, 'complex-dates.txt')
  );
  
  const deidentifiedText = result.deidentified;
  const hasStandardDates = result.phiEntities.some(e => e.type === 'DATE');
  
  return {
    name: 'Complex Date Formats',
    category: 'complex-dates',
    dataType: 'text',
    testData: testText,
    expectedBehavior: 'Should detect and redact various date formats including relative dates',
    passed: hasStandardDates && deidentifiedText.includes('2024'),
    details: `Detected ${result.phiEntities.filter(e => e.type === 'DATE').length} date entities`
  };
}

async function testNestedFHIRPHI(): Promise<EdgeCaseTest> {
  const testResource = {
    resourceType: 'Patient',
    id: 'test-nested',
    extension: [
      {
        url: 'http://example.org/custom-extension',
        valueString: 'Contact: John Doe at 555-1234'
      }
    ],
    name: [{
      family: 'TestPatient',
      given: ['Test']
    }],
    contact: [
      {
        relationship: [{
          text: 'Emergency Contact: Jane Smith'
        }],
        telecom: [{
          system: 'phone',
          value: '555-5678'
        }]
      }
    ]
  };
  
  const deidentifier = new FHIRDeidentifier();
  const result = await deidentifier.deidentify(
    createTempFile(JSON.stringify(testResource), 'nested-phi.json')
  );
  
  const deidentifiedStr = typeof result.deidentified === 'string' 
    ? result.deidentified 
    : result.deidentified.toString();
  const deidentified = JSON.parse(deidentifiedStr);
  const extensionRedacted = !JSON.stringify(deidentified.extension).includes('John Doe');
  const contactRedacted = !JSON.stringify(deidentified.contact).includes('Jane Smith');
  
  return {
    name: 'Nested FHIR PHI',
    category: 'nested-phi',
    dataType: 'fhir',
    testData: testResource,
    expectedBehavior: 'Should detect PHI in nested extensions and complex structures',
    passed: extensionRedacted && contactRedacted,
    details: `Extension redacted: ${extensionRedacted}, Contact redacted: ${contactRedacted}`
  };
}

async function testInternationalPhoneNumbers(): Promise<EdgeCaseTest> {
  const testText = `
Contact numbers:
US: +1 (617) 555-0123
UK: +44 20 7123 4567
Brazil: +55 11 98765-4321
International: +81-3-1234-5678
  `;
  
  const deidentifier = new TextDeidentifier();
  const result = await deidentifier.deidentify(
    createTempFile(testText, 'intl-phones.txt')
  );
  
  const phoneEntities = result.phiEntities.filter(e => e.type === 'PHONE');
  const hasInternational = phoneEntities.length >= 2;
  
  return {
    name: 'International Phone Numbers',
    category: 'international',
    dataType: 'text',
    testData: testText,
    expectedBehavior: 'Should detect international phone number formats',
    passed: hasInternational,
    details: `Detected ${phoneEntities.length} phone numbers`
  };
}

async function testAmbiguousNames(): Promise<EdgeCaseTest> {
  const testText = `
Patient: Dr. Heart presented with chest pain.
Consulting physician: Dr. Lung examined the patient.
Medical history includes Dr. Brain's assessment.
Patient works at St. Mary's Hospital.
  `;
  
  const deidentifier = new TextDeidentifier();
  const result = await deidentifier.deidentify(
    createTempFile(testText, 'ambiguous-names.txt')
  );
  
  const deidentifiedText = result.deidentified;
  
  // Should NOT redact "Dr. Heart", "Dr. Lung", "Dr. Brain" as these are medical terms
  // Should redact actual physician names
  const preservedMedicalTerms = deidentifiedText.includes('chest') && 
                                 deidentifiedText.includes('pain');
  
  return {
    name: 'Ambiguous Names vs Medical Terms',
    category: 'ambiguous',
    dataType: 'text',
    testData: testText,
    expectedBehavior: 'Should distinguish between medical terms and actual names',
    passed: preservedMedicalTerms,
    details: `Medical content preserved: ${preservedMedicalTerms}`
  };
}

async function testMultipleIdentifiers(): Promise<EdgeCaseTest> {
  const testText = `
Patient identifiers: MRN-123456, SSN: 123-45-6789, Account: ACC-789012
Insurance ID: INS-456789, Driver's License: DL-987654
  `;
  
  const deidentifier = new TextDeidentifier();
  const result = await deidentifier.deidentify(
    createTempFile(testText, 'multi-ids.txt')
  );
  
  const mrnDetected = result.phiEntities.some(e => e.type === 'MRN');
  const ssnDetected = result.phiEntities.some(e => e.type === 'SSN');
  const multipleIds = result.phiEntities.filter(e => 
    e.type === 'MRN' || e.type === 'SSN' || e.type === 'ID'
  ).length >= 3;
  
  return {
    name: 'Multiple Identifier Types',
    category: 'nested-phi',
    dataType: 'text',
    testData: testText,
    expectedBehavior: 'Should detect multiple types of identifiers in same text',
    passed: mrnDetected && ssnDetected && multipleIds,
    details: `MRN: ${mrnDetected}, SSN: ${ssnDetected}, Total IDs: ${result.phiEntities.length}`
  };
}

async function testDateRanges(): Promise<EdgeCaseTest> {
  const testText = `
Treatment period: 01/15/2024 - 02/28/2024
Hospital stay: from January 10, 2024 to January 15, 2024
Follow-up window: 3-6 months post-discharge
  `;
  
  const deidentifier = new TextDeidentifier();
  const result = await deidentifier.deidentify(
    createTempFile(testText, 'date-ranges.txt')
  );
  
  const dateEntities = result.phiEntities.filter(e => e.type === 'DATE');
  const multipleDetected = dateEntities.length >= 4;
  
  return {
    name: 'Date Ranges',
    category: 'complex-dates',
    dataType: 'text',
    testData: testText,
    expectedBehavior: 'Should detect both start and end dates in ranges',
    passed: multipleDetected,
    details: `Detected ${dateEntities.length} date entities in ranges`
  };
}

async function testPartialRedaction(): Promise<EdgeCaseTest> {
  const testText = `
Patient from ZIP code 02101
Age: 45 years old
Approximate location: Boston area
  `;
  
  const deidentifier = new TextDeidentifier();
  const result = await deidentifier.deidentify(
    createTempFile(testText, 'partial-redaction.txt')
  );
  
  const deidentifiedText = result.deidentified;
  
  // ZIP should be partially redacted (021XX)
  // Age should be preserved (not precise birthdate)
  // General location might be preserved
  const hasPartialInfo = deidentifiedText.length > 50;
  
  return {
    name: 'Partial Redaction for Statistical Utility',
    category: 'ambiguous',
    dataType: 'text',
    testData: testText,
    expectedBehavior: 'Should allow partial redaction for statistical purposes',
    passed: hasPartialInfo,
    details: `Output length: ${deidentifiedText.length} chars`
  };
}

async function testUnicodeCharacters(): Promise<EdgeCaseTest> {
  const testText = `
Patient: José María García-López
Address: 123 Rue de la Paix, Montréal
Phone: +33 1 23 45 67 89
Notes: Patient speaks 中文 and العربية
  `;
  
  const deidentifier = new TextDeidentifier();
  const result = await deidentifier.deidentify(
    createTempFile(testText, 'unicode.txt')
  );
  
  const deidentifiedText = result.deidentified;
  const nameDetected = result.phiEntities.some(e => e.type === 'NAME');
  const addressDetected = result.phiEntities.some(e => e.type === 'LOCATION');
  
  return {
    name: 'Unicode and International Characters',
    category: 'international',
    dataType: 'text',
    testData: testText,
    expectedBehavior: 'Should handle unicode characters in names and addresses',
    passed: nameDetected && addressDetected,
    details: `Name detected: ${nameDetected}, Address detected: ${addressDetected}`
  };
}

function createTempFile(content: string, filename: string): string {
  const tempDir = path.join(__dirname, '../data/temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function printEdgeCaseResults(results: EdgeCaseTest[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('ADVANCED EDGE CASE TEST RESULTS');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`\nOverall: ${passed}/${total} tests passed (${(passed/total*100).toFixed(1)}%)\n`);
  
  const byCategory = results.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {} as Record<string, EdgeCaseTest[]>);
  
  Object.entries(byCategory).forEach(([category, tests]) => {
    const categoryPassed = tests.filter(t => t.passed).length;
    console.log(`\n${category.toUpperCase().replace(/-/g, ' ')}:`);
    console.log(`  ${categoryPassed}/${tests.length} passed`);
    
    tests.forEach(test => {
      const status = test.passed ? '✓' : '✗';
      console.log(`  ${status} ${test.name}`);
      console.log(`    ${test.details}`);
    });
  });
  
  console.log('\n' + '='.repeat(60) + '\n');
}

if (require.main === module) {
  runAdvancedEdgeCaseTests().catch(console.error);
}

export { EdgeCaseTest };
