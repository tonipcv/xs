/**
 * XASE CORE - Snapshot Service
 * 
 * Armazena snapshots imutáveis para reproducibility total:
 * - External data (APIs, databases)
 * - Business rules (regras de negócio)
 * - Environment (config, versões)
 * - Feature vectors (features finais pós-processamento)
 * 
 * Deduplicação automática por hash (payloadHash)
 */

import { prisma } from '../prisma';
import { hashObject } from './crypto';
import { uploadBuffer, getPresignedUrl } from './storage';
import { logAudit } from './audit';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export type SnapshotType = 'EXTERNAL_DATA' | 'BUSINESS_RULES' | 'ENVIRONMENT' | 'FEATURE_VECTOR';

export interface SnapshotMetadata {
  apis?: string[];
  versions?: Record<string, string>;
  timestamp?: string;
  [key: string]: any;
}

export interface StoreSnapshotResult {
  snapshotId: string;
  payloadHash: string;
  storageUrl: string;
  storageKey: string;
  compressed: boolean;
  deduplicated: boolean;
}

/**
 * Armazena snapshot com deduplicação automática
 * Se já existe snapshot com mesmo hash, retorna o existente
 */
export async function storeSnapshot(
  type: SnapshotType,
  payload: any,
  tenantId: string,
  metadata?: SnapshotMetadata
): Promise<StoreSnapshotResult> {
  // 1. Canonical JSON + hash
  const canonical = hashObject.canonicalJSON(payload);
  const payloadHash = hashObject(payload); // retorna sha256:hex

  // 2. Verificar se já existe (deduplicação)
  const existing = await prisma.evidenceSnapshot.findFirst({
    where: {
      tenantId,
      type,
      payloadHash,
    },
  });

  if (existing) {
    // Snapshot já existe, retornar sem recriar
    return {
      snapshotId: existing.id,
      payloadHash: existing.payloadHash,
      storageUrl: existing.storageUrl,
      storageKey: existing.storageKey,
      compressed: existing.compressed,
      deduplicated: true,
    };
  }

  // 3. Comprimir payload
  const payloadBuffer = Buffer.from(canonical, 'utf-8');
  const compressed = await gzipAsync(payloadBuffer, { level: 6 });

  // 4. Storage key
  const hash = payloadHash.replace('sha256:', '');
  const storageKey = `snapshots/${tenantId}/${type}/${hash}.json.gz`;

  // 5. Upload S3 via helper
  const uploadResult = await uploadBuffer(
    storageKey,
    compressed,
    'application/gzip'
  );

  // 6. Criar registro no DB
  const snapshot = await prisma.evidenceSnapshot.create({
    data: {
      tenantId,
      type,
      storageUrl: uploadResult.url,
      storageKey,
      payloadHash,
      payloadSize: payloadBuffer.length,
      sourceMeta: metadata ? JSON.stringify(metadata) : null,
      compressed: true,
      compressionAlgo: 'gzip',
    },
  });

  // 7. Audit log
  await logAudit({
    tenantId,
    action: 'SNAPSHOT_CREATED',
    resourceType: 'EVIDENCE_SNAPSHOT',
    resourceId: snapshot.id,
    metadata: JSON.stringify({
      type,
      payloadHash,
      payloadSize: payloadBuffer.length,
      compressedSize: compressed.length,
      deduplicated: false,
    }),
    status: 'SUCCESS',
  });

  return {
    snapshotId: snapshot.id,
    payloadHash: snapshot.payloadHash,
    storageUrl: snapshot.storageUrl,
    storageKey: snapshot.storageKey,
    compressed: true,
    deduplicated: false,
  };
}

/**
 * Recupera snapshot e valida hash
 */
export async function retrieveSnapshot(snapshotId: string): Promise<any> {
  // 1. Buscar registro
  const snapshot = await prisma.evidenceSnapshot.findUnique({
    where: { id: snapshotId },
  });

  if (!snapshot) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  // 2. Download via presigned URL
  const url = await getPresignedUrl(snapshot.storageKey, 60);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download snapshot object: ${resp.status}`);
  }
  const data = Buffer.from(await resp.arrayBuffer());

  // 3. Descomprimir
  let payloadBuffer: Buffer;
  if (snapshot.compressed) {
    payloadBuffer = await gunzipAsync(data);
  } else {
    payloadBuffer = data;
  }

  // 4. Parse JSON
  const payloadStr = payloadBuffer.toString('utf-8');
  const payload = JSON.parse(payloadStr);

  // 5. Validar hash
  const computedHash = hashObject(payload);
  if (computedHash !== snapshot.payloadHash) {
    throw new Error(
      `Snapshot integrity check failed: expected ${snapshot.payloadHash}, got ${computedHash}`
    );
  }

  // 6. Audit log
  await logAudit({
    tenantId: snapshot.tenantId,
    action: 'SNAPSHOT_ACCESSED',
    resourceType: 'EVIDENCE_SNAPSHOT',
    resourceId: snapshot.id,
    metadata: JSON.stringify({
      type: snapshot.type,
      payloadHash: snapshot.payloadHash,
    }),
    status: 'SUCCESS',
  });

  return payload;
}

/**
 * Verifica integridade de snapshot sem baixar payload completo
 */
export async function verifySnapshot(
  snapshotId: string,
  expectedHash?: string
): Promise<{ valid: boolean; hash: string; error?: string }> {
  try {
    // 1. Buscar registro
    const snapshot = await prisma.evidenceSnapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot) {
      return {
        valid: false,
        hash: '',
        error: 'Snapshot not found',
      };
    }

    // 2. Se expectedHash fornecido, comparar
    if (expectedHash && snapshot.payloadHash !== expectedHash) {
      return {
        valid: false,
        hash: snapshot.payloadHash,
        error: `Hash mismatch: expected ${expectedHash}, got ${snapshot.payloadHash}`,
      };
    }

    // 3. Download e validar hash real (via presigned URL)
    const url = await getPresignedUrl(snapshot.storageKey, 60);
    const resp = await fetch(url);
    if (!resp.ok) {
      return {
        valid: false,
        hash: '',
        error: `Download failed: ${resp.status}`,
      };
    }

    const raw = Buffer.from(await resp.arrayBuffer());

    let payloadBuffer: Buffer;
    if (snapshot.compressed) {
      payloadBuffer = await gunzipAsync(raw);
    } else {
      payloadBuffer = raw;
    }

    const payloadStr = payloadBuffer.toString('utf-8');
    const payload = JSON.parse(payloadStr);
    const computedHash = hashObject(payload);

    if (computedHash !== snapshot.payloadHash) {
      return {
        valid: false,
        hash: computedHash,
        error: `Stored hash mismatch: DB says ${snapshot.payloadHash}, computed ${computedHash}`,
      };
    }

    return {
      valid: true,
      hash: snapshot.payloadHash,
    };
  } catch (error: any) {
    return {
      valid: false,
      hash: '',
      error: error.message,
    };
  }
}

/**
 * Lista snapshots por tipo e tenant
 */
export async function listSnapshots(
  tenantId: string,
  type?: SnapshotType,
  limit: number = 50
) {
  return prisma.evidenceSnapshot.findMany({
    where: {
      tenantId,
      ...(type && { type }),
    },
    orderBy: {
      capturedAt: 'desc',
    },
    take: limit,
    select: {
      id: true,
      type: true,
      payloadHash: true,
      payloadSize: true,
      compressed: true,
      capturedAt: true,
      sourceMeta: true,
    },
  });
}

/**
 * Conta referências a um snapshot (quantos DecisionRecords apontam para ele)
 */
export async function countSnapshotReferences(snapshotId: string): Promise<number> {
  const [
    externalDataCount,
    businessRulesCount,
    environmentCount,
    featureVectorCount,
  ] = await Promise.all([
    prisma.decisionRecord.count({
      where: { externalDataSnapshotId: snapshotId },
    }),
    prisma.decisionRecord.count({
      where: { businessRulesSnapshotId: snapshotId },
    }),
    prisma.decisionRecord.count({
      where: { environmentSnapshotId: snapshotId },
    }),
    prisma.decisionRecord.count({
      where: { featureVectorSnapshotId: snapshotId },
    }),
  ]);

  return (
    externalDataCount +
    businessRulesCount +
    environmentCount +
    featureVectorCount
  );
}
