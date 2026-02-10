#!/usr/bin/env node
const fs=require('fs');
const crypto=require('crypto');
const records=fs.readFileSync('records.json','utf8');
const s=JSON.parse(fs.readFileSync('signature.json','utf8'));
const computedHash=crypto.createHash('sha256').update(records).digest('hex');
if(computedHash!==s.hash){console.log('❌ HASH VERIFICATION FAILED');process.exit(1);}
if(s.algorithm==='ECDSA_SHA_256'&&s.signature){
  if(!fs.existsSync('public-key.pem')){console.log('⚠️  Hash OK, but public key not found for signature verification.');process.exit(2);}
  const pubKey=fs.readFileSync('public-key.pem');
  const sig=Buffer.from(s.signature,'base64');
  const verifier=crypto.createVerify('sha256');
  verifier.update(records);
  verifier.end();
  const ok=verifier.verify(pubKey,sig);
  if(ok){console.log('✅ VERIFICATION PASSED (KMS ECDSA)');process.exit(0);}else{console.log('❌ SIGNATURE VERIFICATION FAILED');process.exit(1);}
}else{console.log('✅ HASH VERIFICATION PASSED (no KMS signature)');process.exit(0);}
