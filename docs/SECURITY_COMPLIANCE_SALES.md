# XASE — Security & Compliance One-Pager

**Última atualização**: 27 de dezembro de 2025  
**Versão**: 2.0 (Production-Ready com KMS ECDSA)

---

## 🎯 Executive Summary

**XASE** é uma plataforma de evidência forense para decisões de IA que transforma cada decisão automatizada em um **registro legal verificável, imutável e compliance-ready**.

### Diferenciais de Segurança

- ✅ **Assinatura criptográfica HSM** (AWS KMS ECDSA_SHA_256)
- ✅ **Verificação offline independente** (sem depender da plataforma)
- ✅ **Ledger imutável** com hash encadeado (blockchain-like)
- ✅ **RBAC enterprise-grade** (OWNER/ADMIN/VIEWER)
- ✅ **Auditoria completa** (WORM, trilha imutável)
- ✅ **WORM storage** (Write Once Read Many) com retenção legal
- ✅ **Zero-trust architecture** (tenant isolation, CSRF, rate limiting)
- ✅ **Human-in-the-Loop** (HITL) com rastreabilidade completa

---

## 🔐 Arquitetura de Segurança

### Camadas de Proteção

```
┌─────────────────────────────────────────────────────────────┐
│                    1. Autenticação                           │
│  • NextAuth (Google OAuth + Credentials)                    │
│  • 2FA/TOTP (Authenticator apps)                            │
│  • Email OTP (fallback)                                     │
│  • API Keys (bcrypt hash, tenant-scoped)                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    2. Autorização (RBAC)                     │
│  • OWNER: acesso total                                      │
│  • ADMIN: gerenciamento + bundles                           │
│  • VIEWER: somente leitura                                  │
│  • Tenant isolation (cross-tenant bloqueado)                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    3. Proteções Web                          │
│  • CSRF tokens (double-submit cookie)                       │
│  • Rate limiting (per-tenant, per-action)                   │
│  • Security headers (CSP, HSTS, X-Frame-Options)            │
│  • Input validation (Zod schemas)                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    4. Criptografia                           │
│  • AWS KMS (HSM-backed, ECDSA P-256)                        │
│  • SHA-256 hashing (canonical JSON)                         │
│  • TLS 1.3 (transport)                                      │
│  • Bcrypt (API keys, passwords)                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    5. Auditoria                              │
│  • AuditLog (WORM via SQL triggers)                         │
│  • Todas as ações registradas                               │
│  • Tentativas negadas auditadas                             │
│  • Metadata completo (IP, User-Agent, timestamp)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    6. Storage Seguro                         │
│  • MinIO/S3 (WORM, Object Lock)                             │
│  • Retenção legal (legal hold)                              │
│  • Presigned URLs (5 min expiry)                            │
│  • Lifecycle policies (auto-expiration)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Compliance Matrix

| Regulação | Status | Evidências |
|-----------|--------|------------|
| **LGPD** (Brasil) | ✅ Compliant | Auditoria, DSR, Retenção, Consentimento |
| **GDPR** (EU) | ✅ Compliant | Right to erasure, Data portability, Audit trail |
| **SOC 2 Type II** | 🟡 Ready | Controles implementados, auditoria pendente |
| **ISO 27001** | 🟡 Ready | ISMS implementado, certificação pendente |
| **HIPAA** (US Healthcare) | 🟡 Partial | Encryption, Audit, Access Control (BAA pendente) |
| **PCI DSS** | ⚪ N/A | Não processa cartões |
| **AI Act** (EU) | ✅ Ready | Explicabilidade, Auditoria, Human oversight |

### Controles Implementados

#### 1. Integridade de Dados
- ✅ **SHA-256 hashing** de todos os records
- ✅ **Hash encadeado** (previousHash → blockchain-like)
- ✅ **Assinatura ECDSA** via AWS KMS (HSM-backed)
- ✅ **Verificação offline** independente da plataforma
- ✅ **Tamper-evident** (qualquer modificação detectada)

#### 2. Não-Repúdio
- ✅ **Assinatura criptográfica** com chave privada no HSM
- ✅ **Chave não exportável** (AWS KMS managed)
- ✅ **Timestamp confiável** (ISO 8601 UTC)
- ✅ **Prova criptográfica** incluída em cada bundle
- ✅ **Fingerprint da chave pública** publicado em canal oficial

#### 3. Auditoria Completa
- ✅ **AuditLog imutável** (WORM via SQL triggers)
- ✅ **Todas as ações registradas** (SUCCESS, FAILED, DENIED)
- ✅ **Metadata completo**: userId, tenantId, IP, User-Agent, timestamp
- ✅ **Tentativas negadas auditadas** (RBAC violations)
- ✅ **Retenção mínima**: 7 anos (configurável)

#### 4. Controle de Acesso
- ✅ **RBAC** (OWNER/ADMIN/VIEWER)
- ✅ **Tenant isolation** (cross-tenant bloqueado)
- ✅ **API Keys** (bcrypt hash, tenant-scoped, permissions)
- ✅ **Rate limiting** (per-tenant, per-action)
- ✅ **Session management** (JWT, secure cookies)

#### 5. Proteção de Dados
- ✅ **Encryption at rest** (MinIO/S3 server-side)
- ✅ **Encryption in transit** (TLS 1.3)
- ✅ **WORM storage** (Write Once Read Many)
- ✅ **Legal hold** (retenção legal)
- ✅ **Lifecycle policies** (auto-expiration após retenção)

#### 6. Privacidade
- ✅ **DSR** (Data Subject Requests) - LGPD/GDPR
- ✅ **Right to erasure** (soft delete com audit trail)
- ✅ **Data portability** (export em JSON/ZIP)
- ✅ **Consent management** (opt-in/opt-out)
- ✅ **Anonimização** (hash de PII quando necessário)

#### 7. Human-in-the-Loop (HITL)
- ✅ **Intervenção humana rastreável** (APPROVE/REJECT/OVERRIDE/ESCALATE)
- ✅ **Audit trail completo** (quem, quando, por quê)
- ✅ **Snapshot de decisão original** (AI vs Human)
- ✅ **Justificativa obrigatória** (reason field)
- ✅ **Imutabilidade** (interventions nunca deletadas)

---

## 🛡️ Garantias Legais

### O que podemos afirmar em tribunal

> **"Cada decisão da IA é assinada com uma chave criptográfica protegida por HSM (AWS KMS), não exportável, com controle de acesso restrito via IAM, trilha de auditoria completa via CloudTrail, e verificação offline independente através de chave pública publicada em canal oficial."**

### Passa em:
- ✅ **Auditorias internas** (compliance, segurança)
- ✅ **Due diligence técnica** (M&A, investidores)
- ✅ **Disputas comerciais** (prova de decisão)
- ✅ **Investigação forense** (cadeia de custódia)
- ✅ **Compliance regulatório** (LGPD, GDPR, AI Act)

### Para tribunal (adicionar):
- 🔲 **TSA** (Timestamp Authority RFC 3161) - timestamp externo confiável
- 🔲 **Notarização blockchain** (opcional, anchor em blockchain público)
- 🔲 **Certificado digital ICP-Brasil** (Brasil, assinatura qualificada)

---

## 🔑 Criptografia Enterprise

### AWS KMS Integration

**Chave**: ECC P-256 (NIST curve)  
**Algoritmo**: ECDSA_SHA_256  
**Região**: sa-east-1 (São Paulo)  
**Alias**: `alias/xase-evidence-bundles`  
**Key ID**: `70945ad8-3acc-4c54-9ce0-4728d7abb27f`

**Características**:
- ✅ **HSM-backed** (Hardware Security Module)
- ✅ **Chave não exportável** (managed by AWS)
- ✅ **IAM policy mínima** (apenas Sign + GetPublicKey)
- ✅ **CloudTrail audit** (todas as operações logadas)
- ✅ **Multi-region replication** (disponível)
- ✅ **Rotação automática** (suportada)

### Formato da Assinatura

```json
{
  "algorithm": "ECDSA_SHA_256",
  "keyId": "alias/xase-evidence-bundles",
  "signedAt": "2025-12-27T21:49:05.874Z",
  "hash": "91fb3f3f127b905c53c00f32de1be28e41fb0b6a97ab66128474ab35c5e9e048",
  "signature": "MEUCIGlEfHAK/h642AEfJjk7KIsk7Vjpe6Ip/Jcv5xBgWkqDAiEAwOTNqjO1xFnAb+1Z6gjrwMkkNPuZRHfoD33KcMuhRGI="
}
```

### Verificação Offline

**Incluído em cada bundle**:
- `records.json` - dados completos
- `signature.json` - assinatura ECDSA
- `public-key.pem` - chave pública (opcional)
- `verify.js` - script de verificação Node.js

**Comando**:
```bash
cd extracted-bundle/
node verify.js
# ✅ VERIFICATION PASSED (KMS ECDSA)
```

**Independente de**:
- ❌ Plataforma XASE (offline)
- ❌ AWS (após obter chave pública)
- ❌ Internet (verificação local)

---

## 📊 Funcionalidades Implementadas

### Core Features

#### 1. Decision Ledger (Ledger de Decisões)
- ✅ **Ingestão via API** (`POST /api/xase/v1/records`)
- ✅ **Hash encadeado** (previousHash)
- ✅ **Metadata completo**: policy, model, features, explanation
- ✅ **Payloads opcionais**: input, output, context
- ✅ **Storage externo**: S3/MinIO para payloads grandes
- ✅ **Imutabilidade**: triggers SQL impedem UPDATE/DELETE

#### 2. Policy Versioning (Versionamento de Políticas)
- ✅ **Snapshot de política** no momento da decisão
- ✅ **Versionamento semântico** (v1, v2, etc)
- ✅ **Hash SHA-256** do documento da política
- ✅ **Ativação/desativação** (is_active flag)
- ✅ **Histórico completo** (todas as versões preservadas)

#### 3. Model Cards (Fichas Técnicas de Modelos)
- ✅ **Metadata do modelo**: ID, versão, hash, framework
- ✅ **Métricas de performance**: accuracy, precision, recall, F1
- ✅ **Métricas de fairness**: demographic parity, equalized odds
- ✅ **Feature importance**: SHAP, LIME, permutation
- ✅ **Uso pretendido e limitações**
- ✅ **Considerações éticas**

#### 4. Evidence Bundles (Pacotes de Evidência)
- ✅ **Geração assíncrona** (worker + queue Postgres)
- ✅ **Filtros flexíveis**: data, policy, model, decision type
- ✅ **Formatos**: ZIP com JSON + PDF (opcional)
- ✅ **Assinatura KMS**: ECDSA_SHA_256
- ✅ **Storage durável**: MinIO/S3 com WORM
- ✅ **Download seguro**: presigned URLs (5 min)
- ✅ **Retenção legal**: legal hold + retention policies
- ✅ **RBAC**: OWNER/ADMIN apenas

#### 5. Human-in-the-Loop (HITL)
- ✅ **Intervenções rastreáveis**: APPROVE, REJECT, OVERRIDE, ESCALATE
- ✅ **Audit trail**: quem, quando, por quê, IP, User-Agent
- ✅ **Snapshot de decisão**: AI original + Human final
- ✅ **Justificativa obrigatória**: reason field
- ✅ **Metadata adicional**: notas, contexto
- ✅ **Imutabilidade**: interventions nunca deletadas
- ✅ **API pública**: `POST /api/xase/v1/records/{id}/intervene`

#### 6. Drift Detection (Detecção de Drift)
- ✅ **Data drift**: distribuição de features mudou
- ✅ **Concept drift**: relação input→output mudou
- ✅ **Prediction drift**: outputs mudaram
- ✅ **Severity levels**: LOW, MEDIUM, HIGH, CRITICAL
- ✅ **Alertas automáticos**: quando threshold excedido
- ✅ **Baseline tracking**: comparação com período de referência

#### 7. Metrics & Monitoring (Métricas e Monitoramento)
- ✅ **Snapshots periódicos**: hourly, daily, weekly, monthly
- ✅ **Métricas agregadas**: total decisions, interventions, overrides
- ✅ **Taxas calculadas**: override rate, intervention rate, approval rate
- ✅ **Performance**: avg confidence, processing time (p50, p95, p99)
- ✅ **Por modelo/política**: breakdown detalhado
- ✅ **Top override reasons**: análise de motivos

#### 8. Alerts (Alertas Proativos)
- ✅ **Regras configuráveis**: metric, operator, threshold, time window
- ✅ **Severidades**: LOW, MEDIUM, HIGH, CRITICAL
- ✅ **Notificações**: email, webhook, Slack (configurável)
- ✅ **Status tracking**: OPEN, ACKNOWLEDGED, RESOLVED
- ✅ **Cooldown**: evita spam de alertas
- ✅ **Audit trail**: quem resolveu, quando, notas

#### 9. Checkpoints (Âncoras de Integridade)
- ✅ **Checkpoints periódicos**: horário, diário, manual
- ✅ **Merkle root**: hash de múltiplos records
- ✅ **Assinatura KMS**: ECDSA_SHA_256
- ✅ **TSA token** (opcional): RFC 3161 timestamp
- ✅ **Encadeamento**: previousCheckpointId
- ✅ **Verificação**: proof of integrity

#### 10. API Keys (Autenticação de API)
- ✅ **Geração segura**: `xase_pk_` + random 32 chars
- ✅ **Bcrypt hash**: armazenamento seguro
- ✅ **Tenant-scoped**: isolamento por tenant
- ✅ **Permissions**: ingest, export, verify, intervene
- ✅ **Rate limiting**: 1000 req/hora (configurável)
- ✅ **Rotação**: criar nova key, revogar antiga
- ✅ **Audit trail**: lastUsedAt, createdAt

#### 11. Audit Log (Trilha de Auditoria)
- ✅ **WORM**: Write Once Read Many (SQL triggers)
- ✅ **Todas as ações**: SUCCESS, FAILED, DENIED
- ✅ **Metadata completo**: userId, tenantId, IP, User-Agent
- ✅ **Resource tracking**: resourceType, resourceId
- ✅ **Retenção**: 7 anos (configurável)
- ✅ **Query API**: filtros por tenant, user, action, date range

#### 12. RBAC (Role-Based Access Control)
- ✅ **Papéis**: OWNER, ADMIN, VIEWER
- ✅ **Tenant isolation**: cross-tenant bloqueado
- ✅ **Guards**: requireTenant, requireRole, assertResourceInTenant
- ✅ **Audit denied**: tentativas negadas registradas
- ✅ **Middleware**: validação em todas as rotas protegidas

#### 13. Rate Limiting
- ✅ **Per-tenant**: limites por tenant
- ✅ **Per-action**: BUNDLE_CREATE, BUNDLE_DOWNLOAD, etc
- ✅ **Janela deslizante**: 1 hora (configurável)
- ✅ **Auditoria**: tentativas bloqueadas logadas
- ✅ **Produção**: Redis (recomendado)

#### 14. CSRF Protection
- ✅ **Double-submit cookie**: x-csrf-token
- ✅ **Header validation**: x-csrf-token header
- ✅ **Origin/Referer check**: same-origin enforcement
- ✅ **Middleware**: validação automática em POST/PUT/DELETE
- ✅ **Expiry**: 7 dias

#### 15. Security Headers
- ✅ **CSP**: Content-Security-Policy
- ✅ **HSTS**: Strict-Transport-Security
- ✅ **X-Frame-Options**: DENY
- ✅ **X-Content-Type-Options**: nosniff
- ✅ **Referrer-Policy**: strict-origin-when-cross-origin
- ✅ **Permissions-Policy**: camera=(), microphone=()

---

## 🧪 Testing & Validation

### Testes Implementados

#### 1. KMS Integration Tests
```bash
# Teste unitário KMS (3/3 passed)
node scripts/test-kms-signing.mjs
# ✅ Config OK
# ✅ KMS Sign SUCCESS (ECDSA_SHA_256)
# ✅ Public Key OK
```

#### 2. Offline Verification
```bash
# Gerar bundle de teste
node scripts/sign-sample-with-kms.mjs --out extracted-bundle

# Verificar
cd extracted-bundle/
node verify.js
# ✅ VERIFICATION PASSED (KMS ECDSA)
```

#### 3. E2E Bundle Generation
```bash
# Worker com KMS
export AWS_REGION=sa-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles
node scripts/worker-bundles-prisma.mjs --poll-ms 2000

# Gerar bundle via UI
# http://localhost:3000/xase/bundles → Create

# Download e verificar
unzip bundle_*.zip -d extracted-bundle/
cd extracted-bundle/
node verify.js
# ✅ VERIFICATION PASSED (KMS ECDSA)
```

#### 4. RBAC Tests
```bash
# Testar acesso negado (VIEWER tentando criar bundle)
# Esperado: 403 Forbidden + AuditLog DENIED
```

#### 5. Rate Limiting Tests
```bash
# Exceder limite (1000 req/hora)
# Esperado: 429 Too Many Requests + AuditLog
```

#### 6. CSRF Tests
```bash
# POST sem x-csrf-token header
# Esperado: 403 CSRF validation failed
```

---

## 📈 Observabilidade

### Logs Estruturados

Todos os logs em JSON estruturado:
```json
{
  "ts": "2025-12-27T21:49:05.874Z",
  "level": "info",
  "message": "worker.job:success",
  "jobId": "20b2451f-aee1-43fd-ac9a-be42ae8d1fb1",
  "bundleId": "bundle_9ead8739a301983ad4673ac66a683cee",
  "tenantId": "tnt_demo",
  "duration": 1234
}
```

### Métricas Disponíveis

- **Decisões**: total, por tenant, por modelo, por política
- **Intervenções**: total, override rate, approval rate
- **Bundles**: gerados, downloads, tamanho médio
- **Performance**: p50, p95, p99 processing time
- **Drift**: detecções, severity distribution
- **Alertas**: triggered, acknowledged, resolved

### Integração com Observability Tools

- ✅ **Sentry**: error tracking (configurável via `SENTRY_DSN`)
- ✅ **CloudWatch**: logs + metrics (AWS)
- ✅ **Datadog**: APM + logs (via agent)
- ✅ **Prometheus**: metrics export (via `/metrics` endpoint)
- ✅ **Grafana**: dashboards customizados

---

## 💰 Custos de Operação

### AWS KMS

**Pricing** (sa-east-1):
- Chave assimétrica: **$1.00/mês**
- Sign operation: **$0.15 por 10,000 operações**

**Exemplo**:
- 100,000 bundles/mês = 10,000 assinaturas
- Custo: $1.00 (chave) + $0.15 (signs) = **$1.15/mês**

### MinIO/S3 Storage

**Pricing** (estimativa):
- Storage: **$0.023/GB/mês** (S3 Standard)
- PUT requests: **$0.005 por 1,000 requests**
- GET requests: **$0.0004 por 1,000 requests**

**Exemplo**:
- 10,000 bundles/mês × 1MB = 10GB
- Custo: 10GB × $0.023 = **$0.23/mês**

### Total Estimado

- **Startup** (< 10k bundles/mês): **~$2/mês**
- **Growth** (100k bundles/mês): **~$5/mês**
- **Enterprise** (1M bundles/mês): **~$20/mês**

---

## 🚀 Deployment Checklist

### Obrigatório (Production)

- [ ] **AWS KMS configurado** (chave ECC P-256, IAM policy mínima)
- [ ] **MinIO/S3 configurado** (WORM, Object Lock, Lifecycle)
- [ ] **Database migrations** (Prisma migrate deploy)
- [ ] **Environment variables** (AWS_REGION, KMS_KEY_ID, DATABASE_URL, etc)
- [ ] **Worker rodando** (PM2, Docker, Kubernetes)
- [ ] **HTTPS/TLS** (certificado válido)
- [ ] **Security headers** (CSP, HSTS, etc)
- [ ] **Rate limiting** (Redis recomendado)
- [ ] **Monitoring** (Sentry, CloudWatch, etc)
- [ ] **Backup database** (automated, encrypted)
- [ ] **Disaster recovery plan** (RTO/RPO definidos)

### Recomendado

- [ ] **CloudTrail habilitado** (audit trail AWS)
- [ ] **Alertas configurados** (drift, volume anormal, falhas)
- [ ] **Rotação de chaves planejada** (90 dias)
- [ ] **Penetration testing** (anual)
- [ ] **Security code review** (trimestral)
- [ ] **Compliance audit** (SOC 2, ISO 27001)
- [ ] **Incident response plan** (documentado e testado)
- [ ] **Business continuity plan** (DR drills)

### Opcional (Enterprise+)

- [ ] **TSA integration** (RFC 3161 timestamp)
- [ ] **HSM dedicado** (não compartilhado)
- [ ] **Multi-region replication** (HA)
- [ ] **SOC 2 Type II** (auditoria externa)
- [ ] **ISO 27001** (certificação)
- [ ] **ICP-Brasil** (certificado digital qualificado)

---

## 📞 Suporte e Contato

**Documentação técnica**: `/docs`  
**API Reference**: `/docs/api`  
**Security**: `security@xase.ai`  
**Compliance**: `compliance@xase.ai`  
**Sales**: `sales@xase.ai`

---

**XASE** — Transformando decisões de IA em evidência legal verificável.
