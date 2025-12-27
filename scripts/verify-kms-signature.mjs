#!/usr/bin/env node
/*
  XASE KMS Signature Offline Verification
  ----------------------------------------
  Verifies ECDSA signatures from Evidence Bundles without AWS access.
  
  Prerequisites:
  1. Extract bundle ZIP
  2. Have public-key.pem in current directory (or specify path)
  
  Usage:
    node scripts/verify-kms-signature.mjs [--bundle-dir ./extracted-bundle] [--public-key ./public-key.pem]
    
  To get public key once:
    aws kms get-public-key --key-id alias/xase-evidence-bundles --region us-east-1 --output json > public-key.json
    jq -r '.PublicKey' public-key.json | base64 --decode > public-key.der
    openssl ec -inform DER -pubin -in public-key.der -out public-key.pem
*/

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const argv = process.argv.slice(2)
function getFlag(name, fallback) {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = argv[i + 1]
  if (!v || v.startsWith('--')) return fallback
  return v
}

const bundleDir = getFlag('bundle-dir', '.')
const publicKeyPath = getFlag('public-key', './public-key.pem')

function log(level, message, ctx = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...ctx }))
}

async function main() {
  console.log('\n🔍 XASE KMS Signature Verification (Offline)\n')
  
  // 1. Check files exist
  const recordsPath = path.join(bundleDir, 'records.json')
  const signaturePath = path.join(bundleDir, 'signature.json')
  
  if (!fs.existsSync(recordsPath)) {
    log('error', 'verify.file_not_found', { path: recordsPath })
    console.log('\n❌ records.json not found. Extract bundle ZIP first.\n')
    process.exit(1)
  }
  
  if (!fs.existsSync(signaturePath)) {
    log('error', 'verify.file_not_found', { path: signaturePath })
    console.log('\n❌ signature.json not found. Extract bundle ZIP first.\n')
    process.exit(1)
  }
  
  if (!fs.existsSync(publicKeyPath)) {
    log('error', 'verify.public_key_not_found', { path: publicKeyPath })
    console.log('\n❌ Public key not found. Get it from KMS:\n')
    console.log('   aws kms get-public-key --key-id alias/xase-evidence-bundles --region us-east-1 --output json > public-key.json')
    console.log('   jq -r \'.PublicKey\' public-key.json | base64 --decode > public-key.der')
    console.log('   openssl ec -inform DER -pubin -in public-key.der -out public-key.pem\n')
    process.exit(1)
  }
  
  // 2. Load files
  const recordsData = fs.readFileSync(recordsPath, 'utf8')
  const signature = JSON.parse(fs.readFileSync(signaturePath, 'utf8'))
  const publicKey = fs.readFileSync(publicKeyPath)
  
  log('info', 'verify.files_loaded', {
    recordsSize: recordsData.length,
    signatureAlgorithm: signature.algorithm,
    signatureKeyId: signature.keyId,
  })
  
  // 3. Verify hash
  const computedHash = crypto.createHash('sha256').update(recordsData).digest('hex')
  
  if (computedHash !== signature.hash) {
    log('error', 'verify.hash_mismatch', {
      computed: computedHash,
      expected: signature.hash,
    })
    console.log('\n❌ HASH MISMATCH: records.json has been tampered with!\n')
    process.exit(1)
  }
  
  log('info', 'verify.hash_ok', { hash: computedHash })
  
  // 4. Verify signature
  if (signature.algorithm === 'ECDSA_SHA_256' && signature.signature) {
    try {
      const hash = Buffer.from(signature.hash, 'hex')
      const sig = Buffer.from(signature.signature, 'base64')
      
      const ok = crypto.verify('sha256', hash, publicKey, sig)
      
      if (ok) {
        log('info', 'verify.signature_ok', {
          algorithm: signature.algorithm,
          keyId: signature.keyId,
          signedAt: signature.signedAt,
        })
        console.log('\n✅ VERIFICATION PASSED')
        console.log(`   Algorithm: ${signature.algorithm}`)
        console.log(`   Key ID: ${signature.keyId}`)
        console.log(`   Signed at: ${signature.signedAt}`)
        console.log(`   Hash: ${signature.hash}`)
        console.log('\n🔒 Bundle integrity verified. Signature is valid.\n')
        process.exit(0)
      } else {
        log('error', 'verify.signature_invalid')
        console.log('\n❌ VERIFICATION FAILED: Signature is invalid!\n')
        process.exit(1)
      }
    } catch (e) {
      log('error', 'verify.signature_error', { error: e.message, stack: e.stack?.split('\n').slice(0, 3).join('\n') })
      console.log('\n❌ VERIFICATION ERROR:', e.message, '\n')
      process.exit(1)
    }
  } else if (signature.algorithm === 'SHA256' && signature.signedBy === 'local') {
    // Fallback: hash-only verification (no KMS)
    log('info', 'verify.hash_only', { signedBy: signature.signedBy })
    console.log('\n⚠️  Hash-only verification (KMS not configured)')
    console.log(`   Hash: ${signature.hash}`)
    console.log(`   Signed by: ${signature.signedBy}`)
    console.log('\n✅ Hash matches, but no cryptographic signature.\n')
    process.exit(0)
  } else {
    log('error', 'verify.unknown_algorithm', { algorithm: signature.algorithm })
    console.log('\n❌ Unknown signature algorithm:', signature.algorithm, '\n')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('❌ Verification failed:', e)
  process.exit(99)
})
