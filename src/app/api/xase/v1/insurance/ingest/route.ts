/**
 * XASE INSURANCE - Ingest API
 * 
 * POST /api/xase/v1/insurance/ingest
 * 
 * Endpoint específico para ingestão de decisões insurance com:
 * - Snapshots de reproducibility (external data, business rules, environment, features)
 * - Campos insurance (claim, policy, underwriting, impact)
 * - Idempotency via Idempotency-Key header
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { validateApiKey } from '@/lib/xase/auth';
import { hashObject, chainHash, generateTransactionId } from '@/lib/xase/crypto';
import { storeSnapshot } from '@/lib/xase/snapshots';
import { logAudit } from '@/lib/xase/audit';
import { getActivePolicy } from '@/lib/xase/policies';

// Zod schemas
const SnapshotInputSchema = z.object({
  externalData: z.any().optional(),
  businessRules: z.any().optional(),
  environment: z.any().optional(),
  featureVector: z.any().optional(),
  metadata: z.record(z.any()).optional(),
});

const InsuranceFieldsSchema = z.object({
  // Claim
  claimNumber: z.string().optional(),
  claimType: z.enum(['AUTO', 'HEALTH', 'LIFE', 'PROPERTY', 'LIABILITY', 'TRAVEL']).optional(),
  claimAmount: z.number().optional(),
  claimDate: z.string().datetime().optional(),
  
  // Policy
  policyNumber: z.string().optional(),
  policyHolderIdHash: z.string().optional(), // já deve vir hasheado
  insuredAmount: z.number().optional(),
  
  // Underwriting
  riskScore: z.number().optional(),
  underwritingDecision: z.string().optional(),
  premiumCalculated: z.number().optional(),
  coverageOfferedJson: z.any().optional(),
  
  // Outcome
  decisionOutcome: z.string().optional(),
  decisionOutcomeReason: z.string().optional(),
  
  // Impact
  decisionImpactFinancial: z.number().optional(),
  decisionImpactConsumerImpact: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  decisionImpactAppealable: z.boolean().optional(),
  
  // Regulatory
  regulatoryCaseId: z.string().optional(),
});

const IngestSchema = z.object({
  // Core decision data
  input: z.any(),
  output: z.any(),
  context: z.any().optional(),
  
  // Model & Policy
  modelId: z.string().optional(),
  modelVersion: z.string().optional(),
  modelHash: z.string().optional(),
  policyId: z.string().optional(),
  policyVersion: z.string().optional(),
  
  // Decision metadata
  decisionType: z.enum(['CLAIM', 'UNDERWRITING', 'FRAUD', 'PRICING', 'OTHER']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  processingTime: z.number().int().positive().optional(),
  
  // Snapshots (reproducibility)
  snapshots: SnapshotInputSchema.optional(),
  dataTimestamp: z.string().datetime().optional(),
  
  // Insurance-specific fields
  insurance: InsuranceFieldsSchema.optional(),
  
  // Storage options
  storePayload: z.boolean().default(false),
});

type IngestPayload = z.infer<typeof IngestSchema>;

export async function POST(request: NextRequest) {
  try {
    // 1. Validar API Key
    const auth = await validateApiKey(request);
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Idempotency check
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      const existing = await prisma.decisionRecord.findFirst({
        where: {
          tenantId: auth.tenantId,
          transactionId: idempotencyKey,
        },
        select: {
          id: true,
          transactionId: true,
          recordHash: true,
        },
      });

      if (existing) {
        return NextResponse.json({
          recordId: existing.id,
          transactionId: existing.transactionId,
          recordHash: existing.recordHash,
          idempotent: true,
        });
      }
    }

    // 3. Parse e validar payload
    const body = await request.json();
    const data = IngestSchema.parse(body);

    // 4. Armazenar snapshots (se fornecidos)
    let externalDataSnapshotId: string | null = null;
    let businessRulesSnapshotId: string | null = null;
    let environmentSnapshotId: string | null = null;
    let featureVectorSnapshotId: string | null = null;

    if (data.snapshots) {
      const snapshotPromises = [];

      if (data.snapshots.externalData) {
        snapshotPromises.push(
          storeSnapshot(
            'EXTERNAL_DATA',
            data.snapshots.externalData,
            auth.tenantId,
            data.snapshots.metadata
          ).then((result) => {
            externalDataSnapshotId = result.snapshotId;
          })
        );
      }

      if (data.snapshots.businessRules) {
        snapshotPromises.push(
          storeSnapshot(
            'BUSINESS_RULES',
            data.snapshots.businessRules,
            auth.tenantId,
            data.snapshots.metadata
          ).then((result) => {
            businessRulesSnapshotId = result.snapshotId;
          })
        );
      }

      if (data.snapshots.environment) {
        snapshotPromises.push(
          storeSnapshot(
            'ENVIRONMENT',
            data.snapshots.environment,
            auth.tenantId,
            data.snapshots.metadata
          ).then((result) => {
            environmentSnapshotId = result.snapshotId;
          })
        );
      }

      if (data.snapshots.featureVector) {
        snapshotPromises.push(
          storeSnapshot(
            'FEATURE_VECTOR',
            data.snapshots.featureVector,
            auth.tenantId,
            data.snapshots.metadata
          ).then((result) => {
            featureVectorSnapshotId = result.snapshotId;
          })
        );
      }

      await Promise.all(snapshotPromises);
    }

    // 5. Calcular hashes
    const inputHash = hashObject(data.input);
    const outputHash = hashObject(data.output);
    const contextHash = data.context ? hashObject(data.context) : null;

    // 6. Buscar último record do tenant (para encadeamento)
    const lastRecord = await prisma.decisionRecord.findFirst({
      where: { tenantId: auth.tenantId },
      orderBy: { timestamp: 'desc' },
      select: { recordHash: true },
    });

    // 7. Calcular hash encadeado
    const combinedData = `${inputHash}${outputHash}${contextHash || ''}`;
    const recordHash = chainHash(lastRecord?.recordHash || null, combinedData);

    // 8. Gerar transaction ID
    const transactionId = idempotencyKey || generateTransactionId();

    // 9. Resolver snapshot de política (se fornecida)
    let resolvedPolicyVersion: string | null = data.policyVersion || null;
    let resolvedPolicyHash: string | null = null;
    if (data.policyId) {
      try {
        const snapshot = await getActivePolicy(auth.tenantId, data.policyId);
        if (snapshot) {
          resolvedPolicyVersion = snapshot.version;
          resolvedPolicyHash = `sha256:${snapshot.documentHash}`.replace(
            /^sha256:sha256:/,
            'sha256:'
          );
        }
      } catch (e) {
        console.warn('[Insurance Ingest] Policy snapshot not resolved:', e);
      }
    }

    // 10. Persistir DecisionRecord
    const record = await prisma.decisionRecord.create({
      data: {
        tenantId: auth.tenantId,
        transactionId,
        policyId: data.policyId,
        policyVersion: resolvedPolicyVersion,
        policyHash: resolvedPolicyHash,
        modelId: data.modelId,
        modelVersion: data.modelVersion,
        modelHash: data.modelHash,
        inputHash,
        outputHash,
        contextHash,
        recordHash,
        previousHash: lastRecord?.recordHash || null,
        decisionType: data.decisionType,
        confidence: data.confidence,
        processingTime: data.processingTime,
        // Snapshots
        externalDataSnapshotId,
        businessRulesSnapshotId,
        environmentSnapshotId,
        featureVectorSnapshotId,
        dataTimestamp: data.dataTimestamp ? new Date(data.dataTimestamp) : null,
        // Payloads (opcional)
        inputPayload: data.storePayload ? JSON.stringify(data.input) : null,
        outputPayload: data.storePayload ? JSON.stringify(data.output) : null,
        contextPayload:
          data.storePayload && data.context ? JSON.stringify(data.context) : null,
      },
    });

    // 11. Persistir InsuranceDecision (se campos insurance fornecidos)
    let insuranceDecision = null;
    if (data.insurance) {
      insuranceDecision = await prisma.insuranceDecision.create({
        data: {
          recordId: record.id,
          claimNumber: data.insurance.claimNumber,
          claimType: data.insurance.claimType,
          claimAmount: data.insurance.claimAmount,
          claimDate: data.insurance.claimDate
            ? new Date(data.insurance.claimDate)
            : null,
          policyNumber: data.insurance.policyNumber,
          policyHolderIdHash: data.insurance.policyHolderIdHash,
          insuredAmount: data.insurance.insuredAmount,
          riskScore: data.insurance.riskScore,
          underwritingDecision: data.insurance.underwritingDecision,
          premiumCalculated: data.insurance.premiumCalculated,
          coverageOfferedJson: data.insurance.coverageOfferedJson
            ? JSON.stringify(data.insurance.coverageOfferedJson)
            : null,
          decisionOutcome: data.insurance.decisionOutcome,
          decisionOutcomeReason: data.insurance.decisionOutcomeReason,
          decisionImpactFinancial: data.insurance.decisionImpactFinancial,
          decisionImpactConsumerImpact: data.insurance.decisionImpactConsumerImpact,
          decisionImpactAppealable: data.insurance.decisionImpactAppealable,
          regulatoryCaseId: data.insurance.regulatoryCaseId,
        },
      });
    }

    // 12. Audit log
    await logAudit({
      tenantId: auth.tenantId,
      action: 'RECORD_INGESTED',
      resourceType: 'DECISION_RECORD',
      resourceId: record.id,
      metadata: JSON.stringify({
        transactionId: record.transactionId,
        decisionType: data.decisionType,
        hasInsurance: !!insuranceDecision,
        hasSnapshots: !!(
          externalDataSnapshotId ||
          businessRulesSnapshotId ||
          environmentSnapshotId ||
          featureVectorSnapshotId
        ),
        claimNumber: data.insurance?.claimNumber,
        policyNumber: data.insurance?.policyNumber,
      }),
      status: 'SUCCESS',
    });

    // 13. Resposta
    return NextResponse.json({
      recordId: record.id,
      transactionId: record.transactionId,
      recordHash: record.recordHash,
      snapshots: {
        externalData: externalDataSnapshotId,
        businessRules: businessRulesSnapshotId,
        environment: environmentSnapshotId,
        featureVector: featureVectorSnapshotId,
      },
      insurance: insuranceDecision
        ? {
            id: insuranceDecision.id,
            claimNumber: insuranceDecision.claimNumber,
            policyNumber: insuranceDecision.policyNumber,
          }
        : null,
      timestamp: record.timestamp.toISOString(),
    });
  } catch (error: any) {
    const errMsg = (error && typeof error === 'object' && 'message' in error)
      ? (error as any).message
      : String(error);
    // Avoid structured logger payload issues by logging a plain string
    console.error(`[Insurance Ingest] Error: ${errMsg}`);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: errMsg,
      },
      { status: 500 }
    );
  }
}
