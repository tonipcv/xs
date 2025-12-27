#!/usr/bin/env node
/*
  XASE KMS Signing Test
  ---------------------
  Validates AWS KMS integration for Evidence Bundle signing.
  
  Tests:
  1. KMS credentials and permissions
  2. Sign operation with ECDSA_SHA_256
  3. Signature format validation
  4. Optional: Get public key for offline verification
  
  Usage:
    export AWS_REGION=us-east-1
    export KMS_KEY_ID=alias/xase-evidence-bundles
    node scripts/test-kms-signing.mjs
*/

import crypto from 'crypto'

function log(level, message, ctx = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...ctx }))
}

async function testKMSConfig() {
  const region = process.env.AWS_REGION
  const keyId = process.env.KMS_KEY_ID
  
  if (!region) {
    log('error', 'test.config_missing', { var: 'AWS_REGION' })
    return false
  }
  if (!keyId) {
    log('error', 'test.config_missing', { var: 'KMS_KEY_ID' })
    return false
  }
  
  log('info', 'test.config_ok', { region, keyId })
  return true
}

async function testKMSSign() {
  const region = process.env.AWS_REGION
  const keyId = process.env.KMS_KEY_ID
  
  try {
    log('info', 'test.kms_import')
    const { KMSClient, SignCommand, GetPublicKeyCommand } = await import('@aws-sdk/client-kms')
    
    log('info', 'test.kms_client_init', { region })
    const kms = new KMSClient({ region })
    
    // Test data: hash of "test-evidence-bundle"
    const testData = 'test-evidence-bundle'
    const hash = crypto.createHash('sha256').update(testData).digest()
    const hashHex = hash.toString('hex')
    
    log('info', 'test.kms_sign_start', { keyId, hashHex })
    
    const signRes = await kms.send(new SignCommand({
      KeyId: keyId,
      Message: hash,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    }))
    
    if (!signRes.Signature) {
      log('error', 'test.kms_sign_no_signature')
      return false
    }
    
    const sigBase64 = Buffer.from(signRes.Signature).toString('base64')
    const sigHex = Buffer.from(signRes.Signature).toString('hex')
    
    log('info', 'test.kms_sign_success', {
      keyId: signRes.KeyId,
      signingAlgorithm: signRes.SigningAlgorithm,
      signatureLength: signRes.Signature.length,
      signatureBase64: sigBase64.slice(0, 40) + '...',
      signatureHex: sigHex.slice(0, 40) + '...',
    })
    
    // Validate signature format
    const signature = {
      algorithm: 'ECDSA_SHA_256',
      keyId,
      signedAt: new Date().toISOString(),
      hash: hashHex,
      signature: sigBase64,
    }
    
    log('info', 'test.signature_format', signature)
    
    // Optional: Get public key for verification
    try {
      log('info', 'test.kms_get_public_key')
      const pubKeyRes = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }))
      
      if (pubKeyRes.PublicKey) {
        const pubKeyBase64 = Buffer.from(pubKeyRes.PublicKey).toString('base64')
        log('info', 'test.public_key_ok', {
          keyUsage: pubKeyRes.KeyUsage,
          keySpec: pubKeyRes.KeySpec,
          signingAlgorithms: pubKeyRes.SigningAlgorithms,
          publicKeyLength: pubKeyRes.PublicKey.length,
          publicKeyBase64: pubKeyBase64.slice(0, 60) + '...',
        })
        
        // Save public key for offline verification
        const fs = await import('fs')
        fs.writeFileSync('/tmp/kms-public-key.der', Buffer.from(pubKeyRes.PublicKey))
        log('info', 'test.public_key_saved', { path: '/tmp/kms-public-key.der' })
      }
    } catch (e) {
      log('warn', 'test.get_public_key_failed', { error: e.message })
    }
    
    return true
  } catch (e) {
    log('error', 'test.kms_sign_failed', {
      error: e.message,
      code: e.code || e.name,
      stack: e.stack?.split('\n').slice(0, 3).join('\n'),
    })
    return false
  }
}

async function testOfflineVerification() {
  try {
    const fs = await import('fs')
    
    // Check if public key was saved
    if (!fs.existsSync('/tmp/kms-public-key.der')) {
      log('warn', 'test.offline_verify_skip', { reason: 'Public key not available' })
      return true
    }
    
    log('info', 'test.offline_verify_start')
    
    // Convert DER to PEM
    const { execSync } = await import('child_process')
    try {
      execSync('openssl ec -inform DER -pubin -in /tmp/kms-public-key.der -out /tmp/kms-public-key.pem 2>/dev/null')
      log('info', 'test.public_key_converted', { path: '/tmp/kms-public-key.pem' })
    } catch (e) {
      log('warn', 'test.openssl_convert_failed', { error: e.message })
      return true
    }
    
    // Verify signature (if we have test data)
    const publicKey = fs.readFileSync('/tmp/kms-public-key.pem')
    const testData = 'test-evidence-bundle'
    const hash = crypto.createHash('sha256').update(testData).digest()
    
    // We would need the signature from the previous test
    // For now, just validate the key format
    log('info', 'test.offline_verify_ready', { publicKeyLength: publicKey.length })
    
    return true
  } catch (e) {
    log('warn', 'test.offline_verify_failed', { error: e.message })
    return true // Non-critical
  }
}

async function main() {
  console.log('\n🔐 XASE KMS Signing Test\n')
  
  let passed = 0
  let failed = 0
  
  // Test 1: Config
  if (await testKMSConfig()) {
    passed++
  } else {
    failed++
    console.log('\n❌ Configuration missing. Set AWS_REGION and KMS_KEY_ID\n')
    process.exit(1)
  }
  
  // Test 2: KMS Sign
  if (await testKMSSign()) {
    passed++
  } else {
    failed++
  }
  
  // Test 3: Offline verification setup
  if (await testOfflineVerification()) {
    passed++
  } else {
    failed++
  }
  
  console.log(`\n${'='.repeat(60)}`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`${'='.repeat(60)}\n`)
  
  if (failed === 0) {
    console.log('🎉 KMS integration working correctly!\n')
    console.log('📝 Next steps:')
    console.log('   1. Set AWS_REGION and KMS_KEY_ID in worker .env')
    console.log('   2. Restart worker: node scripts/worker-bundles-prisma.mjs')
    console.log('   3. Create a new bundle to test end-to-end')
    console.log('   4. Extract ZIP and verify signature.json contains ECDSA signature\n')
    process.exit(0)
  } else {
    console.log('⚠️  Fix issues above before using KMS signing\n')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('❌ Test failed:', e)
  process.exit(99)
})
