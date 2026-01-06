import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'
import { generateProofBundle } from '@/lib/xase/export'
import { hashObject, canonicalizeJSON } from '@/lib/xase/crypto'
import { getKMSProvider } from '@/lib/xase/kms'

interface RouteParams { params: { id: string } }

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: any) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    }

    const transactionId = params.id

    // Ensure record belongs to current tenant
    const record = await prisma.decisionRecord.findFirst({
      where: { transactionId, tenantId },
      select: { tenantId: true }
    })
    if (!record) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    }
    if (record.tenantId !== tenantId) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    }

    // Build bundle with payloads (if stored)
    const bundle = await generateProofBundle(transactionId, { includePayloads: true, userId: session.user?.id as string | undefined })

    // Build decision.json
    const decision: any = {
      transaction_id: bundle.manifest.record.transaction_id,
      policy_id: bundle.manifest.record.policy_id,
      policy_version: bundle.manifest.record.policy_version,
      decision_type: bundle.manifest.record.decision_type,
      confidence: bundle.manifest.record.confidence,
      input: bundle.payloads?.input ?? { input_hash: bundle.manifest.hashes.input_hash },
      output: bundle.payloads?.output ?? { output_hash: bundle.manifest.hashes.output_hash },
      context: bundle.payloads?.context ?? (bundle.manifest.hashes.context_hash ? { context_hash: bundle.manifest.hashes.context_hash } : undefined),
      timestamp: bundle.manifest.record.timestamp,
    }

    // Hash + sign decision (canonical JSON)
    const canonical = canonicalizeJSON(decision)
    const decisionHash = hashObject(decision)

    const kms = getKMSProvider()
    const sig = await kms.sign(canonical)
    const publicKeyPem = process.env.XASE_PUBLIC_KEY_PEM || (typeof (kms as any).getPublicKeyPem === 'function' ? (kms as any).getPublicKeyPem() : undefined)

    // proof.json
    const proof = {
      version: '1.0.0',
      algorithm: sig.algorithm || 'RSA-SHA256',
      hash: `sha256:${decisionHash}`,
      signature: sig.signature,
      key_id: sig.keyId,
      created_at: new Date(sig.timestamp || new Date()).toISOString(),
      record_hash: bundle.manifest.hashes.record_hash,
      previous_hash: bundle.manifest.hashes.previous_hash,
      chain_position: bundle.manifest.chain.position,
      is_genesis: bundle.manifest.chain.is_genesis,
      transaction_id: transactionId,
      policy_id: bundle.manifest.record.policy_id,
      policy_version: bundle.manifest.record.policy_version,
      public_key_pem: publicKeyPem,
      notes: 'decision.json canonicalized (JCS-like) before hashing; signature covers canonical JSON.'
    }

    const verifyJs = `#!/usr/bin/env node
const fs = require('fs')
const crypto = require('crypto')
function canonicalize(obj){ if(obj===null||obj===undefined) return JSON.stringify(obj); if(Array.isArray(obj)) return JSON.stringify(obj.map(i=> (typeof i==='object'? JSON.parse(canonicalize(i)) : i))); if(typeof obj!=='object') return JSON.stringify(obj); const keys = Object.keys(obj).sort(); const out = {}; for(const k of keys){ out[k] = obj[k] } return JSON.stringify(out) }
function sha256(s){ return crypto.createHash('sha256').update(s).digest('hex') }
async function main(){ const decision = JSON.parse(fs.readFileSync('decision.json','utf8')); const proof = JSON.parse(fs.readFileSync('proof.json','utf8')); const canonical = canonicalize(decision); const hash = sha256(canonical); console.log('✓ Hash match:', ('sha256:'+hash) === proof.hash); if(!proof.public_key_pem){ console.log('ℹ️ No public key provided; cannot verify signature offline.'); return } const verify = crypto.createVerify('RSA-SHA256'); verify.update(canonical); verify.end(); const okSig = verify.verify(proof.public_key_pem, Buffer.from(proof.signature,'base64')); console.log('✓ Signature valid:', okSig); }
main().catch(e=>{ console.error(e); process.exit(1) })
`

    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('decision.json', JSON.stringify(decision, null, 2))
    zip.file('proof.json', JSON.stringify(proof, null, 2))
    zip.file('verify.js', verifyJs)
    if (bundle.payloads) {
      const dir = zip.folder('payloads')!
      if (bundle.payloads.input) dir.file('input.json', JSON.stringify(bundle.payloads.input, null, 2))
      if (bundle.payloads.output) dir.file('output.json', JSON.stringify(bundle.payloads.output, null, 2))
      if (bundle.payloads.context) dir.file('context.json', JSON.stringify(bundle.payloads.context, null, 2))
    }
    const nodebuf: Buffer = await zip.generateAsync({ type: 'nodebuffer' })

    return new NextResponse(nodebuf, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="evidence_${transactionId}.zip"`
      }
    })
  } catch (error: any) {
    console.error('[Records Export] Error:', error)
    const status = error?.message === 'Record not found' ? 404 : 500
    return NextResponse.json({ error: 'EXPORT_ERROR', message: error?.message }, { status })
  }
}
