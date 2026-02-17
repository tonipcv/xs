# XASE-SHEETS — Testes, Páginas e Fluxos para Validar 100%

> 16 fev 2026 | Cobertura atual: ~5-8% | 15 arquivos de teste existentes

---

## COBERTURA ATUAL

| Área | Total | Com Testes | Cobertura |
|------|-------|-----------|-----------|
| Páginas Next.js | 87 | 0 | **0%** |
| API Routes | ~150 | ~6 | **~4%** |
| Core Lib (lib/xase/) | 47 | 6 | **~13%** |
| Compliance Engines | 4 | 0 | **0%** |
| Integrações (Stripe, Email, OIDC, S3) | 8 | 0 | **0%** |
| Rust Sidecar | 12 | 4 | **~33%** |
| Python SDK | 9 | 0 | **0%** |
| Python CLI | 10 | 0 | **0%** |
| Middleware | 2 | 0 | **0%** |

---

## TESTES EXISTENTES (15 arquivos)

| Arquivo | Tipo | O que testa |
|---------|------|-------------|
| `src/__tests__/api/datasets.integration.test.ts` | Integration | Dataset CRUD + S3 |
| `src/__tests__/api/sidecar-auth.test.ts` | Unit | Sidecar STS tokens |
| `src/__tests__/lib/merkle-tree.test.ts` | Unit | Merkle tree hash |
| `src/__tests__/lib/security-fixes.test.ts` | Unit | Security validation |
| `src/__tests__/lib/services/encryption.test.ts` | Unit | AES encrypt/decrypt |
| `src/__tests__/lib/validation/schemas.test.ts` | Unit | Zod schemas |
| `src/__tests__/lib/watermark-detection.test.ts` | Unit | Watermark detect |
| `src/__tests__/lib/xase/auth.test.ts` | Unit | Auth/bearer token |
| `src/__tests__/security/cross-tenant-isolation.test.ts` | Security | Tenant isolation |
| `src/__tests__/e2e/auth-flow.spec.ts` | E2E | Login/register/reset |
| `src/lib/xase/__tests__/policy-enforcement-point.test.ts` | Unit | PEP |
| `src/lib/xase/__tests__/policy-validator.test.ts` | Unit | Policy validation |
| `src/lib/xase/__tests__/privacy-toolkit.test.ts` | Unit | Differential privacy |
| `tests/integration/consent-propagation.test.ts` | Integration | Consent grant/revoke |
| `tests/e2e/sidecar-flow.test.ts` | E2E | Sidecar auth→stream |

---

## FLUXOS CRÍTICOS PARA TESTAR MANUALMENTE

### Fluxo 1: Registro e Login
```
1. GET /register → formulário de registro
2. POST /api/auth/register → cria user + tenant
3. GET /login → formulário de login
4. POST /api/auth/[...nextauth] → credentials login
5. Verificar redirect → /xase/ai-holder
6. GET /profile → dados do user
7. POST /api/auth/2fa/setup → setup TOTP
8. POST /api/auth/2fa/verify → verificar código
9. POST /api/auth/forgot-password → envio de email
10. POST /api/auth/reset-password → reset com token
```

### Fluxo 2: AI Holder — Dataset Completo
```
1. GET /xase/ai-holder/datasets → lista vazia
2. GET /xase/ai-holder/datasets/new → formulário
3. POST /api/v1/datasets → criar dataset
4. GET /xase/ai-holder/datasets/[id] → detalhe
5. GET /xase/ai-holder/datasets/[id]/upload → upload page
6. POST /api/v1/datasets/[id]/upload → upload WAV para S3/MinIO
7. POST /api/v1/datasets/[id]/process → processar segmentos
8. POST /api/v1/datasets/[id]/publish → publicar no marketplace
9. GET /xase/ai-holder/datasets/[id]/stream → testar streaming
10. GET /xase/ai-holder/datasets/[id]/lab → lab view
```

### Fluxo 3: AI Holder — Policy + Offer
```
1. GET /xase/ai-holder/policies → lista
2. GET /xase/ai-holder/policies/new → criar policy
3. POST /api/v1/policies → salvar policy
4. POST /api/v1/policies/validate → validar regras
5. GET /xase/ai-holder/policies/[id]/rewrite-rules → rewrite rules
6. PUT /api/v1/policies/[id]/rewrite-rules → salvar regras
7. GET /xase/ai-holder/offers/new → criar offer
8. POST /api/v1/datasets/[id]/access-offers → publicar offer
9. GET /api/v1/access-offers → verificar no marketplace
```

### Fluxo 4: AI Lab — Lease + Training
```
1. GET /xase/ai-lab → dashboard
2. GET /xase/ai-lab/marketplace → ver offers disponíveis
3. GET /xase/governed-access → marketplace público
4. GET /xase/governed-access/[offerId] → detalhe da offer
5. POST /api/v1/access-offers/[offerId]/execute → aceitar offer → cria lease
6. GET /xase/training/leases/[leaseId] → detalhe do lease
7. POST /api/v1/leases/[leaseId]/extend → estender lease
8. POST /api/v1/sidecar/auth → autenticar sidecar
9. Conectar via Unix socket → receber segmentos watermarked
10. GET /xase/ai-lab/usage → verificar consumo
11. GET /xase/ai-lab/billing → verificar billing
```

### Fluxo 5: Sidecar Completo (Rust)
```
1. POST /api/v1/sidecar/auth → obter session_id + STS credentials
2. Sidecar inicia → conecta S3 com STS
3. Prefetch loop → download + pre-watermark
4. GPU conecta via Unix socket → recebe segmentos
5. POST /api/v1/sidecar/telemetry → envia métricas
6. GET /api/v1/sidecar/kill-switch → verifica se deve parar
7. POST /api/v1/sidecar/kill-switch → ativar kill switch
8. Verificar: sidecar para de servir dados
```

### Fluxo 6: Evidence + Compliance
```
1. POST /api/v1/executions/[id]/evidence → gerar evidence bundle
2. GET /xase/bundles → listar bundles
3. GET /xase/bundles/[id] → detalhe com Merkle tree
4. GET /api/xase/bundles/[id]/pdf → baixar PDF
5. GET /xase/bundles/[id]/pdf/preview → preview
6. POST /api/v1/watermark/detect → detectar watermark em áudio
7. POST /api/v1/watermark/forensics → análise forense
8. GET /api/v1/audit/query → consultar audit trail
```

### Fluxo 7: Consent Management
```
1. GET /xase/consent → dashboard de consentimento
2. POST /api/v1/consent/grant → dar consentimento
3. GET /api/v1/consent/status → verificar status
4. GET /api/v1/consent/preferences → preferências
5. POST /api/v1/consent/revoke → revogar consentimento
6. Verificar: lease associado é revogado automaticamente
```

### Fluxo 8: GDPR/Compliance
```
1. POST /api/v1/compliance/gdpr/dsar → solicitação de dados
2. POST /api/v1/compliance/gdpr/erasure → erasure request
3. POST /api/v1/compliance/gdpr/portability → exportar dados
4. POST /api/v1/compliance/bafin/ai-risk → análise de risco
5. POST /api/v1/compliance/fca/consumer-duty → consumer duty check
6. GET /xase/compliance → dashboard de compliance
```

### Fluxo 9: Security/Access Control
```
1. GET /xase/security/rbac → RBAC management
2. POST /api/v1/rbac/roles → criar role
3. POST /api/v1/break-glass/activate → emergency access
4. POST /api/v1/jit-access/request → JIT access
5. GET /xase/api-keys → gerenciar API keys
6. POST /api/xase/api-keys → criar API key
7. DELETE /api/xase/api-keys/[id] → revogar API key
8. Testar: cross-tenant isolation (user A não vê dados de user B)
```

### Fluxo 10: Billing + Ledger
```
1. GET /xase/usage-billing → página de billing
2. GET /api/v1/billing/usage → dados de uso
3. GET /api/v1/ledger → credit ledger
4. POST /api/webhook → Stripe webhook (checkout.session.completed)
5. GET /api/user/premium-status → verificar premium
6. GET /xase/ai-holder/ledger → ledger do holder
```

### Fluxo 11: Python SDK
```
1. pip install xase → instalar SDK
2. XaseClient(api_key="...") → inicializar
3. client.record(policy="...", input="...", output="...") → enviar record
4. GovernedDataset(lease_id="...") → dataset HTTP
5. SidecarDataset(socket_path="/tmp/xase.sock") → dataset Unix socket
6. DataLoader(dataset, num_workers=0) → treinar com PyTorch
7. Verificar: telemetria é enviada
8. Verificar: watermark detection funciona
```

### Fluxo 12: Voice Module
```
1. GET /xase/voice → dashboard voice
2. GET /xase/voice/datasets/new → criar dataset voice
3. POST upload de áudio WAV
4. GET /xase/voice/policies → policies
5. POST /xase/voice/offers/new → publicar offer
6. GET /xase/voice/leases → gerenciar leases
7. GET /xase/voice/access-logs → logs de acesso
8. GET /xase/voice/evidence/print → imprimir evidence
```

---

## TESTES AUTOMATIZADOS QUE FALTAM CRIAR

### Prioridade 1 — Bloqueia produção

| Teste | Tipo | Cobre |
|-------|------|-------|
| `auth-register.test.ts` | Integration | POST /api/auth/register — validação, duplicata, tenant creation |
| `auth-login.test.ts` | Integration | Login credentials + Google OAuth mock |
| `auth-2fa.test.ts` | Integration | Setup + verify TOTP, backup codes |
| `lease-lifecycle.test.ts` | Integration | Create → extend → expire → revoke lease |
| `dataset-upload.test.ts` | Integration | Upload WAV → S3 → process → publish |
| `offer-execute.test.ts` | Integration | Marketplace offer → lease creation |
| `sidecar-socket.test.ts` | Integration | Unix socket protocol (length-prefix) |
| `stripe-webhook.test.ts` | Integration | Stripe checkout.session.completed |
| `rbac-enforcement.test.ts` | Unit | Role checks em API routes |
| `middleware.test.ts` | Unit | Auth redirect, CSRF, security headers |

### Prioridade 2 — Qualidade

| Teste | Tipo | Cobre |
|-------|------|-------|
| `cache.rs` tests | Unit | Insert, evict, hit_rate, concurrent access |
| `config.rs` tests | Unit | Env parsing, defaults, validation |
| `socket_server.rs` tests | Integration | Protocol handshake, error handling |
| `python-sdk/test_client.py` | Unit | XaseClient.record(), error handling |
| `python-sdk/test_sidecar.py` | Unit | SidecarDataset connect/read |
| `python-sdk/test_training.py` | Unit | GovernedDataset prefetch |
| `gdpr.test.ts` | Unit | DSAR, erasure, portability logic |
| `consent-cascade.test.ts` | Integration | Revoke consent → cascade to leases |
| `cross-tenant.test.ts` | Security | API route isolation |
| `kill-switch.test.ts` | Integration | Kill switch → sidecar stops serving |

### Prioridade 3 — Completude

| Teste | Tipo | Cobre |
|-------|------|-------|
| `email.test.ts` | Unit | Email template rendering (mock SMTP) |
| `pdf-report.test.ts` | Unit | PDF generation |
| `oidc-flow.test.ts` | Integration | OIDC auth flow completo |
| `cli/test_auth.py` | Unit | CLI token management |
| `cli/test_onboarding.py` | Unit | CLI onboarding flow |
| `watermark-roundtrip.test.ts` | Integration | Embed → detect → match contract |
| `break-glass.test.ts` | Unit | Emergency access activation/audit |
| E2E Cypress/Playwright | E2E | Fluxos 1-12 acima automatizados |

---

## CHECKLIST RÁPIDO — "Está Funcionando?"

### Infraestrutura
- [ ] `npm run build` passa sem erros
- [ ] `npm run dev` inicia sem crash
- [ ] `cargo build` no sidecar compila (21 warnings ok)
- [ ] `cargo test` no sidecar → 14 tests pass
- [ ] Database: `npx prisma migrate deploy` funciona
- [ ] MinIO/S3: upload + download funciona
- [ ] Redis (se usado): conexão OK

### Auth
- [ ] Register novo user funciona
- [ ] Login com email/senha funciona
- [ ] Login com Google OAuth funciona
- [ ] 2FA setup + verify funciona
- [ ] Forgot/reset password funciona
- [ ] Session persiste entre reloads
- [ ] Logout limpa session

### Core Business
- [ ] Criar dataset funciona
- [ ] Upload de arquivo WAV para dataset funciona
- [ ] Criar policy funciona
- [ ] Publicar offer no marketplace funciona
- [ ] AI Lab vê offer no marketplace
- [ ] Executar offer cria lease
- [ ] Lease tem data de expiração correta
- [ ] Sidecar autentica com STS
- [ ] Sidecar serve dados via Unix socket
- [ ] Watermark é aplicado nos segmentos
- [ ] Evidence bundle é gerado com Merkle tree
- [ ] PDF de evidence é baixável
- [ ] Consent grant/revoke funciona
- [ ] Revogar consent revoga lease associado
- [ ] Kill switch para o sidecar
- [ ] Credit ledger registra transações
- [ ] Billing/usage mostra dados corretos

### Segurança
- [ ] User A não vê dados de User B (tenant isolation)
- [ ] API routes sem auth retornam 401
- [ ] Admin routes sem role admin retornam 403
- [ ] CSRF token é validado em POST /api/xase/bundles
- [ ] Rate limiting funciona
- [ ] API key auth funciona
- [ ] Security headers presentes (CSP, HSTS, etc)

### Páginas Carregam (smoke test)
- [ ] `/login`
- [ ] `/register`
- [ ] `/xase/ai-holder`
- [ ] `/xase/ai-holder/datasets`
- [ ] `/xase/ai-holder/policies`
- [ ] `/xase/ai-holder/leases`
- [ ] `/xase/ai-lab`
- [ ] `/xase/ai-lab/marketplace`
- [ ] `/xase/governed-access`
- [ ] `/xase/training`
- [ ] `/xase/bundles`
- [ ] `/xase/compliance`
- [ ] `/xase/voice`
- [ ] `/xase/settings`
- [ ] `/xase/api-keys`
- [ ] `/xase/audit`
- [ ] `/xase/health`
- [ ] `/xase/docs`

---

## RESUMO

- **87 páginas**, nenhuma com teste de renderização
- **~150 API routes**, ~6 com teste
- **12 fluxos críticos** para testar manualmente
- **~30 testes automatizados** faltam criar (3 prioridades)
- **Checklist de 40+ itens** para validar que está funcional
