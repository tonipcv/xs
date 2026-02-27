# De-Identification Testing Suite - Usage Guide

## Quick Start

### Installation

```bash
cd tests/de-identification
npm install
```

### Run All Tests

```bash
npm run test:all
```

This will:
1. Generate sample datasets (DICOM, FHIR, clinical text)
2. Run de-identification on all data types
3. Validate file integrity
4. Generate comprehensive reports

### Run Individual Test Suites

```bash
# DICOM tests only
npm run test:dicom

# FHIR tests only
npm run test:fhir

# Clinical text tests only
npm run test:text
```

### Advanced Testing

```bash
# Edge case testing
npx ts-node src/advanced-edge-cases.ts

# Performance benchmarking
npx ts-node src/performance-benchmark.ts

# Download real public datasets (requires credentials)
npm run download:datasets
```

## Test Output

### Reports Generated

All reports are saved to `output/` directory:

- **comprehensive-report.json** - Complete test results with all metrics
- **test-summary.txt** - Human-readable summary
- **performance-benchmark.json** - Performance metrics
- **{datatype}/deidentified_*.{json,txt}** - De-identified files
- **{datatype}/redaction_map_*.{json,txt}** - PHI redaction mappings

### Understanding Results

#### Redaction Rate
Percentage of detected PHI that was successfully redacted.
- **Target:** ≥95%
- **Excellent:** ≥98%
- **Good:** 95-97%
- **Needs Improvement:** <95%

#### File Integrity
Percentage of files that remain valid after de-identification.
- **Target:** ≥90%
- **Excellent:** ≥95%
- **Good:** 90-94%
- **Needs Improvement:** <90%

#### Edge Case Pass Rate
Percentage of complex scenarios handled correctly.
- **Target:** ≥80%
- **Excellent:** ≥90%
- **Good:** 80-89%
- **Needs Improvement:** <80%

## Using the De-Identification Libraries

### Text De-Identification

```typescript
import { TextDeidentifier } from './src/text-deidentifier';

const deidentifier = new TextDeidentifier();
const result = await deidentifier.deidentify('/path/to/clinical-note.txt');

console.log('PHI detected:', result.phiEntities.length);
console.log('Redaction rate:', deidentifier.getMetrics().redactionRate);
console.log('Valid:', result.integrityValid);

// Access de-identified content
const deidentifiedText = result.deidentified;

// View redaction map
result.redactionMap.forEach((redaction, key) => {
  console.log(`${key}: ${redaction}`);
});
```

### FHIR De-Identification

```typescript
import { FHIRDeidentifier } from './src/fhir-deidentifier';

const deidentifier = new FHIRDeidentifier();
const result = await deidentifier.deidentify('/path/to/patient.json');

const deidentifiedResource = JSON.parse(result.deidentified);
console.log('Resource type:', deidentifiedResource.resourceType);
console.log('Valid FHIR:', result.validationDetails.isValid);
```

### DICOM De-Identification

```typescript
import { DICOMDeidentifier } from './src/dicom-deidentifier';

const deidentifier = new DICOMDeidentifier();
const result = await deidentifier.deidentify('/path/to/dicom-metadata.json');

console.log('Required tags preserved:', result.validationDetails.hasRequiredTags);
console.log('Pixel data intact:', result.validationDetails.pixelDataIntact);
```

## Configuration

### Customizing PHI Detection

Edit the pattern arrays in each deidentifier:

**Text Patterns** (`text-deidentifier.ts`):
```typescript
// Add custom patterns
const customPatterns = [
  /\bCustomID:\s*[A-Z0-9]+/gi
];
```

**DICOM Tags** (`dicom-deidentifier.ts`):
```typescript
// Add additional PHI tags
const PHI_TAGS: Record<string, string> = {
  '00100010': 'Patient Name',
  // Add more tags...
};
```

**FHIR Paths** (`fhir-deidentifier.ts`):
```typescript
// Add custom FHIR paths
const PHI_PATHS: Record<string, string> = {
  'Patient.name': 'NAME',
  // Add more paths...
};
```

## Performance Tuning

### Memory Optimization

For large-scale processing:

```typescript
// Process in batches
const batchSize = 50;
for (let i = 0; i < files.length; i += batchSize) {
  const batch = files.slice(i, i + batchSize);
  await Promise.all(batch.map(file => deidentify(file)));
  
  // Force garbage collection between batches
  if (global.gc) global.gc();
}
```

### Concurrent Processing

```typescript
// Limit concurrency
const limit = 100; // Max concurrent files
const queue = files.map(file => () => deidentifier.deidentify(file));

// Process with concurrency limit
const results = await Promise.all(
  queue.slice(0, limit).map(fn => fn())
);
```

## Troubleshooting

### Common Issues

**Issue:** Low redaction rate
- **Solution:** Check PHI patterns match your data format
- **Action:** Review `output/{datatype}/report_*.json` for missed entities

**Issue:** File validation failures
- **Solution:** Ensure required fields are preserved
- **Action:** Check `validationDetails.errors` in results

**Issue:** High memory usage
- **Solution:** Reduce concurrent file processing
- **Action:** Lower batch size or add garbage collection

**Issue:** Slow processing
- **Solution:** Profile specific file types
- **Action:** Run performance benchmarks to identify bottlenecks

### Debug Mode

Enable detailed logging:

```typescript
// Add to deidentifier
console.log('Processing:', filepath);
console.log('PHI entities:', result.phiEntities);
console.log('Validation:', result.validationDetails);
```

## Best Practices

### 1. Always Validate Results

```typescript
if (!result.integrityValid) {
  console.error('Validation failed:', result.validationDetails.errors);
  // Handle error
}

if (result.phiRedacted < result.phiDetected * 0.95) {
  console.warn('Low redaction rate:', result.phiRedacted / result.phiDetected);
  // Review redaction
}
```

### 2. Maintain Audit Trails

```typescript
// Save redaction map for compliance
const auditLog = {
  timestamp: new Date(),
  file: filepath,
  phiDetected: result.phiEntities.length,
  redactionMap: Array.from(result.redactionMap.entries()),
  validator: 'automated'
};

fs.writeFileSync('audit-log.json', JSON.stringify(auditLog));
```

### 3. Test with Real Data

Before production:
1. Test with representative sample data
2. Manually review de-identified outputs
3. Verify medical content is preserved
4. Check edge cases specific to your use case

### 4. Monitor Production Performance

Track key metrics:
- Redaction rate by file type
- Processing time trends
- Validation failure rate
- Memory usage patterns

## Integration Examples

### Express API Endpoint

```typescript
import express from 'express';
import { TextDeidentifier } from './text-deidentifier';

const app = express();

app.post('/deidentify', async (req, res) => {
  try {
    const deidentifier = new TextDeidentifier();
    const result = await deidentifier.deidentify(req.body.text);
    
    res.json({
      success: true,
      deidentified: result.deidentified,
      metrics: deidentifier.getMetrics(),
      valid: result.integrityValid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Batch Processing Script

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { TextDeidentifier } from './text-deidentifier';

async function processDirectory(inputDir: string, outputDir: string) {
  const files = fs.readdirSync(inputDir);
  const deidentifier = new TextDeidentifier();
  
  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const result = await deidentifier.deidentify(inputPath);
    
    const outputPath = path.join(outputDir, `deidentified_${file}`);
    fs.writeFileSync(outputPath, result.deidentified);
    
    console.log(`✓ Processed ${file}`);
  }
}
```

## Testing Checklist

Before deploying to production:

- [ ] Run full test suite (`npm run test:all`)
- [ ] Review comprehensive report
- [ ] Check redaction rate ≥95%
- [ ] Verify file integrity ≥90%
- [ ] Test edge cases
- [ ] Run performance benchmarks
- [ ] Test with production-like data
- [ ] Manual review of sample outputs
- [ ] Set up monitoring
- [ ] Document any custom patterns added

## Support

For issues or questions:
1. Check `FINAL_VALIDATION_REPORT.md` for known limitations
2. Review test outputs in `output/` directory
3. Run advanced edge case tests for specific scenarios
4. Check performance benchmarks for optimization guidance

## License

This testing suite is part of the XASE platform.
