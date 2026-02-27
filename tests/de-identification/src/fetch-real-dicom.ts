import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as unzipper from 'unzipper';

const targets: Array<{ url: string; filename: string }> = [
  // pydicom example DICOMs (stable paths under src/pydicom/data/test_files)
  { url: 'https://raw.githubusercontent.com/pydicom/pydicom/main/src/pydicom/data/test_files/CT_small.dcm', filename: 'CT_small.dcm' },
  { url: 'https://raw.githubusercontent.com/pydicom/pydicom/main/src/pydicom/data/test_files/MR_small.dcm', filename: 'MR_small.dcm' },
  { url: 'https://raw.githubusercontent.com/pydicom/pydicom/main/src/pydicom/data/test_files/rtplan.dcm', filename: 'rtplan.dcm' },
  { url: 'https://raw.githubusercontent.com/pydicom/pydicom/main/src/pydicom/data/test_files/rtdose.dcm', filename: 'rtdose.dcm' },
  { url: 'https://raw.githubusercontent.com/pydicom/pydicom/main/src/pydicom/data/test_files/rtstruct.dcm', filename: 'rtstruct.dcm' },
  { url: 'https://raw.githubusercontent.com/pydicom/pydicom/main/src/pydicom/data/test_files/waveform_ecg.dcm', filename: 'waveform_ecg.dcm' }
];

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // follow redirects
          https.get(res.headers.location, (res2) => {
            if ((res2.statusCode || 0) >= 400) {
              file.close();
              fs.unlink(dest, () => {});
              return reject(new Error(`HTTP ${res2.statusCode} for redirect ${res.headers.location}`));
            }
            res2.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
          }).on('error', (err) => {
            file.close();
            fs.unlink(dest, () => {});
            reject(err);
          });
          return;
        }

        if ((res.statusCode || 0) >= 400) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function main() {
  const outDir = path.join(__dirname, '../data/dicom/images');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Downloading real public DICOM images...');
  let ok = 0;
  let fail = 0;
  for (const t of targets) {
    const dest = path.join(outDir, t.filename);
    try {
      await download(t.url, dest);
      const bytes = fs.statSync(dest).size;
      console.log(`✓ ${t.filename} (${bytes} bytes)`);
      ok++;
    } catch (e: any) {
      console.log(`✗ ${t.filename}: ${e.message}`);
      fail++;
    }
  }

  // Fallback: download pydicom-data ZIP and extract .dcm if all failed or too few succeeded
  if (ok < 1) {
    const zipUrlCandidates = [
      'https://github.com/pydicom/pydicom-data/archive/refs/heads/main.zip',
      'https://github.com/pydicom/pydicom-data/archive/refs/heads/master.zip'
    ];
    const zipPath = path.join(outDir, 'pydicom-data.zip');
    let zipOk = false;
    for (const zipUrl of zipUrlCandidates) {
      try {
        console.log(`Attempting fallback download: ${zipUrl}`);
        await download(zipUrl, zipPath);
        zipOk = true;
        break;
      } catch (e: any) {
        console.log(`Fallback ZIP failed: ${e.message}`);
      }
    }

    if (zipOk) {
      try {
        await fs.createReadStream(zipPath)
          .pipe(unzipper.Parse())
          .on('entry', (entry: any) => {
            const fileName: string = entry.path as string;
            if (fileName.endsWith('.dcm')) {
              const base = path.basename(fileName);
              const dest = path.join(outDir, base);
              entry.pipe(fs.createWriteStream(dest));
              ok++;
            } else {
              entry.autodrain();
            }
          })
          .promise();
        console.log(`✓ Extracted DICOM files from fallback ZIP`);
      } catch (e: any) {
        console.log(`Failed to extract fallback ZIP: ${e.message}`);
      } finally {
        try { fs.unlinkSync(zipPath); } catch {}
      }
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
