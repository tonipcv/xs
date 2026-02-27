import * as fs from 'fs';
import * as path from 'path';
import * as dicomParser from 'dicom-parser';

type VR = 'PN' | 'LO' | 'SH' | 'ST' | 'LT' | 'DA' | 'TM' | 'DT' | 'UI' | 'AS' | 'CS' | 'DS' | 'IS' | 'US' | 'UN';

interface DICOMTagJson {
  vr: VR | string;
  Value: any[];
}

interface DICOMJson {
  [tag: string]: DICOMTagJson;
}

const TAGS: Array<{ tag: string; vr: VR; type: 'string' | 'int' }>= [
  { tag: 'x00080016', vr: 'UI', type: 'string' }, // SOP Class UID
  { tag: 'x00080018', vr: 'UI', type: 'string' }, // SOP Instance UID
  { tag: 'x00080020', vr: 'DA', type: 'string' }, // Study Date
  { tag: 'x00080030', vr: 'TM', type: 'string' }, // Study Time
  { tag: 'x00081030', vr: 'LO', type: 'string' }, // Study Description
  { tag: 'x00100010', vr: 'PN', type: 'string' }, // Patient Name
  { tag: 'x00100020', vr: 'LO', type: 'string' }, // Patient ID
  { tag: 'x00100030', vr: 'DA', type: 'string' }, // Patient Birth Date
  { tag: 'x00100040', vr: 'CS', type: 'string' }, // Patient Sex
  { tag: 'x0020000d', vr: 'UI', type: 'string' }, // Study Instance UID
  { tag: 'x0020000e', vr: 'UI', type: 'string' }, // Series Instance UID
  { tag: 'x00200011', vr: 'IS', type: 'int' },    // Series Number
  { tag: 'x00200013', vr: 'IS', type: 'int' },    // Instance Number
  { tag: 'x00280010', vr: 'US', type: 'int' },    // Rows
  { tag: 'x00280011', vr: 'US', type: 'int' }     // Columns
];

function hexTag(from: string): string {
  // from like 'x00100010' to '00100010'
  return from.replace(/^x/, '').toUpperCase();
}

function extractDataSet(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const byteArray = new Uint8Array(buffer);
  const dataSet = (dicomParser as any).parseDicom(byteArray, { untilTag: undefined });
  return dataSet;
}

function toJson(dataSet: any): DICOMJson {
  const out: DICOMJson = {};
  for (const t of TAGS) {
    try {
      let value: any;
      if (t.type === 'int') {
        const s = dataSet.string(t.tag);
        if (s != null) {
          const n = parseInt(s, 10);
          if (!Number.isNaN(n)) value = n;
        }
      } else {
        value = dataSet.string(t.tag);
      }
      if (value != null && value !== '') {
        out[hexTag(t.tag)] = { vr: t.vr, Value: [value] };
      }
    } catch {
      // ignore missing
    }
  }
  return out;
}

async function main() {
  const inDir = path.join(__dirname, '../data/dicom/images');
  const outDir = path.join(__dirname, '../data/dicom/json');
  if (!fs.existsSync(inDir)) {
    console.error(`Input directory not found: ${inDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(inDir).filter(f => f.toLowerCase().endsWith('.dcm'));
  console.log(`Converting ${files.length} DICOM file(s) to JSON...`);

  let ok = 0, fail = 0;
  for (const f of files) {
    const full = path.join(inDir, f);
    try {
      const ds = extractDataSet(full);
      const json = toJson(ds);
      const outPath = path.join(outDir, f.replace(/\.dcm$/i, '.json'));
      fs.writeFileSync(outPath, JSON.stringify(json, null, 2));
      console.log(`✓ ${f} → ${path.relative(process.cwd(), outPath)}`);
      ok++;
    } catch (e: any) {
      console.log(`✗ ${f}: ${e.message}`);
      fail++;
    }
  }

  console.log(`Done. Success: ${ok}, Failed: ${fail}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
