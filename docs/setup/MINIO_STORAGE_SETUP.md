# XASE - MinIO/S3 Storage Setup

> **Objetivo:** Configurar storage externo (MinIO/S3) para armazenamento seguro de bundles de evidência.

Este documento explica como configurar e usar o storage MinIO/S3 para armazenar bundles de evidência com URLs assinados, retenção e compliance.

---

## Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Instalação de Dependências](#2-instalação-de-dependências)
3. [Configuração de Variáveis](#3-configuração-de-variáveis-de-ambiente)
4. [Criar Bucket](#4-criar-bucket-no-minio)
5. [Como Funciona](#5-como-funciona)
6. [Exemplos de Uso](#6-exemplos-de-uso)
7. [Auditoria](#7-auditoria)
8. [Persistência](#8-persistência-em-evidencebundle)
9. [Retenção e Compliance](#9-retenção-e-compliance)
10. [Troubleshooting](#10-troubleshooting)
11. [Segurança](#11-segurança)
12. [Próximos Passos](#12-próximos-passos)

---

## 1. Pré-requisitos

- **MinIO** rodando (ou AWS S3)
- **Bucket criado**: `xase` (ou nome configurado em `BUCKET_NAME`)
- **Credenciais**: access key e secret key

---

## 2. Instalação de Dependências

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

## 3. Configuração de Variáveis de Ambiente

Adicione ao `.env.local`:

```bash
# MinIO/S3 Storage Configuration
MINIO_SERVER_URL=https://aa-minio44.dpbdp1.easypanel.host
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=password
BUCKET_NAME=xase
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

### Alternativa: AWS S3

```bash
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=xase-evidence
S3_FORCE_PATH_STYLE=false
```

---

## 4. Criar Bucket no MinIO

Se estiver usando MinIO local ou self-hosted:

1. Acesse o console MinIO (ex: `https://aa-minio44.dpbdp1.easypanel.host`)
2. Faça login com `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD`
3. Crie um bucket chamado `xase` (ou o nome em `BUCKET_NAME`)
4. (Opcional) Configure versionamento e Object Lock para retenção

---

## 5. Como Funciona

### Upload automático

Quando você chama `GET /api/xase/v1/export/[id]/download`:

1. O sistema gera o bundle ZIP (decision.json, proof.json, verify.js, etc)
2. Calcula o hash SHA-256 do ZIP
3. Faz upload para MinIO/S3 com chave: `evidence/{transactionId}_{full|hashes}.zip`
4. Persiste metadata em `EvidenceBundle` (bundleHash, bundleSize, storageUrl, storageKey)
5. Retorna URL assinado (pre-signed) com validade de 1 hora

### Cache e reuso

- Se o bundle já foi gerado para o mesmo `transactionId` + `includePayloads`, o sistema:
  - Busca em `EvidenceBundle`
  - Gera novo URL assinado
  - Retorna sem reprocessar

### Modos de download

- **`?download=stream`** (padrão): retorna o ZIP direto (fallback se storage não configurado)
- **`?download=redirect`**: redireciona (302) para URL assinado do MinIO/S3
- **`?download=json`**: retorna JSON com `presigned_url`, `bundle_id`, `size`, `hash`

### Parametrização

- **`?include_payloads=true|false`** (padrão: true): incluir ou não os payloads completos no ZIP
  - `false`: ZIP contém apenas hashes (menor, mais seguro para LGPD)
  - `true`: ZIP contém `payloads/input.json`, `payloads/output.json`, etc

---

## 6. Exemplos de Uso

### Download com cache (redirect para URL assinado)

```bash
curl -L -H "X-API-Key: $XASE_API_KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc123/download?download=redirect" \
  --output evidence.zip
```

### Download JSON (obter URL assinado)

```bash
curl -H "X-API-Key: $XASE_API_KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc123/download?download=json"
```

Resposta:
```json
{
  "bundle_id": "bundle_a1b2c3...",
  "transaction_id": "txn_abc123",
  "presigned_url": "https://aa-minio44.dpbdp1.easypanel.host/xase/evidence/txn_abc123_full.zip?X-Amz-...",
  "expires_in": 3600,
  "size": 5709,
  "hash": "a3f9c2...",
  "cached": true
}
```

### Download sem payloads (somente hashes)

```bash
curl -H "X-API-Key: $XASE_API_KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc123/download?include_payloads=false" \
  --output evidence_hashes.zip
```

---

## 7. Auditoria

Todos os uploads e downloads são registrados em `AuditLog`:

- **`BUNDLE_STORED`**: quando o ZIP é enviado ao storage
- **`BUNDLE_DOWNLOADED`**: quando um URL assinado é gerado

Campos registrados:
- `tenantId`
- `resourceId` (bundleId)
- `metadata` (transactionId, storageKey, bundleSize, cached)

---

## 8. Persistência em `EvidenceBundle`

Cada bundle gerado é salvo na tabela `xase_evidence_bundles`:

```sql
SELECT 
  bundle_id,
  transaction_id,
  storage_url,
  storage_key,
  bundle_hash,
  bundle_size,
  includes_payloads,
  created_at,
  accessed_at
FROM xase_evidence_bundles
WHERE transaction_id = 'txn_abc123';
```

---

## 9. Retenção e Compliance

### Object Lock (WORM)

Configure no bucket MinIO/S3:

```bash
# MinIO CLI
mc retention set --default COMPLIANCE 7d xase/evidence/
```

### Lifecycle (expiração automática)

```json
{
  "Rules": [
    {
      "ID": "ExpireOldBundles",
      "Status": "Enabled",
      "Expiration": {
        "Days": 2555
      },
      "Filter": {
        "Prefix": "evidence/"
      }
    }
  ]
}
```

### Legal Hold

Marque bundles específicos para retenção legal:

```sql
UPDATE xase_evidence_bundles
SET legal_hold = true, retention_until = '2030-12-31'
WHERE transaction_id = 'txn_abc123';
```

---

## 10. Troubleshooting

### Storage não configurado

Se as variáveis de ambiente não estiverem definidas, o sistema:
- Loga: `[Storage] Not configured, falling back to stream mode`
- Retorna o ZIP direto (sem upload)

### Erro de upload

```
[Storage] Upload failed: AccessDenied
```

- Verifique `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD`
- Confirme que o bucket existe
- Teste acesso ao endpoint MinIO

### URL assinado expirado

URLs assinados expiram em 1 hora (3600s). Para renovar:

```bash
curl -H "X-API-Key: $XASE_API_KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc123/download?download=json"
```

---

## 11. Segurança

- **Nunca exponha `MINIO_ROOT_PASSWORD` no frontend**
- Use URLs assinados com curta validade (1h)
- Configure CORS no bucket se necessário
- Habilite HTTPS no MinIO (TLS)
- Rotacione credenciais periodicamente

---

## 12. Próximos Passos

- [ ] Configurar lifecycle/retention no bucket
- [ ] Implementar UI para histórico de bundles
- [ ] Adicionar suporte a PDF no bundle
- [ ] Integrar TSA (carimbo de tempo) nos checkpoints
- [ ] Criar job para export automático de decisões críticas

---

---

## Referências

- **MinIO Documentation**: https://min.io/docs/minio/linux/index.html
- **AWS S3 SDK for JavaScript v3**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/
- **Pre-signed URLs**: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html

---

**Última atualização:** 16 de dezembro de 2025
