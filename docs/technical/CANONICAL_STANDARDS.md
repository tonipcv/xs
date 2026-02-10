# 🔐 Xase Canonical Standards — Technical Conventions

**Data:** 4 de Janeiro de 2026  
**Versão:** 1.0  
**Status:** OBRIGATÓRIO para todo código novo

---

## 📋 OBJETIVO

Garantir consistência criptográfica e reprodutibilidade em todo o sistema Xase.
Estes padrões são **não-negociáveis** para evidência juridicamente defensável.

---

## 1️⃣ CANONICAL JSON

### Regras Obrigatórias

**Ordenação de chaves:** Alfabética (lexicográfica)
```typescript
// ✅ CORRETO
{"a": 1, "b": 2, "c": 3}

// ❌ ERRADO
{"c": 3, "a": 1, "b": 2}
```

**Normalização de números:**
- Inteiros: sem ponto decimal (`123` não `123.0`)
- Floats: máximo 6 casas decimais
- Sem notação científica para valores < 1e6

**Timezone:** Sempre UTC (ISO 8601)
```typescript
// ✅ CORRETO
"2026-01-04T23:39:00.000Z"

// ❌ ERRADO
"2026-01-04T20:39:00-03:00"
```

**Encoding:** UTF-8 sem BOM

**Whitespace:** Sem espaços ou quebras de linha (compact)
```typescript
// ✅ CORRETO
{"name":"John","age":30}

// ❌ ERRADO
{
  "name": "John",
  "age": 30
}
```

### Implementação

Usar função utilitária:
```typescript
import { canonicalJSON } from '@/lib/xase/crypto';

const canonical = canonicalJSON(obj);
// Garante ordenação + normalização + compact
```

---

## 2️⃣ POLÍTICA DE HASH

### Formato Padrão

**Sempre prefixado com algoritmo:**
```
sha256:<hex>
```

**Exemplos:**
```typescript
// ✅ CORRETO
"sha256:a3b2c1d4e5f6..."

// ❌ ERRADO
"a3b2c1d4e5f6..."  // sem prefixo
"SHA256:..."       // uppercase
"sha256:A3B2..."   // hex uppercase
```

### Regras

- **Hash oficial:** `sha256:<lowercase_hex>`
- **Tokens/Assinaturas:** Base64 permitido (mas não para hashes de dados)
- **Comprimento:** 64 caracteres hex (256 bits)
- **Encoding:** Sempre hex lowercase

### Implementação

```typescript
import { hashObject, hashString } from '@/lib/xase/crypto';

// Para objetos (canonical JSON automático)
const hash = hashObject(data);
// Retorna: "sha256:abc123..."

// Para strings
const hash = hashString(str);
// Retorna: "sha256:def456..."
```

---

## 3️⃣ STORAGE (S3/MinIO)

### Estrutura de Buckets

**Bucket principal:** `xase-evidence-{env}`
- `xase-evidence-production`
- `xase-evidence-staging`
- `xase-evidence-development`

### Prefixos (Keys)

```
snapshots/{tenantId}/{type}/{hash}.json.gz
bundles/{tenantId}/{bundleId}/bundle.zip
bundles/{tenantId}/{bundleId}/manifest.json
pdf/{tenantId}/{bundleId}/report.pdf
checkpoints/{tenantId}/{checkpointId}.json
```

**Exemplos:**
```
snapshots/tenant_abc123/EXTERNAL_DATA/sha256:a3b2c1.json.gz
bundles/tenant_abc123/bundle_xyz789/bundle.zip
pdf/tenant_abc123/bundle_xyz789/report.pdf
```

### Regras

- **Imutabilidade:** Nunca sobrescrever keys existentes
- **Versionamento:** Habilitado no bucket
- **Lifecycle:** 
  - Snapshots: 7 anos (compliance)
  - Bundles: baseado em `retentionUntil`
  - PDF: mesmo que bundle
- **Encryption:** AES-256 at rest
- **Access:** Pre-signed URLs com expiração

---

## 4️⃣ FEATURE FLAGS

### Convenção

```typescript
// .env
FEATURE_INSURANCE_INGEST=true
FEATURE_SNAPSHOTS=true
FEATURE_MANIFEST=true
FEATURE_QTSP=false
FEATURE_ESEAL=false
FEATURE_BLOCKCHAIN=false
```

### Uso no Código

```typescript
import { env } from '@/lib/env';

if (env.FEATURE_INSURANCE_INGEST) {
  // Código novo
} else {
  // Fallback ou erro
}
```

### Rollout Strategy

**Sprint 1:**
- `FEATURE_INSURANCE_INGEST=true` (staging)
- `FEATURE_SNAPSHOTS=true` (staging)

**Sprint 2:**
- `FEATURE_MANIFEST=true` (staging)
- Promover Sprint 1 para production

**Sprint 3:**
- `FEATURE_QTSP=true` (staging)
- Promover Sprint 2 para production

**Sprint 4:**
- Promover Sprint 3 para production
- `FEATURE_QTSP=true` (production)

---

## 5️⃣ COMPRESSÃO

### Algoritmo Padrão

**Snapshots:** gzip (nível 6)
```typescript
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Comprimir
const compressed = await gzipAsync(Buffer.from(canonical), { level: 6 });

// Descomprimir
const decompressed = await gunzipAsync(compressed);
```

**Bundles:** ZIP (store ou deflate)
- Arquivos pequenos (<10KB): store (sem compressão)
- Arquivos grandes: deflate (nível 6)

---

## 6️⃣ TIMESTAMPS

### Formato

**ISO 8601 UTC:**
```
2026-01-04T23:39:00.000Z
```

**Regras:**
- Sempre UTC (sufixo `Z`)
- Milissegundos incluídos (`.000`)
- Sem timezone offset

### Implementação

```typescript
// ✅ CORRETO
const timestamp = new Date().toISOString();
// "2026-01-04T23:39:00.123Z"

// ❌ ERRADO
const timestamp = new Date().toString();
// "Sat Jan 04 2026 20:39:00 GMT-0300"
```

---

## 7️⃣ IDs E IDENTIFICADORES

### Formatos

**Transaction ID:**
```
txn_<16_bytes_hex>
```
Exemplo: `txn_a3b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6`

**Bundle ID:**
```
bundle_<16_bytes_hex>
```
Exemplo: `bundle_x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6`

**Checkpoint ID:**
```
chk_<tenant_short>_<number>
```
Exemplo: `chk_abc123_00001`

**Snapshot ID:**
```
snap_<cuid>
```
Exemplo: `snap_clq1a2b3c4d5e6f7g8h9`

### Geração

```typescript
import { randomBytes } from 'crypto';
import { cuid } from '@paralleldrive/cuid2';

// Transaction ID
const txnId = `txn_${randomBytes(16).toString('hex')}`;

// Bundle ID
const bundleId = `bundle_${randomBytes(16).toString('hex')}`;

// Snapshot ID
const snapshotId = `snap_${cuid()}`;
```

---

## 8️⃣ AUDIT LOGS

### Ações Padronizadas

```typescript
enum AuditAction {
  // Records
  RECORD_INGESTED = 'RECORD_INGESTED',
  RECORD_ACCESSED = 'RECORD_ACCESSED',
  
  // Snapshots
  SNAPSHOT_CREATED = 'SNAPSHOT_CREATED',
  SNAPSHOT_ACCESSED = 'SNAPSHOT_ACCESSED',
  
  // Bundles
  BUNDLE_CREATED = 'BUNDLE_CREATED',
  BUNDLE_DOWNLOADED = 'BUNDLE_DOWNLOADED',
  BUNDLE_EXPORTED = 'BUNDLE_EXPORTED',
  
  // Custody
  CUSTODY_REPORT_GENERATED = 'CUSTODY_REPORT_GENERATED',
  PDF_REPORT_GENERATED = 'PDF_REPORT_GENERATED',
  
  // Checkpoints
  CHECKPOINT_CREATED = 'CHECKPOINT_CREATED',
  CHECKPOINT_TIMESTAMPED = 'CHECKPOINT_TIMESTAMPED',
  CHECKPOINT_ESEAL_APPLIED = 'CHECKPOINT_ESEAL_APPLIED',
  
  // Verification
  VERIFY_CALLED = 'VERIFY_CALLED',
  
  // Legal
  LEGAL_HOLD_SET = 'LEGAL_HOLD_SET',
  LEGAL_HOLD_REMOVED = 'LEGAL_HOLD_REMOVED',
}
```

### Metadata Obrigatória

```typescript
{
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  tenantId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  status: 'SUCCESS' | 'FAILED' | 'DENIED';
  errorMessage?: string;
  timestamp: Date; // UTC
}
```

---

## 9️⃣ VALIDAÇÃO (ZOD)

### Schemas Reutilizáveis

```typescript
import { z } from 'zod';

// Hash
export const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

// Transaction ID
export const txnIdSchema = z.string().regex(/^txn_[a-f0-9]{32}$/);

// ISO Timestamp
export const isoTimestampSchema = z.string().datetime();

// Snapshot Type
export const snapshotTypeSchema = z.enum(['EXTERNAL_DATA', 'BUSINESS_RULES', 'ENVIRONMENT']);
```

---

## 🔟 TESTES

### Convenções

**Arquivos:**
- Unit: `*.test.ts`
- E2E: `*.e2e.test.ts`
- Integration: `*.integration.test.ts`

**Estrutura:**
```typescript
describe('SnapshotService', () => {
  describe('storeSnapshot', () => {
    it('should store snapshot with canonical JSON', async () => {
      // Arrange
      const data = { b: 2, a: 1 };
      
      // Act
      const result = await storeSnapshot('EXTERNAL_DATA', data, 'tenant_123');
      
      // Assert
      expect(result.payloadHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      // Verificar que JSON foi canonicalizado (a antes de b)
    });
  });
});
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

Antes de fazer PR, verificar:

- [ ] JSON canonicalizado (ordenação alfabética)
- [ ] Hashes com prefixo `sha256:`
- [ ] Timestamps em UTC (ISO 8601)
- [ ] Storage keys seguem convenção
- [ ] Feature flags implementadas
- [ ] Audit logs registrados
- [ ] Testes cobrem canonical JSON
- [ ] Documentação atualizada

---

**Preparado por:** Cascade AI  
**Data:** 4 de Janeiro de 2026  
**Status:** Padrão oficial Xase  
**Próxima revisão:** Após Sprint 1
