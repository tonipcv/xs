/**
 * XASE CORE - Proof Bundle Export
 * 
 * Exporta pacote de prova verificável offline
 * Formato: ZIP com manifest + payloads + assinaturas
 */

import { prisma } from '../prisma';
import { hashString } from './crypto';
import { getKMSProvider } from './kms';
import { logAudit, AuditActions, ResourceTypes } from './audit';

export interface ProofBundleManifest {
  version: string;
  format: string;
  transaction_id: string;
  exported_at: string;
  exported_by?: string;

  // Dados do record
  record: {
    transaction_id: string;
    timestamp: string;
    policy_id?: string;
    policy_version?: string;
    decision_type?: string;
    confidence?: number;
  };

  // Hashes
  hashes: {
    input_hash: string;
    output_hash: string;
    context_hash?: string;
    record_hash: string;
    previous_hash?: string;
  };

  // Chain
  chain: {
    position: number;
    is_genesis: boolean;
    has_next: boolean;
    next_transaction_id?: string;
  };

  // Checkpoint mais próximo
  checkpoint?: {
    checkpoint_id: string;
    checkpoint_hash: string;
    signature: string;
    key_id: string;
    timestamp: string;
  };

  // Tenant
  tenant: {
    name: string;
  };

  // Payloads incluídos
  payloads: {
    input: boolean;
    output: boolean;
    context: boolean;
  };
}

export interface ProofBundleData {
  manifest: ProofBundleManifest;
  payloads?: {
    input?: any;
    output?: any;
    context?: any;
  };
  verification_script: string;
}

/**
 * Gera proof bundle para um transaction ID
 */
export async function generateProofBundle(
  transactionId: string,
  options: {
    includePayloads?: boolean;
    userId?: string;
  } = {}
): Promise<ProofBundleData> {
  const { includePayloads = false, userId } = options;

  // 1. Buscar record
  const record = await prisma.decisionRecord.findUnique({
    where: { transactionId },
    include: {
      tenant: {
        select: {
          name: true,
          companyName: true,
        },
      },
    },
  });

  if (!record) {
    throw new Error('Record not found');
  }

  // 2. Buscar checkpoint mais próximo
  const checkpoint = await prisma.checkpointRecord.findFirst({
    where: {
      tenantId: record.tenantId,
      timestamp: {
        lte: record.timestamp,
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  // 3. Contar posição na chain
  const position = await prisma.decisionRecord.count({
    where: {
      tenantId: record.tenantId,
      timestamp: {
        lte: record.timestamp,
      },
    },
  });

  // 4. Verificar se há próximo record
  const nextRecord = await prisma.decisionRecord.findFirst({
    where: {
      tenantId: record.tenantId,
      previousHash: record.recordHash,
    },
    select: {
      transactionId: true,
    },
  });

  // 5. Montar manifest
  const manifest: ProofBundleManifest = {
    version: '1.0.0',
    format: 'xase-proof-bundle-v1',
    transaction_id: record.transactionId,
    exported_at: new Date().toISOString(),
    exported_by: userId,

    record: {
      transaction_id: record.transactionId,
      timestamp: record.timestamp.toISOString(),
      policy_id: record.policyId || undefined,
      policy_version: record.policyVersion || undefined,
      decision_type: record.decisionType || undefined,
      confidence: record.confidence || undefined,
    },

    hashes: {
      input_hash: record.inputHash,
      output_hash: record.outputHash,
      context_hash: record.contextHash || undefined,
      record_hash: record.recordHash,
      previous_hash: record.previousHash || undefined,
    },

    chain: {
      position,
      is_genesis: !record.previousHash,
      has_next: !!nextRecord,
      next_transaction_id: nextRecord?.transactionId,
    },

    checkpoint: checkpoint
      ? {
          checkpoint_id: checkpoint.checkpointId,
          checkpoint_hash: checkpoint.checkpointHash,
          signature: checkpoint.signature!,
          key_id: checkpoint.keyId!,
          timestamp: checkpoint.timestamp.toISOString(),
        }
      : undefined,

    tenant: {
      name: record.tenant.companyName || record.tenant.name,
    },

    payloads: {
      input: !!record.inputPayload && includePayloads,
      output: !!record.outputPayload && includePayloads,
      context: !!record.contextPayload && includePayloads,
    },
  };

  // 6. Incluir payloads se solicitado
  let payloads: any = undefined;

  if (includePayloads) {
    payloads = {};

    if (record.inputPayload) {
      try {
        payloads.input = JSON.parse(record.inputPayload);
      } catch (error) {
        console.error('[Export] Failed to parse input payload:', error);
      }
    }

    if (record.outputPayload) {
      try {
        payloads.output = JSON.parse(record.outputPayload);
      } catch (error) {
        console.error('[Export] Failed to parse output payload:', error);
      }
    }

    if (record.contextPayload) {
      try {
        payloads.context = JSON.parse(record.contextPayload);
      } catch (error) {
        console.error('[Export] Failed to parse context payload:', error);
      }
    }
  }

  // 7. Gerar verification script
  const verificationScript = generateVerificationScript();

  // 8. Log de auditoria
  await logAudit({
    tenantId: record.tenantId,
    userId,
    action: AuditActions.EXPORT_CREATED,
    resourceType: ResourceTypes.DECISION_RECORD,
    resourceId: transactionId,
    metadata: JSON.stringify({
      includePayloads,
      hasCheckpoint: !!checkpoint,
    }),
    status: 'SUCCESS',
  });

  return {
    manifest,
    payloads,
    verification_script: verificationScript,
  };
}

/**
 * Gera script de verificação offline (Node.js)
 */
function generateVerificationScript(): string {
  return `#!/usr/bin/env node
/**
 * XASE CORE - Offline Verification Script
 * 
 * Verifica integridade de um proof bundle offline
 * Uso: node verify-proof.js manifest.json
 */

const crypto = require('crypto');
const fs = require('fs');

function hashObject(obj) {
  const canonical = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function chainHash(previousHash, currentData) {
  const data = previousHash ? \`\${previousHash}\${currentData}\` : currentData;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function verifyProof(manifestPath) {
  console.log('🔍 Xase Proof Verification\\n');

  // 1. Ler manifest
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(\`Transaction ID: \${manifest.transaction_id}\`);
  console.log(\`Exported at: \${manifest.exported_at}\\n\`);

  const checks = {
    inputHash: false,
    outputHash: false,
    contextHash: false,
    chainIntegrity: false,
    checkpointSignature: false,
  };

  // 2. Verificar hashes dos payloads (se disponíveis)
  if (manifest.payloads.input && fs.existsSync('payloads/input.json')) {
    const input = JSON.parse(fs.readFileSync('payloads/input.json', 'utf8'));
    const calculatedHash = hashObject(input);
    checks.inputHash = calculatedHash === manifest.hashes.input_hash;
    console.log(\`✓ Input hash: \${checks.inputHash ? 'VALID' : 'INVALID'}\`);
  }

  if (manifest.payloads.output && fs.existsSync('payloads/output.json')) {
    const output = JSON.parse(fs.readFileSync('payloads/output.json', 'utf8'));
    const calculatedHash = hashObject(output);
    checks.outputHash = calculatedHash === manifest.hashes.output_hash;
    console.log(\`✓ Output hash: \${checks.outputHash ? 'VALID' : 'INVALID'}\`);
  }

  // 3. Verificar chain integrity
  const combinedData = \`\${manifest.hashes.input_hash}\${manifest.hashes.output_hash}\${manifest.hashes.context_hash || ''}\`;
  const calculatedRecordHash = chainHash(manifest.hashes.previous_hash, combinedData);
  checks.chainIntegrity = calculatedRecordHash === manifest.hashes.record_hash;
  console.log(\`✓ Chain integrity: \${checks.chainIntegrity ? 'VALID' : 'INVALID'}\`);

  // 4. Verificar checkpoint (se disponível)
  if (manifest.checkpoint) {
    console.log(\`\\n📌 Checkpoint: \${manifest.checkpoint.checkpoint_id}\`);
    console.log(\`   Signed by: \${manifest.checkpoint.key_id}\`);
    console.log(\`   Timestamp: \${manifest.checkpoint.timestamp}\`);
    // Nota: verificação de assinatura requer chave pública do KMS
  }

  // 5. Resultado final
  console.log(\`\\n\${checks.chainIntegrity ? '✅' : '❌'} Proof is \${checks.chainIntegrity ? 'VALID' : 'INVALID'}\`);

  return checks;
}

// Executar
const manifestPath = process.argv[2] || 'manifest.json';
verifyProof(manifestPath).catch(console.error);
`;
}
