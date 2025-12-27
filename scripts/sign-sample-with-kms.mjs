#!/usr/bin/env node
/*
  Sign a sample records.json with AWS KMS and create a bundle-like folder
  Usage:
    AWS_REGION=sa-east-1 KMS_KEY_ID=alias/xase-evidence-bundles node scripts/sign-sample-with-kms.mjs --out extracted-bundle --message "test-evidence-bundle"
    # or
    node scripts/sign-sample-with-kms.mjs --out extracted-bundle --file ./path/to/records.json
*/
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { KMSClient, SignCommand, GetPublicKeyCommand } from '@aws-sdk/client-kms'

const argv = process.argv.slice(2)
function getFlag(name, fallback){
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = argv[i+1]
  if (!v || v.startsWith('--')) return fallback
  return v
}

const outDir = getFlag('out', 'extracted-bundle')
const message = getFlag('message', null)
const file = getFlag('file', null)

function log(level, message, ctx={}){ console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...ctx })) }

async function main(){
  const region = process.env.AWS_REGION
  const keyId = process.env.KMS_KEY_ID
  if (!region || !keyId) {
    console.error('✖ AWS_REGION and KMS_KEY_ID must be set in environment')
    process.exit(1)
  }

  // Prepare records.json content
  let recordsData
  if (file) {
    recordsData = fs.readFileSync(file, 'utf8')
  } else {
    const sample = message || 'test-evidence-bundle'
    // Minimal records structure
    const payload = { sample }
    recordsData = JSON.stringify(payload, null, 2)
  }

  // Ensure out directory
  fs.mkdirSync(outDir, { recursive: true })
  const recordsPath = path.join(outDir, 'records.json')
  fs.writeFileSync(recordsPath, recordsData)
  log('info', 'write.records_json', { out: recordsPath, size: recordsData.length })

  // Hash and sign with KMS
  const hashBuf = crypto.createHash('sha256').update(recordsData).digest()
  const hashHex = hashBuf.toString('hex')

  const kms = new KMSClient({ region })
  const signRes = await kms.send(new SignCommand({
    KeyId: keyId,
    Message: hashBuf,
    MessageType: 'DIGEST',
    SigningAlgorithm: 'ECDSA_SHA_256',
  }))
  if (!signRes.Signature) throw new Error('No signature returned from KMS')
  const signatureB64 = Buffer.from(signRes.Signature).toString('base64')

  const signature = {
    algorithm: 'ECDSA_SHA_256',
    keyId,
    signedAt: new Date().toISOString(),
    hash: hashHex,
    signature: signatureB64,
  }
  const sigPath = path.join(outDir, 'signature.json')
  fs.writeFileSync(sigPath, JSON.stringify(signature, null, 2))
  log('info', 'write.signature_json', { out: sigPath })

  // Fetch public key and convert to PEM using Node crypto
  const pub = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }))
  if (pub.PublicKey) {
    const der = Buffer.from(pub.PublicKey)
    const keyObj = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
    const pem = keyObj.export({ format: 'pem', type: 'spki' })
    const pemPath = path.join(outDir, 'public-key.pem')
    fs.writeFileSync(pemPath, pem)
    log('info', 'write.public_key_pem', { out: pemPath })
  }

  // Write verify.js into outDir for convenience (same as bundle verifier)
  const verifyJs = `#!/usr/bin/env node\nconst fs=require('fs');\nconst crypto=require('crypto');\nconst records=fs.readFileSync('records.json','utf8');\nconst s=JSON.parse(fs.readFileSync('signature.json','utf8'));\nconst computedHash=crypto.createHash('sha256').update(records).digest('hex');\nif(computedHash!==s.hash){console.log('❌ HASH VERIFICATION FAILED');process.exit(1);}\nif(s.algorithm==='ECDSA_SHA_256'&&s.signature){\n  if(!fs.existsSync('public-key.pem')){console.log('⚠️  Hash OK, but public key not found for signature verification.');process.exit(2);}\n  const pubKey=fs.readFileSync('public-key.pem');\n  const sig=Buffer.from(s.signature,'base64');\n  const verifier=crypto.createVerify('sha256');\n  verifier.update(records);\n  verifier.end();\n  const ok=verifier.verify(pubKey,sig);\n  if(ok){console.log('✅ VERIFICATION PASSED (KMS ECDSA)');process.exit(0);}else{console.log('❌ SIGNATURE VERIFICATION FAILED');process.exit(1);}\n}else{console.log('✅ HASH VERIFICATION PASSED (no KMS signature)');process.exit(0);}\n`
  fs.writeFileSync(path.join(outDir, 'verify.js'), verifyJs)

  console.log(`\n✅ Sample bundle-like folder created at: ${outDir}\n`)
  console.log('Next:')
  console.log(`  cd ${outDir} && node verify.js`)
}

main().catch((e)=>{ console.error(e); process.exit(99) })
