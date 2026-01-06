# XASE Core - Arquitetura de Segurança Enterprise

## Visão Geral

Sistema de ledger imutável para decisões de IA com assinatura criptográfica via KMS (Key Management Service).

## Princípios de Segurança

### 1. Separação de Responsabilidades

```
┌─────────────────┐
│   API Xase      │
│  (ingest/export)│
└────────┬────────┘
         │
         │ (request sign hash)
         ▼
┌─────────────────┐
│ Signing Service │ ◄── Rate Limit
│  (validation)   │ ◄── Context Binding
└────────┬────────┘ ◄── Audit Log
         │
         │ (sign DIGEST)
         ▼
┌─────────────────┐
│   AWS KMS       │
│  (HSM-backed)   │
└─────────────────┘
```

**Por quê?**
- Mesmo se a API for comprometida, o atacante não pode assinar qualquer coisa
- Validação de contexto (tenant, tipo, versão) antes de assinar
- Rate limiting independente
- Auditoria separada

### 2. Assinatura de Hash (não JSON direto)

❌ **ERRADO:**
```typescript
kms.sign(JSON.stringify(decision))
```

✅ **CORRETO:**
```typescript
const canonical = canonicalizeJSON(decision)
const hash = sha256(canonical)
kms.sign(hash, { MessageType: 'DIGEST' })
```

**Por quê?**
- Evita ataques de ambiguidade (whitespace, ordem de campos, encoding)
- Hash determinístico (SHA-256)
- Assinatura menor e mais rápida
- Verificação offline independente

### 3. Canonicalização JSON (JCS-like)

```typescript
function canonicalize(obj) {
  // 1. Ordenar chaves alfabeticamente
  // 2. Remover whitespace
  // 3. Encoding UTF-8 consistente
  // 4. Sem trailing commas
}
```

**Garante:**
- Mesmo JSON → mesmo hash
- Verificação determinística
- Compatibilidade cross-platform

### 4. Context Binding

Antes de assinar, validamos:

```typescript
{
  tenantId: string,        // Quem está pedindo
  resourceType: string,    // O que está sendo assinado
  resourceId: string,      // ID único do recurso
  hash: string,            // SHA-256 hex (64 chars)
  metadata: {              // Contexto adicional
    policy_id?: string,
    decision_type?: string
  }
}
```

**Proteções:**
- Tenant não pode assinar recursos de outro tenant
- Tipo de recurso validado (decision, checkpoint, export)
- Hash validado (formato SHA-256)
- Metadata auditada

### 5. Rate Limiting

```typescript
const RATE_LIMIT_MAX_SIGNS = 1000  // por hora
const RATE_LIMIT_WINDOW_MS = 3600000
```

**Por tenant:**
- 1000 assinaturas/hora (ajustável)
- Janela deslizante de 1 hora
- Bloqueio automático se exceder
- Logs de tentativas bloqueadas

**Produção:** usar Redis para rate limit distribuído

### 6. Auditoria Completa

Toda assinatura gera log:

```json
{
  "action": "HASH_SIGNED",
  "tenantId": "tnt_123",
  "resourceType": "EXPORT",
  "resourceId": "txn_abc",
  "metadata": {
    "keyId": "arn:aws:kms:...",
    "keyFingerprint": "a1b2c3d4...",
    "algorithm": "RSA-SHA256",
    "policy_id": "policy_v1"
  },
  "status": "SUCCESS",
  "timestamp": "2025-01-15T10:31:22Z"
}
```

**Casos de falha também são auditados:**
- `SIGN_REJECTED` - validação falhou
- `SIGN_RATE_LIMITED` - limite excedido
- `SIGN_KMS_ERROR` - erro no KMS

## Configuração AWS KMS

### Criar Chave

```bash
aws kms create-key \
  --key-usage SIGN_VERIFY \
  --customer-master-key-spec RSA_2048 \
  --description "XASE Evidence Signing Key"
```

### IAM Policy (Mínimo Necessário)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSignOnly",
      "Effect": "Allow",
      "Action": [
        "kms:Sign",
        "kms:GetPublicKey"
      ],
      "Resource": "arn:aws:kms:REGION:ACCOUNT:key/KEY_ID",
      "Condition": {
        "StringEquals": {
          "kms:SigningAlgorithm": "RSASSA_PKCS1_V1_5_SHA_256"
        }
      }
    }
  ]
}
```

**O que isso bloqueia:**
- ❌ `kms:Decrypt`
- ❌ `kms:Encrypt`
- ❌ `kms:ExportKey`
- ❌ Algoritmos diferentes de RSA-SHA256

### Variáveis de Ambiente

```bash
# AWS KMS
XASE_KMS_TYPE=aws
XASE_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789:key/abc-def
XASE_KMS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Mock (desenvolvimento)
XASE_KMS_TYPE=mock
XASE_MOCK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----..."
XASE_MOCK_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----..."
```

## Verificação Offline

### proof.json (Enterprise)

```json
{
  "type": "xase.decision.proof",
  "version": "1.0.0",
  "hash_algo": "SHA-256",
  "signature_algo": "RSA-SHA256",
  "hash": "sha256:a1b2c3...",
  "signature": "base64...",
  "key_id": "arn:aws:kms:...",
  "key_fingerprint": "f1e2d3c4...",
  "issuer": "xase.ai",
  "signed_at": "2025-01-15T10:31:22Z",
  "public_key_pem": "-----BEGIN PUBLIC KEY-----...",
  "notes": "Canonical JSON (JCS) hashed with SHA-256. Signature covers hash (DIGEST mode). Verify fingerprint against official channel."
}
```

### verify.js (Incluído no ZIP)

```javascript
const crypto = require('crypto')
const fs = require('fs')

// 1. Canonicalizar decision.json
const canonical = canonicalize(decision)

// 2. Hash SHA-256
const hash = sha256(canonical)

// 3. Verificar hash
console.log('✓ Hash match:', proof.hash === `sha256:${hash}`)

// 4. Verificar assinatura
const verify = crypto.createVerify('RSA-SHA256')
verify.update(Buffer.from(hash, 'hex'))
const ok = verify.verify(proof.public_key_pem, Buffer.from(proof.signature, 'base64'))
console.log('✓ Signature valid:', ok)

// 5. Verificar fingerprint (trust anchor)
const keyHash = sha256(proof.public_key_pem)
console.log('ℹ️ Key fingerprint:', keyHash.substring(0,16))
console.log('ℹ️ Verify against official channel')
```

### Trust Anchor (Fingerprint)

**Publicar em canais oficiais:**
- Site: `https://xase.ai/.well-known/signing-keys.json`
- Docs: `https://docs.xase.ai/security/keys`
- GitHub: `SECURITY.md`

```json
{
  "keys": [
    {
      "key_id": "arn:aws:kms:...",
      "fingerprint": "f1e2d3c4e5f6...",
      "algorithm": "RSA-SHA256",
      "valid_from": "2025-01-01",
      "valid_until": "2026-01-01",
      "status": "active"
    }
  ]
}
```

## Monitoramento e Alertas

### CloudTrail (AWS)

```json
{
  "eventName": "Sign",
  "eventSource": "kms.amazonaws.com",
  "requestParameters": {
    "keyId": "...",
    "signingAlgorithm": "RSASSA_PKCS1_V1_5_SHA_256"
  }
}
```

### Alertas Recomendados

1. **Volume anormal**
   - Mais de 1000 assinaturas/hora por tenant
   - Spike súbito (>10x média)

2. **Horário incomum**
   - Assinaturas fora do horário comercial
   - Tenant específico com padrão suspeito

3. **Falhas repetidas**
   - Rate limit excedido múltiplas vezes
   - Validação falhando consistentemente

4. **Tenant inesperado**
   - Tenant novo assinando volumes altos
   - Tenant inativo voltando a assinar

## Rotação de Chaves

### Processo

1. **Criar nova chave no KMS**
2. **Atualizar `XASE_KMS_KEY_ID`**
3. **Publicar novo fingerprint**
4. **Manter chave antiga por 90 dias** (para verificação de provas antigas)
5. **Desabilitar chave antiga**

### Backward Compatibility

```typescript
// proof.json inclui key_id
{
  "key_id": "arn:aws:kms:...:key/OLD_KEY",
  "signature": "..."
}

// Verificação busca chave correta
const publicKey = await getPublicKeyByKeyId(proof.key_id)
```

## Checklist de Produção

### Obrigatório

- [ ] KMS com chave assimétrica (RSA 2048+)
- [ ] IAM policy mínima (apenas Sign + GetPublicKey)
- [ ] Signing service separado da API
- [ ] Hash canônico (JCS)
- [ ] Assinatura de DIGEST (não RAW)
- [ ] Context binding (tenant + tipo)
- [ ] Rate limiting
- [ ] Auditoria completa
- [ ] proof.json com fingerprint
- [ ] verify.js funcional offline
- [ ] Fingerprint publicado em canal oficial

### Recomendado

- [ ] CloudTrail habilitado
- [ ] Alertas configurados
- [ ] Rotação de chaves planejada
- [ ] Backup de chaves antigas
- [ ] Documentação de segurança
- [ ] Testes de penetração
- [ ] Revisão de código de segurança

### Opcional (Enterprise+)

- [ ] TSA (Timestamp Authority) para provas temporais
- [ ] HSM dedicado (não compartilhado)
- [ ] Multi-region replication
- [ ] Disaster recovery plan
- [ ] SOC 2 Type II compliance
- [ ] ISO 27001 certification

## Garantias Legais

Com essa arquitetura, você pode afirmar:

> "Este documento foi assinado com uma chave criptográfica protegida por HSM (AWS KMS), não exportável, com controle de acesso restrito via IAM, trilha de auditoria completa via CloudTrail, e verificação offline independente através de chave pública publicada em canal oficial."

**Passa em:**
- ✅ Auditorias internas
- ✅ Due diligence técnica
- ✅ Disputas comerciais
- ✅ Investigação forense
- ✅ Compliance (GDPR, LGPD, SOC 2)

**Para tribunal:**
- Adicionar TSA (Timestamp Authority RFC 3161)
- Notarização blockchain (opcional)
- Certificado digital ICP-Brasil (Brasil)

## Referências

- [AWS KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)
- [RFC 8785 - JSON Canonicalization Scheme (JCS)](https://datatracker.ietf.org/doc/html/rfc8785)
- [NIST FIPS 186-4 - Digital Signature Standard](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
