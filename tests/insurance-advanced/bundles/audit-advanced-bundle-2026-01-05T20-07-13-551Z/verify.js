#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256File(p) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(p);
  hash.update(data);
  return hash.digest('hex');
}

(function() {
  const dir = __dirname;
  const manifestPath = path.join(dir, 'manifest.json');
  const auditPath = path.join(dir, 'audit.json');

  if (!fs.existsSync(manifestPath)) {
    console.error('manifest.json not found');
    process.exit(1);
  }
  if (!fs.existsSync(auditPath)) {
    console.error('audit.json not found');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const actual = sha256File(auditPath);
  if (actual === manifest.files.audit.sha256) {
    console.log('✅ audit.json hash matches manifest.');
    console.log('sha256:', actual);
    process.exit(0);
  } else {
    console.error('❌ audit.json hash mismatch!');
    console.error(' expected:', manifest.files.audit.sha256);
    console.error('   actual:', actual);
    process.exit(2);
  }
})();
