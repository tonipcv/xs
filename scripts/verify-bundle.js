#!/usr/bin/env node
'use strict'

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

async function main() {
  const zipPath = process.argv[2]
  if (!zipPath) {
    console.error('Usage: node scripts/verify-bundle.js <bundle.zip>')
    process.exit(1)
  }
  const absZip = path.resolve(zipPath)
  if (!fs.existsSync(absZip)) {
    console.error('File not found:', absZip)
    process.exit(1)
  }

  const outDir = path.resolve('evidence_tmp')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)

  try {
    execSync(`unzip -o ${JSON.stringify(absZip)} -d ${JSON.stringify(outDir)}`, { stdio: 'inherit' })
  } catch (e) {
    console.error('Failed to unzip bundle')
    process.exit(1)
  }

  const verifyJs = path.join(outDir, 'verify.js')
  if (!fs.existsSync(verifyJs)) {
    console.error('verify.js not found in bundle')
    process.exit(1)
  }

  try {
    execSync(`node ${JSON.stringify(verifyJs)}`, { stdio: 'inherit', cwd: outDir })
  } catch (e) {
    console.error('Verification script failed')
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
