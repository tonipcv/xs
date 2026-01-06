/**
 * Server-side handler para download seguro de evidência
 * Não expõe X-API-Key no browser
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTenantId } from '@/lib/xase/server-auth'
import { prisma } from '@/lib/prisma'
import { uploadBuffer, getPresignedUrl, isStorageConfigured } from '@/lib/xase/storage'
import { logAudit, AuditActions, ResourceTypes } from '@/lib/xase/audit'
import { generateProofBundle } from '@/lib/xase/export'
import { hashObject, canonicalizeJSON } from '@/lib/xase/crypto'
import { signHash, getPublicKeyPem } from '@/lib/xase/signing-service'
import { getActivePolicy, getPolicyVersion } from '@/lib/xase/policies'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Auth
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 })
    }

    const { id } = await context.params
    const transactionId = id

    // Query params
    const searchParams = request.nextUrl.searchParams
    const includePayloads = searchParams.get('include_payloads') !== 'false'
    const mode = searchParams.get('mode') || 'redirect' // redirect|json

    // Verificar se record pertence ao tenant
    const record = await prisma.decisionRecord.findFirst({
      where: {
        transactionId,
        tenantId,
      },
      select: {
        id: true,
        transactionId: true,
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Buscar bundle existente
    const bundle = await prisma.evidenceBundle.findFirst({
      where: {
        transactionId,
        includesPayloads: includePayloads,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!bundle || !bundle.storageKey) {
      // Fallback: gerar bundle server-side e redirecionar
      const storageEnabled = isStorageConfigured()
      if (!storageEnabled) {
        return NextResponse.json(
          { error: 'Storage not configured to generate bundle server-side.' },
          { status: 503 }
        )
      }

      // 1) Gerar manifest/payloads
      let gen: any
      try {
        gen = await generateProofBundle(transactionId, {
          includePayloads,
          userId: session.user.email,
        })
      } catch (e: any) {
        console.error('[Evidence Download] generateProofBundle failed:', e?.message || e)
        return NextResponse.json({ error: 'GENERATE_FAILED', message: e?.message || String(e) }, { status: 500 })
      }

      // 2) Enriquecer com policy/explanation para ZIP
      const dbRecord = await prisma.decisionRecord.findFirst({
        where: { transactionId, tenantId },
        select: {
          tenantId: true,
          policyId: true,
          policyVersion: true,
          explanationJson: true,
        },
      })

      let policyDoc: any | undefined = undefined
      let policyHash: string | undefined = undefined
      if (dbRecord?.tenantId && dbRecord?.policyId) {
        try {
          const policySnap = dbRecord.policyVersion
            ? await getPolicyVersion(dbRecord.tenantId, dbRecord.policyId, dbRecord.policyVersion)
            : await getActivePolicy(dbRecord.tenantId, dbRecord.policyId)
          if (policySnap) {
            policyDoc = policySnap.document
            policyHash = `sha256:${policySnap.documentHash}`
          }
        } catch {}
      }

      // 3) Montar decision e proof
      const decision: any = {
        transaction_id: gen.manifest.record.transaction_id,
        policy_id: gen.manifest.record.policy_id,
        policy_version: gen.manifest.record.policy_version,
        policy_hash: policyHash,
        decision_type: gen.manifest.record.decision_type,
        confidence: gen.manifest.record.confidence,
        input: gen.payloads?.input ?? { input_hash: gen.manifest.hashes.input_hash },
        output: gen.payloads?.output ?? { output_hash: gen.manifest.hashes.output_hash },
        context: gen.payloads?.context ?? (gen.manifest.hashes.context_hash ? { context_hash: gen.manifest.hashes.context_hash } : undefined),
        timestamp: gen.manifest.record.timestamp,
      }

      const canonical = canonicalizeJSON(decision)
      const decisionHashFull = hashObject(decision) // returns 'sha256:<hex>'
      const decisionHashHex = decisionHashFull.replace(/^sha256:/, '')

      let sig: any
      try {
        sig = await signHash({
          tenantId,
          resourceType: 'export',
          resourceId: transactionId,
          hash: decisionHashHex,
          metadata: {
            policy_id: gen.manifest.record.policy_id,
            decision_type: gen.manifest.record.decision_type,
          },
        })
      } catch (e: any) {
        console.error('[Evidence Download] signHash failed:', e?.message || e)
        return NextResponse.json({ error: 'SIGNING_FAILED', message: e?.message || String(e) }, { status: 500 })
      }
      let publicKeyPem: string
      try {
        publicKeyPem = await getPublicKeyPem()
      } catch (e: any) {
        console.error('[Evidence Download] getPublicKeyPem failed:', e?.message || e)
        return NextResponse.json({ error: 'PUBLIC_KEY_FAILED', message: e?.message || String(e) }, { status: 500 })
      }

      const proof = {
        type: 'xase.decision.proof',
        version: '1.0.0',
        hash_algo: 'SHA-256',
        signature_algo: sig.algorithm,
        hash: `sha256:${decisionHashHex}`,
        signature: sig.signature,
        key_id: sig.keyId,
        key_fingerprint: sig.keyFingerprint.substring(0, 16) + '...',
        issuer: 'xase.ai',
        signed_at: sig.timestamp.toISOString(),
        record_hash: gen.manifest.hashes.record_hash,
        previous_hash: gen.manifest.hashes.previous_hash,
        chain_position: gen.manifest.chain.position,
        is_genesis: gen.manifest.chain.is_genesis,
        transaction_id: transactionId,
        policy_id: gen.manifest.record.policy_id,
        policy_version: gen.manifest.record.policy_version,
        policy_hash: policyHash,
        public_key_pem: publicKeyPem,
      }

      // 4) Montar ZIP
      const mod: any = await import('jszip')
      const JSZip = (mod && (mod.default || mod)) as any
      const zip = new JSZip()
      zip.file('decision.json', JSON.stringify(decision, null, 2))
      zip.file('proof.json', JSON.stringify(proof, null, 2))

      if (gen.payloads && typeof gen.payloads === 'object') {
        const dir = zip.folder('payloads')
        if (dir) {
          if (gen.payloads.input) dir.file('input.json', JSON.stringify(gen.payloads.input, null, 2))
          if (gen.payloads.output) dir.file('output.json', JSON.stringify(gen.payloads.output, null, 2))
          if (gen.payloads.context) dir.file('context.json', JSON.stringify(gen.payloads.context, null, 2))
        }
      }
      if (policyDoc && typeof policyDoc === 'object') {
        zip.file('policy.json', JSON.stringify(policyDoc, null, 2))
      }

      let nodebuf: Buffer
      try {
        nodebuf = await zip.generateAsync({ type: 'nodebuffer' })
      } catch (e: any) {
        return NextResponse.json({ error: 'ZIP_GENERATION_FAILED', message: e?.message || String(e) }, { status: 500 })
      }

      // 5) Upload e persistir bundle
      const key = `evidence/${transactionId}_${includePayloads ? 'full' : 'hashes'}.zip`
      let uploaded: any
      try {
        uploaded = await uploadBuffer(key, nodebuf, 'application/zip')
      } catch (e: any) {
        console.error('[Evidence Download] uploadBuffer failed:', e?.message || e)
        return NextResponse.json({ error: 'UPLOAD_FAILED', message: e?.message || String(e) }, { status: 500 })
      }

      const recordLink = await prisma.decisionRecord.findFirst({
        where: { transactionId, tenantId },
        select: { id: true, tenantId: true },
      })

      if (!recordLink) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 })
      }

      const newBundleId = `bundle_${crypto.randomBytes(16).toString('hex')}`
      await prisma.evidenceBundle.create({
        data: {
          tenantId: recordLink.tenantId,
          recordId: recordLink.id,
          bundleId: newBundleId,
          transactionId,
          storageUrl: uploaded.url,
          storageKey: uploaded.key,
          bundleHash: uploaded.hash,
          bundleSize: uploaded.size,
          format: 'zip',
          includesPdf: false,
          createdBy: session.user.email,
          includesPayloads: includePayloads,
        },
      })

      await logAudit({
        tenantId,
        userId: session.user.email,
        action: AuditActions.BUNDLE_STORED,
        resourceType: ResourceTypes.EVIDENCE_BUNDLE,
        resourceId: newBundleId,
        metadata: JSON.stringify({ transactionId, storageKey: uploaded.key, bundleSize: uploaded.size, includePayloads }),
        status: 'SUCCESS',
      })

      let presignedUrlNew: string
      try {
        presignedUrlNew = await getPresignedUrl(uploaded.key, 3600)
      } catch (e: any) {
        console.error('[Evidence Download] getPresignedUrl new bundle failed:', e?.message || e)
        return NextResponse.json({ error: 'PRESIGN_FAILED', message: e?.message || String(e) }, { status: 500 })
      }

      await logAudit({
        tenantId,
        userId: session.user.email,
        action: AuditActions.BUNDLE_DOWNLOADED,
        resourceType: ResourceTypes.EVIDENCE_BUNDLE,
        resourceId: newBundleId,
        metadata: JSON.stringify({ transactionId, via: 'ui', includePayloads, cached: false }),
        status: 'SUCCESS',
      })

      if (mode === 'json') {
        return NextResponse.json({
          bundle_id: newBundleId,
          transaction_id: transactionId,
          presigned_url: presignedUrlNew,
          expires_in: 3600,
          size: uploaded.size,
          hash: uploaded.hash,
          created_at: new Date().toISOString(),
        })
      }

      return NextResponse.redirect(presignedUrlNew)
    }

    // Gerar URL assinado
    let presignedUrl: string
    try {
      presignedUrl = await getPresignedUrl(bundle.storageKey, 3600)
    } catch (e: any) {
      console.error('[Evidence Download] getPresignedUrl existing bundle failed:', e?.message || e)
      return NextResponse.json({ error: 'PRESIGN_FAILED', message: e?.message || String(e) }, { status: 500 })
    }

    // Audit
    await logAudit({
      tenantId,
      userId: session.user.email,
      action: AuditActions.BUNDLE_DOWNLOADED,
      resourceType: ResourceTypes.EVIDENCE_BUNDLE,
      resourceId: bundle.bundleId,
      metadata: JSON.stringify({
        transactionId,
        via: 'ui',
        includePayloads,
      }),
      status: 'SUCCESS',
    })


    if (mode === 'json') {
      return NextResponse.json({
        bundle_id: bundle.bundleId,
        transaction_id: transactionId,
        presigned_url: presignedUrl,
        expires_in: 3600,
        size: bundle.bundleSize,
        hash: bundle.bundleHash,
        created_at: bundle.createdAt,
        accessed_at: bundle.accessedAt,
      })
    }

    // Redirect para URL assinado
    return NextResponse.redirect(presignedUrl)
  } catch (error: any) {
    console.error("[Evidence Download] Error:", error?.message || error || "Unknown error")
    return NextResponse.json(
      { error: "Internal server error", message: error?.message || String(error) || "Unknown error" },
      { status: 500 }
    )
  }
}
