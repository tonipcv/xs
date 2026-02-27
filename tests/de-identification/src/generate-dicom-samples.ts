import * as fs from 'fs';
import * as path from 'path';

function createDicomFile(outputPath: string, rows: number, cols: number, patientName: string, studyDate: string): void {
  const buffer = Buffer.alloc(128 + 4 + 1000 + (rows * cols * 2));
  
  // DICOM preamble (128 bytes of 0x00)
  buffer.fill(0x00, 0, 128);
  
  // DICOM prefix "DICM"
  buffer.write('DICM', 128, 4, 'ascii');
  
  let offset = 132;
  
  // Helper to write DICOM element
  function writeElement(tag: string, vr: string, value: Buffer): void {
    const group = parseInt(tag.substring(0, 4), 16);
    const element = parseInt(tag.substring(4, 8), 16);
    
    buffer.writeUInt16LE(group, offset);
    offset += 2;
    buffer.writeUInt16LE(element, offset);
    offset += 2;
    
    buffer.write(vr, offset, 2, 'ascii');
    offset += 2;
    
    buffer.writeUInt16LE(value.length, offset);
    offset += 2;
    
    value.copy(buffer, offset);
    offset += value.length;
  }
  
  // Transfer Syntax UID (Implicit VR Little Endian)
  writeElement('00020010', 'UI', Buffer.from('1.2.840.10008.1.2\0'));
  
  // Patient Name
  writeElement('00100010', 'PN', Buffer.from(patientName + '\0'));
  
  // Patient ID
  writeElement('00100020', 'LO', Buffer.from('PAT' + Math.floor(Math.random() * 100000) + '\0'));
  
  // Patient Birth Date
  writeElement('00100030', 'DA', Buffer.from('19800115\0'));
  
  // Patient Sex
  writeElement('00100040', 'CS', Buffer.from('M\0'));
  
  // Study Date
  writeElement('00080020', 'DA', Buffer.from(studyDate + '\0'));
  
  // Study Time
  writeElement('00080030', 'TM', Buffer.from('120000\0'));
  
  // Modality
  writeElement('00080060', 'CS', Buffer.from('CT\0'));
  
  // Institution Name
  writeElement('00080080', 'LO', Buffer.from('Test Hospital\0'));
  
  // Referring Physician
  writeElement('00080090', 'PN', Buffer.from('Dr. Smith^John\0'));
  
  // Study Instance UID
  writeElement('0020000D', 'UI', Buffer.from('1.2.3.4.5.6.7.8.9.0.1.2.3.4.5\0'));
  
  // Series Instance UID
  writeElement('0020000E', 'UI', Buffer.from('1.2.3.4.5.6.7.8.9.0.1.2.3.4.6\0'));
  
  // Study ID
  writeElement('00200010', 'SH', Buffer.from('STUDY001\0'));
  
  // Series Number
  writeElement('00200011', 'IS', Buffer.from('1\0'));
  
  // Instance Number
  writeElement('00200013', 'IS', Buffer.from('1\0'));
  
  // Rows
  const rowsBuf = Buffer.alloc(2);
  rowsBuf.writeUInt16LE(rows, 0);
  writeElement('00280010', 'US', rowsBuf);
  
  // Columns
  const colsBuf = Buffer.alloc(2);
  colsBuf.writeUInt16LE(cols, 0);
  writeElement('00280011', 'US', colsBuf);
  
  // Bits Allocated
  const bitsBuf = Buffer.alloc(2);
  bitsBuf.writeUInt16LE(16, 0);
  writeElement('00280100', 'US', bitsBuf);
  
  // Bits Stored
  writeElement('00280101', 'US', bitsBuf);
  
  // High Bit
  const highBitBuf = Buffer.alloc(2);
  highBitBuf.writeUInt16LE(15, 0);
  writeElement('00280102', 'US', highBitBuf);
  
  // Samples Per Pixel
  const samplesBuf = Buffer.alloc(2);
  samplesBuf.writeUInt16LE(1, 0);
  writeElement('00280002', 'US', samplesBuf);
  
  // Photometric Interpretation
  writeElement('00280004', 'CS', Buffer.from('MONOCHROME2\0'));
  
  // Pixel Data
  const pixelDataSize = rows * cols * 2;
  const pixelData = Buffer.alloc(pixelDataSize);
  
  // Generate synthetic pixel data (gradient pattern)
  for (let i = 0; i < rows * cols; i++) {
    const value = Math.floor((i / (rows * cols)) * 4095);
    pixelData.writeUInt16LE(value, i * 2);
  }
  
  // Write pixel data tag
  buffer.writeUInt16LE(0x7FE0, offset);
  offset += 2;
  buffer.writeUInt16LE(0x0010, offset);
  offset += 2;
  buffer.write('OW', offset, 2, 'ascii');
  offset += 2;
  buffer.writeUInt16LE(0, offset); // Reserved
  offset += 2;
  buffer.writeUInt32LE(pixelDataSize, offset);
  offset += 4;
  pixelData.copy(buffer, offset);
  offset += pixelDataSize;
  
  // Write final buffer to file
  fs.writeFileSync(outputPath, buffer.slice(0, offset));
}

async function generateSamples(): Promise<void> {
  const outputDir = path.join(__dirname, '../data/dicom/images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('Generating synthetic DICOM images...\n');
  
  // Generate 3 different DICOM files
  createDicomFile(
    path.join(outputDir, 'synthetic_ct_brain.dcm'),
    512,
    512,
    'Doe^John^A',
    '20240115'
  );
  console.log('✓ Created synthetic_ct_brain.dcm (512x512)');
  
  createDicomFile(
    path.join(outputDir, 'synthetic_ct_chest.dcm'),
    256,
    256,
    'Smith^Jane^B',
    '20240120'
  );
  console.log('✓ Created synthetic_ct_chest.dcm (256x256)');
  
  createDicomFile(
    path.join(outputDir, 'synthetic_mr_spine.dcm'),
    128,
    128,
    'Johnson^Robert^C',
    '20240125'
  );
  console.log('✓ Created synthetic_mr_spine.dcm (128x128)');
  
  console.log('\nDICOM files generated successfully!');
}

if (require.main === module) {
  generateSamples().catch(console.error);
}

export { generateSamples };
