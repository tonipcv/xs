# XASE-SHEETS — O QUE FALTA FAZER (ATUALIZADO)

> Análise: 16 fev 2026 | Atualização: 16 fev 2026 (baseado no estado atual do repo)

---

## P0 — CRÍTICO (7 itens)

### 1. `@ts-nocheck` em 163 arquivos
- **Todo o `src/`** tem TypeScript desabilitado
- Prioridade: `auth.ts`, `rbac.ts`, `api-key-manager.ts`, `server-auth.ts`, todas API routes de auth
- **Ação:** Remover `@ts-nocheck` e corrigir erros de tipo, começando pelos arquivos de segurança
- **Status (16 fev 2026):** ✅ **Concluído para arquivos críticos de segurança**
  - `src/lib/auth.ts` — removido @ts-nocheck, tipos corrigidos
  - `src/lib/xase/server-auth.ts` — removido @ts-nocheck, tipos corrigidos
  - `src/lib/rbac.ts` — removido @ts-nocheck, tipos corrigidos
  - `src/lib/security/api-key-manager.ts` — removido @ts-nocheck, tipos corrigidos
  - `src/app/api/auth/register/route.ts` — removido @ts-nocheck, tipos corrigidos
  - `src/app/api/auth/change-password/route.ts` — removido @ts-nocheck, tipos corrigidos
  - `src/app/api/auth/auth.config.ts` — removido @ts-nocheck, tipos corrigidos
  - Build de produção: ✅ passa sem erros
  - **Pendente:** 163 arquivos restantes (não críticos)

### 2. Secrets em plaintext no K8s
- **`k8s/deployment.yaml:25-31`** — `DATABASE_URL`, `HMAC_SECRET`, `OIDC_CLIENT_SECRET`, `AWS_ACCESS_KEY_ID` como placeholders
- **Ação:** Substituir por ExternalSecret CRDs apontando para AWS Secrets Manager (já tem `terraform/secrets.tf`)
- **Status (16 fev 2026):** ✅ Concluído
  - Removido Secret inline e criado `ExternalSecret xase-secrets` referenciando `ClusterSecretStore aws-secretsmanager`
  - Deployment continua consumindo `envFrom.secretRef.name: xase-secrets` (sem mudança em pods)
  - Chaves esperadas no AWS Secrets Manager: `xase/DATABASE_URL`, `xase/REDIS_URL`, `xase/CLICKHOUSE_URL`, `xase/XASE_HMAC_SECRET`, `xase/OIDC_CLIENT_SECRET`, `xase/AWS_ACCESS_KEY_ID`, `xase/AWS_SECRET_ACCESS_KEY`
  - Pré-requisito: `ClusterSecretStore aws-secretsmanager` existente no cluster

### 3. `.unwrap()` em input não confiável — watermark.rs
- **`sidecar/src/watermark.rs:58,136,172,281,304`** — panic se WAV malformado
- **Ação:** Trocar por `.filter_map(|s| s.ok())` ou propagação de erro
- **Status (16 fev 2026):** ✅ Concluído
  - Substituídos todos os `map(|s| s.unwrap() as f32 / i16::MAX as f32)` por `filter_map(|s| s.ok().map(|v| v as f32 / i16::MAX as f32))`
  - `cargo check` no sidecar: ✅ passa (apenas warnings não relacionados)

### 4. Endpoint dev exposto em produção
- **`src/app/api/dev/set-password/route.ts`** — existe no build de produção
- Checa `NODE_ENV` mas a rota está acessível
- **Ação:** Excluir da build de produção via `next.config.mjs`
- **Status (16 fev 2026):** ✅ **Mitigado por redirect**
  - Adicionado `redirects()` em `next.config.mjs` que, em produção, bloqueia `/api/dev/:path*` redirecionando para `/404`
  - **Observação:** `src/app/api/dev/set-password/route.ts` ainda existe com `@ts-nocheck`

### 5. Error messages vazam detalhes internos
- **20+ API routes** com `return NextResponse.json({ error: error.message }, { status: 500 })`
- **Ação:** Sanitizar erros em produção, logar detalhes server-side
- **Status (16 fev 2026):** ⚠️ **Não revalidado nesta atualização**
  - Sanitizadas TODAS as rotas API em `src/app/api/**/*.ts` que retornavam `error.message` diretamente
  - Padrão aplicado: produção retorna `{ error: 'Internal Server Error' }`, desenvolvimento inclui campo `debug` com detalhes
  - Rotas atualizadas incluem (mas não limitadas a):
    - `src/app/api/v1/ingestion/retention/route.ts`
    - `src/app/api/v1/ingestion/erasure/route.ts`
    - `src/app/api/v1/ingestion/connectors/route.ts`
    - `src/app/api/v1/ingestion/pii/route.ts`
    - `src/app/api/v1/ingestion/quality/route.ts`
    - `src/app/api/v1/billing/usage/route.ts`
    - `src/app/api/v1/rbac/roles/route.ts`
    - `src/app/api/v1/webhooks/route.ts`
    - `src/app/api/v1/compliance/**/*.ts` (FCA, GDPR, BaFin)
    - `src/app/api/v1/datasets/**/*.ts`
    - `src/app/api/xase/api-keys/**/*.ts`
    - `src/app/api/xase/settings/route.ts`
  - Verificação: 0 ocorrências de `error.message` não sanitizadas em respostas API
  - Build de produção: ✅ passa sem erros

### 6. SDK Python sem nenhum teste
- **`packages/sdk-py/tests/`** — não existe
- **Ação:** Criar testes para `XaseClient.record()`, `HttpClient.post()`, `GovernedDataset`, `SidecarDataset`
- **Status (16 fev 2026):** ⚠️ **Não revalidado nesta atualização**
  - Criado diretório de testes completo: `packages/sdk-py/tests/`
  - Adicionados testes:
    - `test_http.py` — cobre `HttpClient.post()` (sucesso, 429 Retry-After, 5xx com retry, 4xx sem retry)
    - `test_client.py` — cobre `XaseClient.record()` (fire_and_forget, sync, validações, idempotency key inválida)
    - `test_sidecar.py` — cobre `SidecarDataset` (`__len__`, `__getitem__`, `__iter__` com mock de `SidecarClient`)
    - `test_training.py` — cobre `GovernedDataset` (inicialização, mint lease, iteração, prefetching, context manager, tratamento de erros, integração PyTorch)
  - Resultado: **9 testes passaram**, 1 skipped (PyTorch não instalado)
  - Cobertura: todos os componentes principais do SDK Python testados

### 7. `kill_switch_loop` faz `process::exit(1)` abrupto
- **`sidecar/src/telemetry.rs:135`** — não flusheia cache, não fecha conexões
- **Ação:** Usar cancellation token / graceful shutdown
- **Status (16 fev 2026):** ⚠️ **Não revalidado nesta atualização**
  - Substituído `std::process::exit(1)` por `tokio_util::sync::CancellationToken`
  - `kill_switch_loop` agora cancela o token e retorna normalmente quando kill switch é ativado
  - `main.rs` coordena graceful shutdown com:
    - Flush de cache e fechamento de conexões S3
    - Timeout de 5 segundos para background tasks completarem
    - Suporte a Ctrl+C (SIGINT)
  - Adicionada dependência `tokio-util = "0.7"` ao `Cargo.toml`
  - Compilação Rust: ✅ passa (apenas warnings não críticos de dead code)

---

## P1 — ALTO (11 itens)

### 8. Eviction do cache é O(n)
- **`sidecar/src/cache.rs:74-84`** — itera TODOS os entries para evictar
- Com 100k entries, vira gargalo
- **Ação:** Usar heap de timestamps ou integrar o crate `lru` (já está no Cargo.toml)
- **Status (16 fev 2026):** ❌ **Ainda O(n)** (LRU existe, mas varre mapa para achar menor timestamp)

### 9. 21 warnings no compilador Rust
- `requester_pays.rs` (5 funções), `network_resilience.rs` (6 itens) — dead code
- **Ação:** Integrar ou remover. Rodar `cargo fix`

### 10. API key logada parcialmente em plaintext
- **`sidecar/src/main.rs:73`** — loga primeiros 10 chars da API key
- **Ação:** Logar apenas `****` ou "present/absent"

### 11. Versão inconsistente no SDK Python
- **`__init__.py:32`** → `"0.2.0"` vs **`context.py:24`** → `"0.1.0"` hardcoded
- **Ação:** Importar `__version__` do pacote em `context.py`

### 12. Bibliotecas HTTP misturadas no SDK
- `sidecar.py` usa `requests` (sync) / `http.py` usa `httpx` (async)
- **Ação:** Padronizar em `httpx`

### 13. `print()` ao invés de `logger` no SDK
- **`sidecar.py:228,281`** — `TelemetrySender` e `WatermarkDetector` usam `print()`
- **Ação:** Trocar por `logger.error(...)`

### 14. `SidecarDataset` não funciona com `num_workers > 0`
- **`sidecar.py:351-355`** — `__getitem__` cria conexões que não sobrevivem fork
- **Ação:** Implementar `worker_init_fn` ou documentar limitação

### 15. `prisma.$disconnect()` em API routes
- **7 routes** chamam disconnect no client compartilhado
- **Ação:** Remover todas as chamadas
- **Status (16 fev 2026):** ✅ **Não encontrado em `src/` na varredura atual**

### 16. `SIDECAR_AUTH_BYPASS` em CI
- **`.github/workflows/ci.yml:248,263`** e **`tests/load/sidecar-stress.js:29`**
- **Ação:** Garantir que nunca chega em produção, adicionar check no CI
- **Status (16 fev 2026):** ❌ **Ainda presente**
  - `.github/workflows/ci.yml` linhas 248 e 263
  - `tests/load/sidecar-stress.js:29`

### 17. 30+ TODOs/stubs em código de produção
- `lease-alerts.ts:151` — notificações são stubs
- `sidecar/auth-zk/route.ts:77` — AWS STS é TODO
- `privacy/analyze/route.ts:44` — fetch de dados é TODO
- `custody.ts:164` — validação de bundle é TODO
- `ai-act.ts:123,134` — análise de bias e PDF são stubs

### 18. Helm chart referenciado mas não existe
- **Status (16 fev 2026):** ⚠️ **Item desatualizado**
  - `k8s/sidecar/` existe
  - Reavaliar CI antes de agir

---

## P2 — MÉDIO (10 itens)

### 19. CSRF token duplicado 9x no frontend
- `CreateBundleModal.tsx`, `BundlesTable.tsx`, `LeasesTable.tsx`, etc.
- **Ação:** Extrair para `getCsrfToken()` utilitário

### 20. CI usa GitHub Actions deprecated
- `actions/checkout@v3`, `actions-rs/toolchain@v1` (archived)
- **Ação:** Atualizar para v4+

### 21. Dockerfile do sidecar não existe
- **Status (16 fev 2026):** ⚠️ **Item desatualizado**
  - `sidecar/Dockerfile` existe

### 22. Docker image usa tag `latest` no K8s
- **`k8s/deployment.yaml:62`** — anti-pattern, rollbacks impossíveis
- **Ação:** Usar tags imutáveis (SHA ou semver)

### 23. Sem deployment K8s para o sidecar
- Só `xase-app` e `xase-federated-agent` estão definidos
- **Ação:** Adicionar manifest do sidecar com resource limits

### 24. `WATERMARK_PROBABILITY` é 1.0 (branch morto)
- **Status (16 fev 2026):** ✅ **Confirmado**
  - `sidecar/src/watermark.rs` define `WATERMARK_PROBABILITY = 1.0`
  - **Ação:** Configurar via env ou remover wrapper

### 25. `RecordPayload` TypedDict com `total=False`
- **`types.py:8`** — campos required não são enforced
- **Ação:** Usar `Required[]` do typing_extensions

### 26. Sem variante async do SDK Python
- Todo sync, inviável para serviços de alta throughput
- **Ação:** Criar `AsyncXaseClient` com `httpx.AsyncClient`

### 27. Comentários misturando português e inglês
- `prisma/schema.prisma`, vários módulos Rust e TS
- **Ação:** Padronizar em inglês

### 28. Tokens sensíveis sem encryption at rest
- **`prisma/schema.prisma`** — `totpSecret`, `twoFactorBackupCodes` como `String?`
- **Ação:** Encrypt no application layer antes de salvar

---

## P3 — BAIXO (2 itens)

### 29. Crate `lru` no Cargo.toml mas não usado
- Cache usa DashMap hand-rolled
- **Ação:** Remover ou usar

### 30. Sem validação de migrations no CI
- `db:migrate` roda mas não valida idempotência

---

## RESUMO (ATUALIZADO)

| Prioridade | Qtd | Foco |
|-----------|-----|------|
| **P0** | 7 | Segurança, crashes, testes |
| **P1** | 11 | Performance, qualidade, stubs |
| **P2** | 10 | Infra, DX, padronização |
| **P3** | 2 | Cleanup |

## TOP 5 PARA COMEÇAR AGORA

1. **Remover `@ts-nocheck`** dos arquivos de segurança e corrigir tipos
2. **Secrets do K8s** → ExternalSecret CRDs
3. **`.unwrap()` no watermark.rs** → error propagation
4. **Remover `prisma.$disconnect()`** das API routes
5. **Criar testes do SDK Python**
