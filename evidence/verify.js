#!/usr/bin/env node
const fs = require('fs')
const crypto = require('crypto')

function canonicalize(obj){
  if(obj===null||obj===undefined) return JSON.stringify(obj)
  if(Array.isArray(obj)) return JSON.stringify(obj.map(i=> (typeof i==='object'? JSON.parse(canonicalize(i)) : i)))
  if(typeof obj!=='object') return JSON.stringify(obj)
  const keys = Object.keys(obj).sort()
  const out = {}
  for(const k of keys){ out[k] = obj[k] }
  return JSON.stringify(out)
}

function sha256(s){ return crypto.createHash('sha256').update(s).digest('hex') }

async function main(){
  const decision = JSON.parse(fs.readFileSync('decision.json','utf8'))
  const proof = JSON.parse(fs.readFileSync('proof.json','utf8'))
  const canonical = canonicalize(decision)
  const hash = sha256(canonical)
  const okHash = ('sha256:'+hash) === proof.hash
  console.log('✓ Hash match:', okHash)

  if(!proof.public_key_pem){
    console.log('ℹ️ No public key provided in proof.json; cannot verify signature offline.')
    return
  }

  // Verify signature (signs hash, not canonical JSON)
  const verify = crypto.createVerify('RSA-SHA256')
  verify.update(Buffer.from(hash, 'hex'))
  verify.end()
  const okSig = verify.verify(proof.public_key_pem, Buffer.from(proof.signature,'base64'))
  console.log('✓ Signature valid:', okSig)

  // Verify key fingerprint (trust anchor)
  const keyHash = crypto.createHash('sha256').update(proof.public_key_pem).digest('hex')
  console.log('ℹ️ Key fingerprint:', keyHash.substring(0,16)+'...')
  console.log('ℹ️ Verify this fingerprint matches official channel (website/docs)')
}

main().catch(e=>{ console.error(e); process.exit(1) })
