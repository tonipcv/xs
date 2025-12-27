# Evidence Bundles - Guia de Testes Completo

## ✅ Checklist Pré-Demo (Empresa)

### 1. Infraestrutura

- [ ] Postgres rodando e acessível
- [ ] Worker Prisma rodando: `node scripts/worker-bundles-prisma.mjs --poll-ms 2000`
- [ ] Next.js dev server rodando: `npm run dev`
- [ ] Verificar fila limpa: `node scripts/check-queue-status.mjs`

### 2. Dados de Teste

- [ ] Tenant configurado com usuário OWNER/ADMIN
- [ ] Pelo menos 10-20 `DecisionRecord` no banco para gerar bundles significativos
- [ ] Verificar registros: `SELECT COUNT(*) FROM decision_records WHERE tenant_id = '<tenant_id>';`

### 3. Funcionalidades Core

#### 3.1 Criar Bundle

- [ ] Acessar `/xase/bundles`
- [ ] Clicar "Create Bundle"
- [ ] Preencher:
  - Purpose: AUDIT
  - Description: "Teste para demo"
  - Date range: últimos 30 dias (ou deixar vazio)
- [ ] Submeter
- [ ] Verificar:
  - [ ] Bundle aparece na lista com status PENDING
  - [ ] Worker loga `worker.job:claimed`
  - [ ] Worker loga `worker.job:success`
  - [ ] Status muda para READY (refresh automático)
  - [ ] Botão Download aparece

#### 3.2 Download Bundle

- [ ] Clicar "Download" no bundle READY
- [ ] Verificar:
  - [ ] ZIP baixa corretamente
  - [ ] Extrair e verificar arquivos:
    - [ ] `records.json` (com dados)
    - [ ] `metadata.json`
    - [ ] `signature.json`
    - [ ] `verify.js`
    - [ ] `README.md`
  - [ ] Rodar verificação: `node verify.js` → ✅ VERIFICATION PASSED

#### 3.3 Reprocess Bundle

- [ ] Criar bundle que falhe (ex.: sem registros no período)
- [ ] Verificar status FAILED ou PROCESSING stuck
- [ ] Clicar "Reprocess"
- [ ] Verificar:
  - [ ] API retorna 200
  - [ ] Worker processa novamente
  - [ ] Status atualiza

#### 3.4 RBAC

- [ ] Login como usuário VIEWER
- [ ] Tentar acessar `/xase/bundles` → 403 Forbidden
- [ ] Tentar `POST /api/xase/bundles/create` → 403
- [ ] Login como ADMIN
- [ ] Criar bundle → sucesso
- [ ] Download bundle → sucesso

#### 3.5 Rate Limiting

- [ ] Criar 10 bundles rapidamente (script ou UI)
- [ ] Verificar:
  - [ ] 11º request retorna 429 Too Many Requests
  - [ ] `AuditLog` registra tentativa negada

#### 3.6 CSRF Protection

- [ ] Abrir DevTools → Application → Cookies
- [ ] Deletar cookie `x-csrf-token`
- [ ] Tentar criar bundle → 403 CSRF validation failed
- [ ] Refresh página (cookie restaurado)
- [ ] Criar bundle → sucesso

#### 3.7 Tenant Isolation

- [ ] Login como tenant A
- [ ] Criar bundle
- [ ] Copiar `bundleId`
- [ ] Login como tenant B
- [ ] Tentar download: `GET /api/xase/bundles/<bundleId>/download` → 404
- [ ] Verificar `AuditLog` registra tentativa negada

#### 3.8 Retention & Legal Hold

- [ ] Criar bundle
- [ ] Aguardar ficar READY
- [ ] Simular expiração (SQL): `UPDATE xase_evidence_bundles SET expires_at = NOW() - INTERVAL '1 day' WHERE bundle_id = '<id>';`
- [ ] Tentar download → 410 Gone
- [ ] Ativar legal hold (SQL): `UPDATE xase_evidence_bundles SET legal_hold = true WHERE bundle_id = '<id>';`
- [ ] Tentar download → 200 OK (permitido por legal hold)

### 4. Observabilidade

#### 4.1 Logs Estruturados

- [ ] Verificar logs do worker em JSON
- [ ] Verificar logs da API em JSON
- [ ] Buscar por `requestId` específico nos logs

#### 4.2 Audit Trail

```sql
-- Ver últimas ações
SELECT timestamp, action, status, userid, resourceid, metadata
FROM xase_audit_logs
ORDER BY timestamp DESC
LIMIT 50;

-- Ver tentativas negadas
SELECT timestamp, action, userid, resourceid, errormessage
FROM xase_audit_logs
WHERE status = 'DENIED'
ORDER BY timestamp DESC
LIMIT 20;
```

#### 4.3 Queue Health

```bash
# Status da fila
node scripts/check-queue-status.mjs

# Deve mostrar:
# - pending: 0
# - running: 0
# - done: X (jobs completados)
# - dlq: 0 (idealmente)
```

### 5. Performance

- [ ] Criar 5 bundles simultaneamente
- [ ] Verificar:
  - [ ] Worker processa sequencialmente (SKIP LOCKED)
  - [ ] Todos completam em <30s cada
  - [ ] Nenhum vai para DLQ

### 6. Failure Recovery

#### 6.1 Worker Crash

- [ ] Criar bundle
- [ ] Matar worker: `pkill -f worker-bundles-prisma`
- [ ] Verificar bundle fica em PROCESSING
- [ ] Reiniciar worker
- [ ] Aguardar 15 min (STUCK_MINUTES)
- [ ] Reprocessar via UI
- [ ] Verificar completa

#### 6.2 Database Timeout

- [ ] Simular query lenta (opcional)
- [ ] Verificar retry com backoff
- [ ] Verificar DLQ após max_attempts

## 🚀 Comandos Úteis para Demo

```bash
# Limpar fila (dev)
psql "$DATABASE_URL" -c "DELETE FROM xase_jobs; DELETE FROM xase_jobs_dlq;"

# Ver bundles
psql "$DATABASE_URL" -c "SELECT bundle_id, status, record_count, created_at FROM xase_evidence_bundles ORDER BY created_at DESC LIMIT 10;"

# Ver últimos audit logs
psql "$DATABASE_URL" -c "SELECT timestamp, action, status, userid FROM xase_audit_logs ORDER BY timestamp DESC LIMIT 20;"

# Forçar job rodar agora (dev)
node scripts/force-job-now.mjs

# Ver status completo
node scripts/check-queue-status.mjs
```

## 📊 Métricas para Mostrar

1. **Throughput**: X bundles/min
2. **Latência**: tempo médio de geração
3. **Taxa de sucesso**: (DONE / (DONE + DLQ)) * 100%
4. **Audit coverage**: 100% das ações registradas
5. **RBAC enforcement**: 0 acessos cross-tenant

## ⚠️ Troubleshooting

### Bundle fica em PROCESSING

```bash
# Ver job
node scripts/debug-worker.mjs --bundle <bundleId>

# Forçar reprocessar
node scripts/jobs-reset.mjs --bundle <bundleId>
```

### Worker não processa

```bash
# Ver se worker está rodando
ps aux | grep worker-bundles-prisma

# Ver logs do worker
# (output do terminal onde rodou)

# Verificar fila
node scripts/check-queue-status.mjs
```

### Download falha

```bash
# Ver bundle
node scripts/verify-bundle.mjs

# Verificar storage_key não é null
# Se null: storage não configurado (esperado em dev)
```

## ✅ Critérios de Sucesso

- [ ] Criar bundle: <2s (API response)
- [ ] Gerar bundle: <30s (worker)
- [ ] Download: <5s
- [ ] RBAC: 100% enforcement
- [ ] CSRF: 100% proteção
- [ ] Audit: 100% cobertura
- [ ] Tenant isolation: 100%
- [ ] Retry: funciona após falha
- [ ] DLQ: captura falhas definitivas
- [ ] Reprocess: recupera bundles stuck/failed
