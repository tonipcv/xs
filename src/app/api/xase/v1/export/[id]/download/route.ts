import { NextResponse } from 'next/server'
import { validateApiKey, hasPermission } from '@/lib/xase/auth'
import { generateProofBundle } from '@/lib/xase/export'
import { hashObject, canonicalizeJSON } from '@/lib/xase/crypto'
import { signHash, getPublicKeyPem } from '@/lib/xase/signing-service'
import { prisma } from '@/lib/prisma'
import { getActivePolicy, getPolicyVersion } from '@/lib/xase/policies'
import { uploadBuffer, getPresignedUrl, isStorageConfigured } from '@/lib/xase/storage'
import { logAudit, AuditActions, ResourceTypes } from '@/lib/xase/audit'
import crypto from 'crypto'

interface RouteParams {
  params: { id: string }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'INVALID_ID', message: 'Missing or invalid id param' }, { status: 400 })
    }
    const transactionId = id

    // Query params
    const url = new URL(request.url)
    const searchParams = url.searchParams
    const includePayloads = searchParams.get('include_payloads') !== 'false' // default true
    const downloadMode = searchParams.get('download') || 'stream' // stream|redirect|json
    const storageEnabled = isStorageConfigured()

    // Auth
    const auth = await validateApiKey(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (!hasPermission(auth, 'export')) {
      return NextResponse.json(
        { error: 'API key does not have export permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // Check cache: se bundle já existe, reusar
    let existingBundle = await prisma.evidenceBundle.findFirst({
      where: {
        transactionId,
        includesPayloads: includePayloads,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Se existe e storage habilitado, retornar URL assinado direto
    if (existingBundle && existingBundle.storageKey && storageEnabled) {
      const presignedUrl = await getPresignedUrl(existingBundle.storageKey, 3600)

      // Audit: bundle downloaded
      await logAudit({
        tenantId: auth.tenantId!,
        action: AuditActions.BUNDLE_DOWNLOADED,
        resourceType: ResourceTypes.EVIDENCE_BUNDLE,
        resourceId: existingBundle.bundleId,
        metadata: JSON.stringify({ transactionId, cached: true }),
        status: 'SUCCESS',
      })

      if (downloadMode === 'redirect') {
        return NextResponse.redirect(presignedUrl)
      } else if (downloadMode === 'json') {
        return NextResponse.json({
          bundle_id: existingBundle.bundleId,
          transaction_id: transactionId,
          presigned_url: presignedUrl,
          expires_in: 3600,
          size: existingBundle.bundleSize,
          hash: existingBundle.bundleHash,
          cached: true,
        })
      }
      // Se stream, continua gerando (fallback)
    }

    // Gerar bundle
    const bundle = await generateProofBundle(transactionId, { includePayloads })

    // Load record to enrich with policy/model metadata if needed
    const dbRecord = await prisma.decisionRecord.findUnique({
      where: { transactionId },
      select: {
        tenantId: true,
        policyId: true,
        policyVersion: true,
        explanationJson: true,
        modelId: true,
        modelVersion: true,
        modelHash: true,
        featureSchemaHash: true,
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

    // Load model card if available
    let modelCardDoc: any | undefined = undefined
    if (dbRecord?.tenantId && dbRecord?.modelId && dbRecord?.modelVersion) {
      try {
        const modelCard = await prisma.modelCard.findFirst({
          where: {
            tenantId: dbRecord.tenantId,
            modelId: dbRecord.modelId,
            modelVersion: dbRecord.modelVersion,
          },
        })
        if (modelCard) {
          modelCardDoc = {
            model_id: modelCard.modelId,
            model_version: modelCard.modelVersion,
            model_hash: modelCard.modelHash,
            model_name: modelCard.modelName,
            model_type: modelCard.modelType,
            framework: modelCard.framework,
            description: modelCard.description,
            training_date: modelCard.trainingDate,
            dataset_hash: modelCard.datasetHash,
            dataset_size: modelCard.datasetSize,
            performance_metrics: modelCard.performanceMetrics ? JSON.parse(modelCard.performanceMetrics) : undefined,
            fairness_metrics: modelCard.fairnessMetrics ? JSON.parse(modelCard.fairnessMetrics) : undefined,
            validation_metrics: modelCard.validationMetrics ? JSON.parse(modelCard.validationMetrics) : undefined,
            intended_use: modelCard.intendedUse,
            limitations: modelCard.limitations,
            feature_schema: modelCard.featureSchema ? JSON.parse(modelCard.featureSchema) : undefined,
            feature_importance: modelCard.featureImportance ? JSON.parse(modelCard.featureImportance) : undefined,
          }
        }
      } catch (e) {
        console.error('[Export] Error loading model card:', e)
      }
    }

    // Build decision.json
    const decision: any = {
      transaction_id: bundle.manifest.record.transaction_id,
      policy_id: bundle.manifest.record.policy_id,
      policy_version: bundle.manifest.record.policy_version,
      policy_hash: policyHash,
      decision_type: bundle.manifest.record.decision_type,
      confidence: bundle.manifest.record.confidence,
      input: bundle.payloads?.input ?? { input_hash: bundle.manifest.hashes.input_hash },
      output: bundle.payloads?.output ?? { output_hash: bundle.manifest.hashes.output_hash },
      context: bundle.payloads?.context ?? (bundle.manifest.hashes.context_hash ? { context_hash: bundle.manifest.hashes.context_hash } : undefined),
      timestamp: bundle.manifest.record.timestamp,
      model: dbRecord ? {
        id: dbRecord.modelId || undefined,
        version: dbRecord.modelVersion || undefined,
        model_hash: dbRecord.modelHash || undefined,
        feature_schema_hash: dbRecord.featureSchemaHash || undefined,
      } : undefined,
    }

    // Hash + sign decision (canonical JSON)
    const canonical = canonicalizeJSON(decision)
    const decisionHash = hashObject(decision)

    // Sign via signing service (validates context + rate limits)
    const sig = await signHash({
      tenantId: auth.tenantId!,
      resourceType: 'export',
      resourceId: transactionId,
      hash: decisionHash,
      metadata: {
        policy_id: bundle.manifest.record.policy_id,
        decision_type: bundle.manifest.record.decision_type,
      },
    })

    // Public key for offline verification
    const publicKeyPem = await getPublicKeyPem()

    // Build proof.json (enterprise-grade)
    const proof = {
      type: 'xase.decision.proof',
      version: '1.0.0',
      hash_algo: 'SHA-256',
      signature_algo: sig.algorithm,
      hash: `sha256:${decisionHash}`,
      signature: sig.signature,
      key_id: sig.keyId,
      key_fingerprint: sig.keyFingerprint.substring(0, 16) + '...',
      issuer: 'xase.ai',
      signed_at: sig.timestamp.toISOString(),
      record_hash: bundle.manifest.hashes.record_hash,
      previous_hash: bundle.manifest.hashes.previous_hash,
      chain_position: bundle.manifest.chain.position,
      is_genesis: bundle.manifest.chain.is_genesis,
      transaction_id: transactionId,
      policy_id: bundle.manifest.record.policy_id,
      policy_version: bundle.manifest.record.policy_version,
      policy_hash: policyHash,
      model: decision.model,
      public_key_pem: publicKeyPem,
      notes: 'Canonical JSON (JCS) hashed with SHA-256. Signature covers hash (DIGEST mode). Verify fingerprint against official channel.'
    }

    // Generate verify.js (offline)
    const verifyJs = `#!/usr/bin/env node
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
`

    // Assemble ZIP with jszip (dynamic import) with ESM/CJS interop fallback
    // Note: ensure dependency jszip is installed in the project
    const mod: any = await import('jszip')
    const JSZip = (mod && (mod.default || mod)) as any
    if (!JSZip) {
      throw new Error('JSZip module load failed')
    }
    const zip = new JSZip()
    zip.file('decision.json', JSON.stringify(decision, null, 2))
    zip.file('proof.json', JSON.stringify(proof, null, 2))
    zip.file('verify.js', verifyJs)

    // Optional: include payloads directory for clarity
    if (bundle.payloads && typeof bundle.payloads === 'object') {
      const dir = zip.folder('payloads')
      if (dir) {
        if (bundle.payloads.input) dir.file('input.json', JSON.stringify(bundle.payloads.input, null, 2))
        if (bundle.payloads.output) dir.file('output.json', JSON.stringify(bundle.payloads.output, null, 2))
        if (bundle.payloads.context) dir.file('context.json', JSON.stringify(bundle.payloads.context, null, 2))
      }
    }

    // Include policy document if available
    if (policyDoc && typeof policyDoc === 'object') {
      zip.file('policy.json', JSON.stringify(policyDoc, null, 2))
    }

    // Include model card if available
    if (modelCardDoc && typeof modelCardDoc === 'object') {
      zip.file('model_card.json', JSON.stringify(modelCardDoc, null, 2))
    }

    // Include explanation if present (XAI - SHAP/LIME)
    if (dbRecord?.explanationJson) {
      try {
        const expl = JSON.parse(dbRecord.explanationJson)
        if (expl && typeof expl === 'object') {
          zip.file('explanation.json', JSON.stringify(expl, null, 2))
        }
      } catch {}
    }

    // Human-readable report (text) without external deps
    const reportLines = [
      'XASE Evidence Report',
      '====================',
      '',
      `Transaction ID: ${transactionId}`,
      `Timestamp: ${bundle.manifest.record.timestamp}`,
      '',
      'Decision',
      `  Type: ${bundle.manifest.record.decision_type || 'n/a'}`,
      `  Confidence: ${bundle.manifest.record.confidence ?? 'n/a'}`,
      '',
      'Policy',
      `  ID: ${bundle.manifest.record.policy_id || 'n/a'}`,
      `  Version: ${bundle.manifest.record.policy_version || 'n/a'}`,
      `  Hash: ${policyHash || 'n/a'}`,
      '',
      'Model',
      `  ID: ${decision.model?.id || 'n/a'}`,
      `  Version: ${decision.model?.version || 'n/a'}`,
      `  Model Hash: ${decision.model?.model_hash || 'n/a'}`,
      `  Feature Schema Hash: ${decision.model?.feature_schema_hash || 'n/a'}`,
    ]

    // Adicionar informações do model card se disponível
    if (modelCardDoc) {
      reportLines.push('')
      reportLines.push('Model Card')
      reportLines.push(`  Name: ${modelCardDoc.model_name || 'n/a'}`)
      reportLines.push(`  Type: ${modelCardDoc.model_type || 'n/a'}`)
      reportLines.push(`  Framework: ${modelCardDoc.framework || 'n/a'}`)
      if (modelCardDoc.training_date) {
        reportLines.push(`  Training Date: ${modelCardDoc.training_date}`)
      }
      if (modelCardDoc.performance_metrics) {
        reportLines.push('  Performance Metrics:')
        const pm = modelCardDoc.performance_metrics
        if (pm.accuracy) reportLines.push(`    Accuracy: ${pm.accuracy}`)
        if (pm.precision) reportLines.push(`    Precision: ${pm.precision}`)
        if (pm.recall) reportLines.push(`    Recall: ${pm.recall}`)
        if (pm.f1_score) reportLines.push(`    F1 Score: ${pm.f1_score}`)
        if (pm.auc_roc) reportLines.push(`    AUC-ROC: ${pm.auc_roc}`)
      }
      if (modelCardDoc.intended_use) {
        reportLines.push(`  Intended Use: ${modelCardDoc.intended_use}`)
      }
    }

    // Adicionar informações de explicabilidade se disponível
    if (dbRecord?.explanationJson) {
      try {
        const expl = JSON.parse(dbRecord.explanationJson)
        if (expl) {
          reportLines.push('')
          reportLines.push('Explainability (XAI)')
          if (expl.method) reportLines.push(`  Method: ${expl.method}`)
          if (expl.top_features && Array.isArray(expl.top_features)) {
            reportLines.push('  Top Features:')
            expl.top_features.slice(0, 5).forEach((f: any) => {
              reportLines.push(`    - ${f.name || f}: ${f.importance || f.value || ''}`)
            })
          }
        }
      } catch {}
    }

    reportLines.push('')
    reportLines.push('Cryptographic Proof')
    reportLines.push(`  Decision Hash: sha256:${decisionHash}`)
    reportLines.push(`  Record Hash: ${bundle.manifest.hashes.record_hash}`)
    reportLines.push(`  Previous Hash: ${bundle.manifest.hashes.previous_hash || 'genesis'}`)
    reportLines.push(`  Signature Algorithm: ${proof.signature_algo}`)
    reportLines.push(`  Signature (base64): ${proof.signature}`)
    reportLines.push(`  Key ID: ${proof.key_id}`)
    reportLines.push(`  Key Fingerprint: ${proof.key_fingerprint}`)
    reportLines.push('')
    reportLines.push('Verification')
    reportLines.push(`  Run: node verify.js`)
    reportLines.push(`  Public Key PEM included in proof.json`)

    const report = reportLines.join('\n')
    zip.file('report.txt', report)

    let nodebuf: Buffer
    try {
      nodebuf = await zip.generateAsync({ type: 'nodebuffer' })
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error('ZIP_GENERATION_FAILED: ' + msg)
    }

    // Upload para storage (se habilitado)
    let storageUrl: string | undefined
    let storageKey: string | undefined
    let bundleHash: string
    let bundleSize: number = nodebuf.length
    let bundleId: string | undefined

    if (storageEnabled) {
      const key = `evidence/${transactionId}_${includePayloads ? 'full' : 'hashes'}.zip`
      const uploaded = await uploadBuffer(key, nodebuf, 'application/zip')
      storageUrl = uploaded.url
      storageKey = uploaded.key
      bundleHash = uploaded.hash
      bundleSize = uploaded.size

      // Persistir EvidenceBundle
      const record = await prisma.decisionRecord.findUnique({
        where: { transactionId },
        select: { id: true, tenantId: true },
      })

      if (record) {
        bundleId = `bundle_${crypto.randomBytes(16).toString('hex')}`
        await prisma.evidenceBundle.create({
          data: {
            tenantId: record.tenantId,
            recordId: record.id,
            bundleId,
            transactionId,
            storageUrl,
            storageKey,
            bundleHash,
            bundleSize,
            format: 'zip',
            includesPdf: false,
            includesPayloads: includePayloads,
            createdBy: auth.apiKeyId ? `api-key:${auth.apiKeyId}` : 'api-system',
          },
        })

        // Audit: bundle stored
        await logAudit({
          tenantId: record.tenantId,
          action: AuditActions.BUNDLE_STORED,
          resourceType: ResourceTypes.EVIDENCE_BUNDLE,
          resourceId: bundleId,
          metadata: JSON.stringify({
            transactionId,
            storageKey,
            bundleSize,
            includesPayloads: includePayloads,
          }),
          status: 'SUCCESS',
        })
      }

      // Retornar URL assinado
      if (storageKey && bundleId) {
        const presignedUrl = await getPresignedUrl(storageKey, 3600)

        // Audit: bundle downloaded
        await logAudit({
          tenantId: auth.tenantId!,
          action: AuditActions.BUNDLE_DOWNLOADED,
          resourceType: ResourceTypes.EVIDENCE_BUNDLE,
          resourceId: bundleId,
          metadata: JSON.stringify({ transactionId, cached: false }),
          status: 'SUCCESS',
        })

        if (downloadMode === 'redirect') {
          return NextResponse.redirect(presignedUrl)
        } else if (downloadMode === 'json') {
          return NextResponse.json({
            bundle_id: bundleId,
            transaction_id: transactionId,
            presigned_url: presignedUrl,
            expires_in: 3600,
            size: bundleSize,
            hash: bundleHash,
            cached: false,
          })
        }
      }
      // Se stream, continua abaixo
    }

    // Fallback: stream direto (se storage não configurado ou modo stream)
    return new Response(nodebuf, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="evidence_${transactionId}.zip"`
      }
    })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown')
    try { console.error('[Export Download] Error:', message) } catch {}
    const status = message === 'Record not found' ? 404 : 500
    return NextResponse.json({ error: 'EXPORT_ERROR', message }, { status })
  }
}
