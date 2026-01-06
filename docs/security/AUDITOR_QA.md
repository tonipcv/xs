# XASE — Auditor Q&A (Perguntas e Respostas)

**Versão**: 2.0  
**Data**: 27 de dezembro de 2025  
**Público**: Auditores, Compliance Officers, CISOs, Reguladores

---

## 🎯 Sobre este Documento

Este documento antecipa e responde às perguntas mais comuns de auditores técnicos, compliance officers e reguladores sobre a arquitetura de segurança e compliance da plataforma XASE.

---

## 1. Integridade e Não-Repúdio

### Q1.1: Como vocês garantem que uma decisão não pode ser alterada após ser registrada?

**R**: Implementamos múltiplas camadas de proteção:

1. **Triggers SQL (WORM)**: Triggers `BEFORE UPDATE` e `BEFORE DELETE` nas tabelas `xase_decision_records`, `xase_human_interventions` e `xase_audit_logs` impedem qualquer modificação ou deleção após criação.

2. **Hash encadeado**: Cada record contém:
   - `recordHash`: SHA-256 do record atual
   - `previousHash`: hash do record anterior
   - Qualquer modificação quebra a cadeia (blockchain-like)

3. **Assinatura criptográfica**: Cada bundle é assinado com AWS KMS (ECDSA_SHA_256, HSM-backed). A assinatura cobre o hash SHA-256 do `records.json` completo.

4. **Audit trail**: Toda tentativa de modificação (mesmo bloqueada) é registrada em `AuditLog` com status `DENIED`.

**Evidência**: 
- SQL triggers: `prisma/migrations/*/migration.sql`
- Código de assinatura: `scripts/worker-bundles-prisma.mjs` (linha 180-220)
- Teste E2E: `✅ VERIFICATION PASSED (KMS ECDSA)`

---

### Q1.2: A assinatura digital é válida legalmente?

**R**: Sim, com ressalvas:

**Válido para**:
- ✅ Auditorias internas e externas
- ✅ Due diligence técnica
- ✅ Disputas comerciais (B2B)
- ✅ Investigações forenses
- ✅ Compliance regulatório (LGPD, GDPR, AI Act)

**Características da assinatura**:
- Algoritmo: ECDSA_SHA_256 (NIST P-256)
- Chave privada: HSM-backed (AWS KMS), não exportável
- Controle de acesso: IAM policy mínima (apenas `kms:Sign`, `kms:GetPublicKey`)
- Audit trail: CloudTrail registra todas as operações de assinatura
- Verificação offline: independente da plataforma XASE

**Para uso em tribunal** (Brasil):
- Adicionar: **ICP-Brasil** (certificado digital qualificado)
- Adicionar: **TSA** (Timestamp Authority RFC 3161) para timestamp confiável
- Opcional: Notarização blockchain (anchor em blockchain público)

**Referências legais**:
- MP 2.200-2/2001 (ICP-Brasil)
- Lei 14.063/2020 (assinaturas eletrônicas)
- LGPD Art. 46 (segurança da informação)

---

### Q1.3: Como vocês provam que a chave privada não foi comprometida?

**R**: A chave privada **nunca sai do HSM**:

1. **AWS KMS**: Chave gerenciada pela AWS, armazenada em HSM FIPS 140-2 Level 3.
2. **Não exportável**: Impossível extrair a chave privada (managed key).
3. **IAM policy mínima**: Apenas `kms:Sign` e `kms:GetPublicKey`. Sem `kms:Decrypt`, `kms:Encrypt` ou `kms:ExportKey`.
4. **CloudTrail audit**: Todas as operações logadas (quem, quando, de onde).
5. **Rotação**: Suportamos rotação de chaves (criar nova, manter antiga por 90 dias para verificação de provas antigas).

**Evidência**:
- IAM policy: `docs/KMS_SETUP.md`
- CloudTrail logs: disponíveis via AWS Console
- Key metadata: `aws kms describe-key --key-id alias/xase-evidence-bundles`

**Trust anchor**:
- Publicamos o **fingerprint da chave pública** em canal oficial:
  - Site: `https://xase.ai/.well-known/signing-keys.json`
  - Docs: `https://docs.xase.ai/security/keys`
  - GitHub: `SECURITY.md`

---

### Q1.4: E se a AWS for comprometida?

**R**: Mitigações em camadas:

1. **Multi-region replication**: Chave replicada em múltiplas regiões AWS (disponível, não implementado por padrão).
2. **Backup da chave pública**: Armazenada em múltiplos locais (S3, GitHub, site oficial).
3. **Verificação offline**: Qualquer pessoa com a chave pública pode verificar assinaturas antigas, independente da AWS.
4. **Rotação proativa**: Se houver suspeita de comprometimento, rotacionamos a chave imediatamente.
5. **Notificação**: Publicamos novo fingerprint em todos os canais oficiais.

**Plano de contingência**:
- Detectar: CloudTrail alertas para operações anormais
- Responder: Revogar chave comprometida (disable no KMS)
- Recuperar: Criar nova chave, publicar novo fingerprint
- Comunicar: Notificar clientes via email + site oficial

---

## 2. Controle de Acesso e Autenticação

### Q2.1: Como vocês controlam quem pode acessar os dados?

**R**: RBAC (Role-Based Access Control) com 3 níveis:

| Papel | Permissões |
|-------|------------|
| **OWNER** | Acesso total: criar, ler, baixar, gerenciar usuários |
| **ADMIN** | Criar e baixar bundles, ler decisões, gerenciar políticas |
| **VIEWER** | Somente leitura: ver decisões, ver bundles (sem download) |

**Implementação**:
- Guards: `requireTenant()`, `requireRole()`, `assertResourceInTenant()`
- Middleware: Validação em todas as rotas protegidas
- Tenant isolation: Cross-tenant bloqueado (resource.tenantId === ctx.tenantId)
- Audit trail: Tentativas negadas registradas com status `DENIED`

**Código**: `src/lib/xase/rbac.ts`

---

### Q2.2: Como vocês autenticam usuários?

**R**: Múltiplos métodos:

1. **NextAuth (UI)**:
   - Google OAuth 2.0
   - Credenciais (email + senha bcrypt)
   - 2FA/TOTP (Authenticator apps)
   - Email OTP (fallback)

2. **API Keys (API)**:
   - Formato: `xase_pk_` + 32 chars random
   - Armazenamento: bcrypt hash (salt rounds: 10)
   - Tenant-scoped: cada key associada a um tenant
   - Permissions: `ingest`, `export`, `verify`, `intervene`
   - Rate limiting: 1000 req/hora (configurável)

**Código**:
- NextAuth: `src/lib/auth.ts`
- API Keys: `src/lib/xase/auth.ts`

---

### Q2.3: Como vocês protegem contra ataques de força bruta?

**R**: Múltiplas camadas:

1. **Rate limiting**:
   - Per-tenant: 1000 req/hora (configurável)
   - Per-action: limites específicos (ex: 10 bundles/hora)
   - Janela deslizante: 1 hora
   - Bloqueio automático: 429 Too Many Requests

2. **Account lockout** (planejado):
   - 5 tentativas de login falhadas → bloqueio temporário (15 min)
   - 10 tentativas → bloqueio permanente (requer admin)

3. **CAPTCHA** (planejado):
   - Após 3 tentativas falhadas
   - reCAPTCHA v3 (invisible)

4. **Audit trail**:
   - Todas as tentativas falhadas logadas
   - IP, User-Agent, timestamp

**Código**: `src/lib/xase/rate-limit.ts`

---

### Q2.4: Vocês suportam SSO (Single Sign-On)?

**R**: Sim, via NextAuth:

- ✅ **Google OAuth** (implementado)
- 🔲 **Microsoft Azure AD** (planejado)
- 🔲 **Okta** (planejado)
- 🔲 **SAML 2.0** (planejado)

**Configuração**: `src/lib/auth.ts` (adicionar provider)

---

## 3. Proteção de Dados e Privacidade

### Q3.1: Como vocês protegem dados sensíveis (PII)?

**R**: Múltiplas estratégias:

1. **Minimização de dados**:
   - Armazenamos apenas hashes de inputs/outputs por padrão
   - Payloads completos são opcionais (`includePayloads=true`)
   - Cliente controla o que envia

2. **Encryption at rest**:
   - Database: PostgreSQL com encryption at rest (provider-dependent)
   - Storage: MinIO/S3 server-side encryption (SSE-S3 ou SSE-KMS)

3. **Encryption in transit**:
   - TLS 1.3 (HTTPS)
   - Certificate pinning (recomendado para mobile apps)

4. **Anonimização**:
   - Suportamos hash de PII antes de enviar (cliente-side)
   - Exemplo: `cpf_hash: sha256(cpf)` em vez de `cpf: "123.456.789-00"`

5. **Retenção**:
   - Configurável por tenant (7 anos padrão)
   - Legal hold: bloqueia deleção durante investigação
   - Auto-expiration: lifecycle policies após retenção

**Código**: `src/lib/xase/storage.ts`, `src/lib/xase/crypto.ts`

---

### Q3.2: Vocês são compliance com LGPD/GDPR?

**R**: Sim, implementamos os principais requisitos:

| Requisito | LGPD | GDPR | Status | Evidência |
|-----------|------|------|--------|-----------|
| **Consentimento** | Art. 7º | Art. 6(1)(a) | ✅ | Opt-in no ingest |
| **Finalidade** | Art. 6º | Art. 5(1)(b) | ✅ | Purpose field obrigatório |
| **Minimização** | Art. 6º | Art. 5(1)(c) | ✅ | Hashes por padrão |
| **Transparência** | Art. 9º | Art. 12-14 | ✅ | Policy snapshot + explicação |
| **Segurança** | Art. 46 | Art. 32 | ✅ | Encryption + audit trail |
| **Direito de acesso** | Art. 18(I) | Art. 15 | ✅ | Export API |
| **Direito de retificação** | Art. 18(III) | Art. 16 | ⚠️ | Imutabilidade (ver Q3.3) |
| **Direito de exclusão** | Art. 18(VI) | Art. 17 | ✅ | Soft delete + audit |
| **Portabilidade** | Art. 18(V) | Art. 20 | ✅ | Export JSON/ZIP |
| **Notificação de breach** | Art. 48 | Art. 33-34 | ✅ | Incident response plan |

**Documentação**: `docs/DPA.md` (Data Processing Addendum)

---

### Q3.3: Como vocês lidam com o "direito ao esquecimento" se os dados são imutáveis?

**R**: Implementamos **soft delete** com audit trail:

1. **Não deletamos fisicamente**: Records permanecem no ledger (imutabilidade).
2. **Marcamos como "deleted"**: Flag `is_deleted=true` + `deleted_at` timestamp.
3. **Ocultamos da UI**: Records deletados não aparecem em listagens.
4. **Mantemos audit trail**: Registro de quem deletou, quando, por quê.
5. **Anonimizamos payloads**: Substituímos PII por `[REDACTED]` ou hash.

**Justificativa legal**:
- LGPD Art. 16: "Os dados pessoais serão eliminados após o término de seu tratamento..."
- **Exceção**: Art. 16, §1º: "...salvo nas hipóteses previstas no art. 16."
  - Inciso I: "cumprimento de obrigação legal ou regulatória"
  - Inciso II: "estudo por órgão de pesquisa"
  - **Inciso III: "transferência a terceiro" (nosso caso: evidência legal)**

**Documentação**: `docs/DSR_GUIDE.md` (Data Subject Requests)

---

### Q3.4: Vocês fazem transferência internacional de dados?

**R**: Depende da configuração:

**Cenário 1: Tudo no Brasil**
- Database: Brasil (sa-east-1)
- Storage: Brasil (MinIO local ou S3 sa-east-1)
- KMS: Brasil (sa-east-1)
- ✅ **Sem transferência internacional**

**Cenário 2: Multi-region**
- Database: Brasil (primary) + US (replica)
- Storage: Brasil (primary) + US (backup)
- KMS: Brasil (primary) + US (replica)
- ⚠️ **Transferência internacional** (requer adequação LGPD Art. 33)

**Adequação para transferência**:
- ✅ **Cláusulas contratuais padrão** (SCC - Standard Contractual Clauses)
- ✅ **Adequação do país** (se US: Privacy Shield invalidado, usar SCC)
- ✅ **Consentimento do titular** (opt-in explícito)
- ✅ **Garantias de segurança** (encryption, audit trail)

**Documentação**: `docs/DPA.md` (Data Processing Addendum)

---

## 4. Auditoria e Rastreabilidade

### Q4.1: Como vocês garantem que o audit log não pode ser alterado?

**R**: WORM (Write Once Read Many) via SQL triggers:

```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is immutable (WORM). Cannot UPDATE or DELETE.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable_update
BEFORE UPDATE ON xase_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER audit_log_immutable_delete
BEFORE DELETE ON xase_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

**Evidência**:
- Migrations: `prisma/migrations/*/migration.sql`
- Teste: Tentar `UPDATE` ou `DELETE` → erro `AuditLog is immutable`

---

### Q4.2: O que vocês auditam?

**R**: Todas as ações relevantes:

**Categoria: API Keys**
- `KEY_CREATED`, `KEY_ROTATED`, `KEY_REVOKED`, `KEY_ACCESSED`

**Categoria: Bundles**
- `BUNDLE_CREATED`, `BUNDLE_DOWNLOADED`, `BUNDLE_STORED`, `BUNDLE_REPROCESSED`

**Categoria: Decisões**
- `RECORD_CREATED`, `RECORD_ACCESSED`, `RECORD_EXPORTED`

**Categoria: Intervenções Humanas**
- `HUMAN_REVIEW_REQUESTED`, `HUMAN_APPROVED`, `HUMAN_REJECTED`, `HUMAN_OVERRIDE`, `HUMAN_ESCALATED`

**Categoria: Admin**
- `TENANT_CREATED`, `TENANT_SUSPENDED`, `USER_ADDED`, `USER_REMOVED`, `ROLE_CHANGED`

**Categoria: DSR (LGPD/GDPR)**
- `DSR_REQUEST`, `DSR_FULFILLED`

**Categoria: Checkpoints**
- `CHECKPOINT_CREATED`, `CHECKPOINT_VERIFIED`

**Metadata auditado**:
- `userId`: quem executou
- `tenantId`: em qual tenant
- `action`: qual ação
- `resourceType`: tipo de recurso (BUNDLE, RECORD, etc)
- `resourceId`: ID do recurso
- `status`: SUCCESS, FAILED, DENIED
- `ipAddress`: IP de origem
- `userAgent`: browser/client
- `timestamp`: quando (ISO 8601 UTC)
- `metadata`: JSON com contexto adicional

**Código**: `src/lib/xase/audit.ts`

---

### Q4.3: Por quanto tempo vocês retêm os logs de auditoria?

**R**: **7 anos** (padrão), configurável por tenant.

**Justificativa**:
- LGPD: Não especifica prazo, mas recomenda "tempo necessário"
- SOC 2: Mínimo 1 ano
- ISO 27001: Mínimo 1 ano
- Indústria financeira: 5-7 anos (Bacen, CVM)
- Indústria saúde: 20 anos (CFM)

**Lifecycle**:
- Retenção: 7 anos (configurável)
- Após retenção: Arquivamento (cold storage) ou deleção
- Legal hold: Bloqueia deleção durante investigação

**Configuração**: `retentionYears` em `Tenant` model

---

### Q4.4: Vocês suportam export de audit logs para SIEM?

**R**: Sim, múltiplas formas:

1. **API Query**:
   ```bash
   GET /api/xase/v1/audit-logs?tenantId=tnt_123&startDate=2025-01-01&endDate=2025-12-31
   ```

2. **Database export**:
   ```sql
   COPY (SELECT * FROM xase_audit_logs WHERE tenant_id = 'tnt_123') TO '/tmp/audit.csv' CSV HEADER;
   ```

3. **Streaming** (planejado):
   - Kinesis Data Firehose → S3 → Athena
   - CloudWatch Logs → Elasticsearch
   - Webhook → SIEM (Splunk, QRadar, etc)

**Formato**: JSON estruturado (facilita parsing)

---

## 5. Infraestrutura e Operações

### Q5.1: Onde os dados são armazenados?

**R**: Configurável por cliente:

**Database (PostgreSQL)**:
- Opção 1: AWS RDS (sa-east-1, Brasil)
- Opção 2: Self-hosted (on-premise)
- Opção 3: Managed (Neon, Supabase, Railway)

**Storage (MinIO/S3)**:
- Opção 1: AWS S3 (sa-east-1, Brasil)
- Opção 2: MinIO self-hosted (on-premise)
- Opção 3: Cloudflare R2 (global)

**KMS (Key Management)**:
- Opção 1: AWS KMS (sa-east-1, Brasil)
- Opção 2: HSM dedicado (on-premise)
- Opção 3: Mock KMS (dev/test apenas)

**Recomendação para compliance**:
- Brasil: sa-east-1 (São Paulo) para tudo
- EU: eu-west-1 (Irlanda) para tudo
- US: us-east-1 (Virgínia) para tudo

---

### Q5.2: Vocês têm backup e disaster recovery?

**R**: Sim, múltiplas camadas:

**Database**:
- ✅ **Automated backups**: diários (RDS automated backups)
- ✅ **Point-in-time recovery**: até 35 dias (RDS PITR)
- ✅ **Manual snapshots**: antes de mudanças críticas
- ✅ **Cross-region replication**: opcional (RDS read replica)
- ✅ **Encryption**: backups encrypted at rest

**Storage**:
- ✅ **Versioning**: S3 versioning habilitado
- ✅ **Cross-region replication**: opcional (S3 CRR)
- ✅ **Lifecycle**: transição para Glacier após 90 dias
- ✅ **Object Lock**: WORM (Write Once Read Many)

**Disaster Recovery**:
- **RTO** (Recovery Time Objective): < 4 horas
- **RPO** (Recovery Point Objective): < 1 hora
- **DR drill**: trimestral (testamos restore completo)

**Documentação**: `docs/DR_PLAN.md`

---

### Q5.3: Como vocês protegem contra ransomware?

**R**: Defesa em profundidade:

1. **WORM storage**: S3 Object Lock (compliance mode)
   - Bundles não podem ser deletados ou modificados
   - Nem mesmo root account pode deletar

2. **Versioning**: S3 versioning habilitado
   - Versões antigas preservadas
   - Recuperação de versão anterior

3. **Backup offline**: Snapshots em storage separado
   - Air-gapped (sem acesso direto da aplicação)
   - Encrypted at rest

4. **IAM least privilege**: Aplicação não tem `s3:DeleteObject`
   - Apenas `s3:PutObject`, `s3:GetObject`

5. **MFA Delete**: Requer MFA para deletar objetos (S3)

6. **Monitoring**: CloudWatch alertas para deleções anormais

**Documentação**: `docs/SECURITY_POLICY.md`

---

### Q5.4: Vocês têm plano de resposta a incidentes?

**R**: Sim, documentado e testado:

**Fases**:
1. **Detecção**: Monitoring + alertas automáticos
2. **Contenção**: Isolar sistemas afetados
3. **Erradicação**: Remover causa raiz
4. **Recuperação**: Restore de backups
5. **Lições aprendidas**: Post-mortem + melhorias

**Equipe**:
- Incident Commander: CTO
- Security Lead: CISO
- Engineering Lead: Lead Engineer
- Communications: CEO/CMO

**SLAs**:
- **Critical** (data breach, ransomware): resposta em 1 hora
- **High** (outage, performance): resposta em 4 horas
- **Medium** (bugs, minor issues): resposta em 24 horas

**Notificação**:
- Clientes afetados: dentro de 24 horas
- ANPD (LGPD): dentro de 72 horas (se breach de PII)
- Autoridades: conforme legislação local

**Documentação**: `docs/INCIDENT_RESPONSE_PLAN.md`

---

## 6. Compliance e Certificações

### Q6.1: Vocês têm certificações de segurança?

**R**: Status atual:

| Certificação | Status | Previsão |
|--------------|--------|----------|
| **SOC 2 Type I** | 🔲 Planejado | Q2 2026 |
| **SOC 2 Type II** | 🔲 Planejado | Q4 2026 |
| **ISO 27001** | 🔲 Planejado | Q3 2026 |
| **ISO 27701** (Privacy) | 🔲 Planejado | Q4 2026 |
| **PCI DSS** | ⚪ N/A | Não aplicável |
| **HIPAA** | 🔲 Planejado | Q2 2026 (BAA) |

**Controles implementados** (prontos para auditoria):
- ✅ Access Control (AC)
- ✅ Audit and Accountability (AU)
- ✅ Identification and Authentication (IA)
- ✅ System and Communications Protection (SC)
- ✅ System and Information Integrity (SI)

**Documentação**: `docs/COMPLIANCE_MATRIX.md`

---

### Q6.2: Vocês fazem penetration testing?

**R**: Planejado:

**Frequência**: Anual (mínimo)

**Escopo**:
- ✅ Web application (OWASP Top 10)
- ✅ API (OWASP API Security Top 10)
- ✅ Infrastructure (network, cloud)
- ✅ Social engineering (phishing simulation)

**Metodologia**:
- OWASP Testing Guide
- NIST SP 800-115
- PTES (Penetration Testing Execution Standard)

**Vendor**: Terceiro independente (a contratar)

**Remediação**: Críticos em 7 dias, High em 30 dias, Medium em 90 dias

---

### Q6.3: Vocês têm programa de bug bounty?

**R**: Planejado para Q2 2026:

**Plataforma**: HackerOne ou Bugcrowd

**Escopo**:
- ✅ Web application (*.xase.ai)
- ✅ API (api.xase.ai)
- ❌ Infrastructure (fora de escopo)
- ❌ Social engineering (fora de escopo)

**Recompensas**:
- Critical: $500 - $2,000
- High: $250 - $500
- Medium: $100 - $250
- Low: $50 - $100

**Disclosure**: Responsible disclosure (90 dias)

---

### Q6.4: Como vocês lidam com vulnerabilidades de dependências?

**R**: Múltiplas camadas:

1. **Dependabot** (GitHub): Alertas automáticos + PRs
2. **npm audit**: Rodado em CI/CD
3. **Snyk**: Scanning contínuo (planejado)
4. **Renovate**: Auto-update de dependências

**SLA de remediação**:
- **Critical**: 7 dias
- **High**: 30 dias
- **Medium**: 90 dias
- **Low**: Best effort

**Processo**:
1. Alerta recebido (Dependabot, npm audit)
2. Triagem: avaliar impacto e exploitabilidade
3. Patch: atualizar dependência ou aplicar workaround
4. Test: rodar suite de testes
5. Deploy: staging → production
6. Comunicação: se afeta clientes, notificar

---

## 7. Human-in-the-Loop (HITL)

### Q7.1: Como vocês rastreiam intervenções humanas?

**R**: Modelo `HumanIntervention` com audit trail completo:

**Campos auditados**:
- `action`: REVIEW_REQUESTED, APPROVED, REJECTED, OVERRIDE, ESCALATED
- `actorUserId`: ID do usuário que interveio
- `actorName`: Nome (snapshot no momento)
- `actorEmail`: Email (snapshot no momento)
- `actorRole`: Papel (snapshot no momento)
- `reason`: Justificativa obrigatória
- `notes`: Notas adicionais
- `metadata`: JSON com contexto
- `newOutcome`: Novo resultado (se OVERRIDE)
- `previousOutcome`: Resultado anterior da IA
- `ipAddress`: IP de origem
- `userAgent`: Browser/client
- `timestamp`: Quando (ISO 8601 UTC)

**Imutabilidade**: Triggers SQL impedem UPDATE/DELETE

**Código**: `src/lib/xase/human-intervention.ts`

---

### Q7.2: Como vocês garantem que a intervenção humana não é fraudulenta?

**R**: Múltiplas validações:

1. **Autenticação forte**: 2FA/TOTP obrigatório para OVERRIDE
2. **Autorização**: Apenas OWNER/ADMIN podem intervir
3. **Justificativa obrigatória**: Campo `reason` não pode ser vazio
4. **Audit trail**: IP, User-Agent, timestamp
5. **Snapshot de decisão**: Preservamos decisão original da IA
6. **Alertas**: Override rate > 10% → alerta automático
7. **Review periódico**: Compliance officer revisa interventions mensalmente

**Código**: `src/app/api/xase/v1/records/[id]/intervene/route.ts`

---

### Q7.3: Vocês detectam padrões suspeitos de intervenção?

**R**: Sim, via métricas e alertas:

**Métricas monitoradas**:
- **Override rate**: % de decisões overridden
- **Approval rate**: % de decisões aprovadas
- **Rejection rate**: % de decisões rejeitadas
- **Escalation rate**: % de decisões escaladas
- **Por usuário**: quem mais intervém
- **Por horário**: intervenções fora do horário comercial
- **Por motivo**: top override reasons

**Alertas automáticos**:
- Override rate > 10% (threshold configurável)
- Usuário específico com override rate > 20%
- Intervenções fora do horário comercial (00h-06h)
- Spike súbito (>3x média)

**Código**: `src/lib/xase/metrics.ts`, `src/lib/xase/alerts.ts`

---

## 8. Drift Detection e Model Monitoring

### Q8.1: Como vocês detectam drift de modelo?

**R**: Três tipos de drift:

**1. Data Drift** (distribuição de features mudou):
- Método: Kolmogorov-Smirnov test, Chi-squared test
- Baseline: Período de referência (ex: últimos 30 dias)
- Detection: Comparação com período atual
- Threshold: p-value < 0.05 (configurável)

**2. Concept Drift** (relação input→output mudou):
- Método: Comparação de performance metrics (accuracy, F1)
- Baseline: Métricas do período de treinamento
- Detection: Degradação > 5% (configurável)
- Threshold: Accuracy drop > 5%

**3. Prediction Drift** (outputs mudaram):
- Método: Distribuição de predições
- Baseline: Distribuição esperada
- Detection: KL divergence, Jensen-Shannon divergence
- Threshold: Divergence > 0.1 (configurável)

**Código**: `src/lib/xase/drift-detection.ts` (planejado)

---

### Q8.2: O que acontece quando drift é detectado?

**R**: Workflow automático:

1. **Detecção**: Drift score > threshold
2. **Registro**: `DriftRecord` criado com severity (LOW, MEDIUM, HIGH, CRITICAL)
3. **Alerta**: Notificação via email/webhook/Slack
4. **Review**: Data scientist revisa drift
5. **Ação**:
   - **LOW/MEDIUM**: Monitorar
   - **HIGH**: Retreinar modelo
   - **CRITICAL**: Desativar modelo + fallback
6. **Resolução**: Marcar drift como `resolved` com notas

**Código**: `src/lib/xase/drift-detection.ts`, `src/lib/xase/alerts.ts`

---

## 9. Custos e Escalabilidade

### Q9.1: Quanto custa operar a plataforma?

**R**: Custos variáveis por volume:

**Startup** (< 10k decisões/mês):
- Database: $20/mês (RDS db.t3.micro)
- Storage: $0.23/mês (10GB S3)
- KMS: $1.15/mês (chave + 1k signs)
- **Total**: ~$25/mês

**Growth** (100k decisões/mês):
- Database: $100/mês (RDS db.t3.medium)
- Storage: $2.30/mês (100GB S3)
- KMS: $2.50/mês (chave + 10k signs)
- **Total**: ~$105/mês

**Enterprise** (1M decisões/mês):
- Database: $500/mês (RDS db.r5.large)
- Storage: $23/mês (1TB S3)
- KMS: $16/mês (chave + 100k signs)
- **Total**: ~$540/mês

**Observações**:
- Custos AWS (sa-east-1)
- Não inclui: compute (EC2/ECS), networking, support
- Inclui: database, storage, KMS apenas

---

### Q9.2: A plataforma escala horizontalmente?

**R**: Sim, com algumas considerações:

**Stateless**:
- ✅ API (Next.js): escala horizontalmente (load balancer)
- ✅ Worker: múltiplas instâncias (queue-based)

**Stateful**:
- ⚠️ Database: escala verticalmente (read replicas para leitura)
- ⚠️ Storage: escala horizontalmente (S3 auto-scale)

**Bottlenecks**:
- Database writes: ~10k writes/sec (RDS limit)
- KMS signs: ~1k signs/sec (soft limit, pode aumentar)

**Mitigações**:
- Database sharding (por tenant)
- Read replicas (para queries)
- Caching (Redis)
- Async processing (queue)

---

## 10. Roadmap e Melhorias Futuras

### Q10.1: Quais são os próximos passos?

**R**: Roadmap Q1-Q2 2026:

**Q1 2026**:
- [ ] TSA integration (RFC 3161 timestamp)
- [ ] Redis rate limiting (distribuído)
- [ ] Drift detection automático
- [ ] Model registry (versioning)
- [ ] Admin dashboard (métricas visuais)

**Q2 2026**:
- [ ] SOC 2 Type I (auditoria)
- [ ] Penetration testing (terceiro)
- [ ] Bug bounty program (HackerOne)
- [ ] Multi-region replication (HA)
- [ ] SSO enterprise (Azure AD, Okta, SAML)

**Q3 2026**:
- [ ] ISO 27001 (certificação)
- [ ] Blockchain anchoring (opcional)
- [ ] ICP-Brasil integration (Brasil)
- [ ] Advanced analytics (BI dashboard)

**Q4 2026**:
- [ ] SOC 2 Type II (auditoria)
- [ ] ISO 27701 (privacy)
- [ ] HIPAA BAA (healthcare)
- [ ] FedRAMP (US government, se aplicável)

---

## 📞 Contato para Auditores

**Security Team**: `security@xase.ai`  
**Compliance Team**: `compliance@xase.ai`  
**Legal Team**: `legal@xase.ai`  
**DPO** (Data Protection Officer): `dpo@xase.ai`

**Documentação adicional disponível**:
- Security Policy
- Data Processing Addendum (DPA)
- Incident Response Plan
- Disaster Recovery Plan
- Business Continuity Plan
- Compliance Matrix

---

**XASE** — Evidência forense para decisões de IA, pronta para auditoria.
