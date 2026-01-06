/*
 Package the latest advanced audit into an offline-verifiable bundle

 Outputs a folder containing:
  - audit.json (verbatim from reports)
  - manifest.json (metadata + SHA-256 of audit.json)
  - verify.js (offline hash verification script)

 Usage:
   npm run demo2:bundle

 Optional env:
   DEMO2_EMAIL=... to target a specific advanced tenant (used only for manifest metadata)
*/

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const REPORTS_DIR = path.join(process.cwd(), 'tests/insurance-advanced/reports')
const BUNDLES_DIR = path.join(process.cwd(), 'tests/insurance-advanced/bundles')
const TENANT_EMAIL = process.env.DEMO2_EMAIL || 'demo-insurance-advanced@xase.local'

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256')
  const data = fs.readFileSync(filePath)
  hash.update(data)
  return hash.digest('hex')
}

function findLatestAuditJson(dir: string): string {
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith('audit-advanced-') && f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  if (files.length === 0) throw new Error('No audit JSON found in reports directory')
  return path.join(dir, files[0].f)
}

function main() {
  ensureDir(REPORTS_DIR)
  ensureDir(BUNDLES_DIR)

  const sourceAuditJson = findLatestAuditJson(REPORTS_DIR)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join(BUNDLES_DIR, `audit-advanced-bundle-${ts}`)
  ensureDir(outDir)

  const auditOut = path.join(outDir, 'audit.json')
  fs.copyFileSync(sourceAuditJson, auditOut)

  // Create verify.js
  const verifyJs = `#!/usr/bin/env node\n\nconst fs = require('fs');\nconst path = require('path');\nconst crypto = require('crypto');\n\nfunction sha256File(p) {\n  const hash = crypto.createHash('sha256');\n  const data = fs.readFileSync(p);\n  hash.update(data);\n  return hash.digest('hex');\n}\n\n(function() {\n  const dir = __dirname;\n  const manifestPath = path.join(dir, 'manifest.json');\n  const auditPath = path.join(dir, 'audit.json');\n\n  if (!fs.existsSync(manifestPath)) {\n    console.error('manifest.json not found');\n    process.exit(1);\n  }\n  if (!fs.existsSync(auditPath)) {\n    console.error('audit.json not found');\n    process.exit(1);\n  }\n\n  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));\n  const actual = sha256File(auditPath);\n  if (actual === manifest.files.audit.sha256) {\n    console.log('✅ audit.json hash matches manifest.');\n    console.log('sha256:', actual);\n    process.exit(0);\n  } else {\n    console.error('❌ audit.json hash mismatch!');\n    console.error(' expected:', manifest.files.audit.sha256);\n    console.error('   actual:', actual);\n    process.exit(2);\n  }\n})();\n`
  const verifyPath = path.join(outDir, 'verify.js')
  fs.writeFileSync(verifyPath, verifyJs, { mode: 0o755 })

  // Create manifest.json (after writing audit.json and verify.js)
  const auditSha = sha256File(auditOut)
  const verifySha = sha256File(verifyPath)

  const manifest = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    tenantEmail: TENANT_EMAIL,
    source: path.basename(sourceAuditJson),
    files: {
      audit: { name: 'audit.json', sha256: auditSha },
      verify: { name: 'verify.js', sha256: verifySha },
    },
  }
  const manifestPath = path.join(outDir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  console.log('[bundle] Created offline bundle at:', outDir)
  console.log('[bundle] Files: audit.json, manifest.json, verify.js')
  console.log('[bundle] To verify offline:')
  console.log('  node verify.js')
}

main()
