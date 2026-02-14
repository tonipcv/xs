import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/xase/auth'
import { EvidenceMerkleTree } from '@/lib/xase/merkle-tree'
import { getTimestamp } from '@/lib/xase/timestamp'
import { generateCertificate } from '@/lib/xase/certificate'
import { z } from 'zod'
import crypto from 'crypto'

const BodySchema = z.object({
  executionId: z.string().min(1),
  includeFullLogs: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { executionId, includeFullLogs } = parsed.data
    
    // Generate idempotency key for this evidence generation
    const idempotencyKey = `evidence_${executionId}_${Date.now()}`

    // Get execution
    const execution = await prisma.policyExecution.findUnique({
      where: { id: executionId },
      include: {
        policy: {
          include: {
            dataset: true,
          },
        },
      },
    })

    if (!execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 })
    }

    // Verify tenant owns this execution (buyer)
    if (execution.buyerTenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Fetch all access logs for this execution
    const logs = await prisma.voiceAccessLog.findMany({
      where: {
        policyId: execution.policyId,
        clientTenantId: execution.buyerTenantId,
        timestamp: {
          gte: execution.startedAt,
          lte: execution.completedAt || new Date(),
        },
      },
      orderBy: { timestamp: 'asc' },
    })

    if (logs.length === 0) {
      return NextResponse.json({ error: 'No access logs found for this execution' }, { status: 404 })
    }

    // Build Merkle tree
    const tree = await EvidenceMerkleTree.build(logs)
    const stats = EvidenceMerkleTree.getStats(tree)

    // Compress tree for storage
    const compressed = EvidenceMerkleTree.compress(tree)

    // Store Merkle tree
    const merkleTree = await prisma.evidenceMerkleTree.create({
      data: {
        id: `merkle_${crypto.randomUUID().replace(/-/g, '')}`,
        executionId,
        rootHash: tree.root,
        treeData: compressed,
        leafCount: stats.leafCount,
        proofSizeBytes: stats.proofSize,
      },
    })

    // Check trust level from sidecar sessions
    const sessions = await prisma.sidecarSession.findMany({
      where: {
        lease: {
          executions: {
            some: { id: executionId },
          },
        },
      },
      select: { trustLevel: true, attested: true },
    })
    
    const hasAttestedSession = sessions.some(s => s.attested)
    const executionTrustLevel = hasAttestedSession ? 'ATTESTED' : 'SELF_REPORTED'

    // Get RFC 3161 timestamp for merkle root
    const timestampProof = await getTimestamp(tree.root)

    // Generate legal compliance certificate
    const certificateData = {
      executionId,
      contractId: execution.policy.id,
      supplierName: execution.policy.dataset.tenantId,
      supplierDomain: 'verified.xase.ai',
      buyerName: execution.buyerTenantId,
      allowedPurposes: ['AI Training'],
      merkleRoot: tree.root,
      timestamp: timestampProof.timestamp,
      timestampAuthority: timestampProof.authority,
      datasetName: execution.policy.dataset.name || 'Dataset',
      datasetSize: `${logs.length} access logs`,
      accessDuration: `${Math.round((execution.completedAt?.getTime() || Date.now() - execution.startedAt.getTime()) / 3600000)}h`,
    }
    const certificatePdf = await generateCertificate(certificateData)

    // Update execution with evidence
    await prisma.policyExecution.update({
      where: { id: executionId },
      data: {
        evidenceHash: tree.root,
        evidenceGeneratedAt: new Date(),
        executionTrustLevel,
        idempotencyKey,
      },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId as string,
        action: 'EVIDENCE_GENERATED',
        resourceType: 'MERKLE_TREE',
        resourceId: merkleTree.id,
        metadata: JSON.stringify({
          executionId,
          leafCount: stats.leafCount,
          proofSize: stats.proofSize,
        }),
        status: 'SUCCESS',
      },
    }).catch(() => {})

    // Response
    const response: any = {
      success: true,
      merkleTreeId: merkleTree.id,
      rootHash: tree.root,
      timestamp: {
        timestamp: timestampProof.timestamp,
        authority: timestampProof.authority,
        serialNumber: timestampProof.serialNumber,
        verificationUrl: timestampProof.verificationUrl,
      },
      certificate: {
        generated: true,
        sizeBytes: certificatePdf.length,
      },
      stats: {
        leafCount: stats.leafCount,
        treeHeight: stats.treeHeight,
        totalNodes: stats.totalNodes,
        proofSizeBytes: stats.proofSize,
      },
      sampleProof: EvidenceMerkleTree.generateProof(tree, 0),
    }

    if (includeFullLogs) {
      response.logs = logs.slice(0, 100).map(log => ({
        id: log.id,
        action: log.action,
        filesAccessed: log.filesAccessed,
        hoursAccessed: log.hoursAccessed,
        timestamp: log.timestamp,
      }))
    }

    return NextResponse.json(response)
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] POST /api/v1/evidence/generate error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const executionId = url.searchParams.get('executionId')

    if (!executionId) {
      return NextResponse.json({ error: 'executionId required' }, { status: 400 })
    }

    // Get Merkle tree
    const merkleTree = await prisma.evidenceMerkleTree.findFirst({
      where: { executionId },
      include: {
        execution: {
          select: {
            buyerTenantId: true,
          },
        },
      },
    })

    if (!merkleTree) {
      return NextResponse.json({ error: 'Evidence not found' }, { status: 404 })
    }

    // Verify tenant owns this execution
    if (merkleTree.execution.buyerTenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    return NextResponse.json({
      id: merkleTree.id,
      executionId: merkleTree.executionId,
      rootHash: merkleTree.rootHash,
      leafCount: merkleTree.leafCount,
      proofSizeBytes: merkleTree.proofSizeBytes,
      createdAt: merkleTree.createdAt,
      verifiedAt: merkleTree.verifiedAt,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] GET /api/v1/evidence/generate error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
