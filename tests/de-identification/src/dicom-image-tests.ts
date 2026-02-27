import * as fs from 'fs';
import * as path from 'path';
import * as dicomParser from 'dicom-parser';

interface ImageTestResult {
  file: string;
  valid: boolean;
  rows?: number;
  cols?: number;
  bitsAllocated?: number;
  samplesPerPixel?: number;
  pixelDataLength?: number;
  expectedLength?: number;
  errors: string[];
}

function readUInt(dataSet: dicomParser.DataSet, tag: string): number | undefined {
  const el = dataSet.elements[tag];
  if (!el) return undefined;
  try {
    return dataSet.uint16(tag);
  } catch {
    try {
      return dataSet.intString(tag);
    } catch {
      return undefined;
    }
  }
}

function getIntString(dataSet: dicomParser.DataSet, tag: string): number | undefined {
  const el = dataSet.elements[tag];
  if (!el) return undefined;
  try {
    const txt = dataSet.string(tag);
    if (!txt) return undefined;
    const n = parseInt(txt, 10);
    return isNaN(n) ? undefined : n;
  } catch {
    return undefined;
  }
}

export async function runDicomImageTests(): Promise<void> {
  console.log('\n=== DICOM Image (.dcm) Validation ===');
  const dir = path.join(__dirname, '../data/dicom/images');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.dcm'));
  console.log(`Found ${files.length} DICOM image(s) in ${path.relative(process.cwd(), dir)}`);

  const results: ImageTestResult[] = [];

  for (const file of files) {
    const fp = path.join(dir, file);
    const errors: string[] = [];

    try {
      const buffer = fs.readFileSync(fp);
      const byteArray = new Uint8Array(buffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      // Core attributes
      const rows = getIntString(dataSet, 'x00280010') ?? readUInt(dataSet, 'x00280010');
      const cols = getIntString(dataSet, 'x00280011') ?? readUInt(dataSet, 'x00280011');
      const bitsAllocated = getIntString(dataSet, 'x00280100') ?? readUInt(dataSet, 'x00280100');
      const samplesPerPixel = getIntString(dataSet, 'x00280002') ?? readUInt(dataSet, 'x00280002') ?? 1;

      if (!rows || !cols) errors.push('Missing Rows (0028,0010) or Columns (0028,0011)');
      if (!bitsAllocated) errors.push('Missing BitsAllocated (0028,0100)');

      const pixelEl = dataSet.elements['x7fe00010']; // PixelData
      if (!pixelEl) errors.push('Missing PixelData (7FE0,0010)');

      let expectedLength: number | undefined;
      if (rows && cols && bitsAllocated) {
        const bytesPerSample = bitsAllocated / 8;
        expectedLength = rows * cols * (samplesPerPixel || 1) * bytesPerSample;
      }

      const pixelDataLength = pixelEl ? pixelEl.length : undefined;

      if (expectedLength && pixelDataLength && pixelDataLength < expectedLength) {
        errors.push(`PixelData shorter than expected (${pixelDataLength} < ${expectedLength})`);
      }

      results.push({
        file,
        valid: errors.length === 0,
        rows,
        cols,
        bitsAllocated,
        samplesPerPixel,
        pixelDataLength,
        expectedLength,
        errors
      });
    } catch (e: any) {
      errors.push(`Parser error: ${e?.message || String(e)}`);
      results.push({ file, valid: false, errors });
    }
  }

  // Print summary
  let validCount = 0;
  for (const r of results) {
    if (r.valid) validCount++;
    console.log(`\n- ${r.file}: ${r.valid ? '✓ VALID' : '✗ INVALID'}`);
    if (r.rows && r.cols) console.log(`  Dimensions: ${r.rows} x ${r.cols}, Samples/Pixel: ${r.samplesPerPixel}`);
    if (r.pixelDataLength !== undefined) console.log(`  PixelData length: ${r.pixelDataLength}${r.expectedLength ? ` (expected ≥ ${r.expectedLength})` : ''}`);
    if (r.errors.length > 0) {
      console.log('  Errors:');
      r.errors.forEach(err => console.log(`    - ${err}`));
    }
  }

  console.log(`\nSummary: ${validCount}/${results.length} images valid`);
  console.log('Place real .dcm files in tests/de-identification/data/dicom/images and re-run.');
}

if (require.main === module) {
  runDicomImageTests().catch(console.error);
}
