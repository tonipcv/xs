# Guia Completo: Deploy e Operação do Xase Sidecar

**Versão:** 1.0  
**Data:** 23 de fevereiro de 2026  
**Autor:** Xase Engineering  
**Público:** Solo founder / Operador técnico

---

## Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Cenários de Dados do Hospital](#2-cenários-de-dados-do-hospital)
3. [Preparação Pré-Deploy](#3-preparação-pré-deploy)
4. [Deploy do Sidecar no Easypanel](#4-deploy-do-sidecar-no-easypanel)
5. [Configuração por Fonte de Dados](#5-configuração-por-fonte-de-dados)
6. [Validação e Testes](#6-validação-e-testes)
7. [Operação Diária](#7-operação-diária)
8. [Troubleshooting](#8-troubleshooting)
9. [Roadmap de Segurança (JWT/AuthZ)](#9-roadmap-de-segurança-jwtauthz)

---

## 1. Visão Geral do Sistema

### Arquitetura em 2 camadas

```
┌─────────────────────────────────────────────────────────────┐
│                    XASE BRAIN (Vercel)                      │
│  - Next.js (frontend + API routes)                          │
│  - Multi-tenant                                              │
│  - Autenticação de usuários                                 │
│  - Dashboard, relatórios, configuração                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (JWT futuro)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              XASE SIDECAR (Easypanel/Hospital)              │
│  - Rust (performance + segurança)                           │
│  - Roda ON-PREMISE (dentro da rede do hospital)             │
│  - Ingestão de dados (S3/DICOMweb/FHIR)                     │
│  - Cache local (100GB default)                              │
│  - Desidentificação (OCR, NLP, áudio)                       │
│  - Métricas Prometheus (/metrics)                           │
└─────────────────────────────────────────────────────────────┘
```

### O que cada componente faz

- **Brain (Vercel):**
  - Interface do usuário (médicos, admins).
  - Orquestra múltiplos Sidecars (multi-hospital).
  - Armazena metadados não sensíveis (índices, relatórios agregados).
  - Emite credenciais e tokens para os Sidecars.

- **Sidecar (Hospital):**
  - Fica próximo aos dados (S3, PACS, FHIR).
  - Processa e desidentifica PHI localmente.
  - Mantém cache para performance.
  - Reporta métricas e status ao Brain.
  - **Dados sensíveis nunca saem do perímetro do hospital.**

---

## 2. Cenários de Dados do Hospital

Quando você fecha com um hospital, eles podem ter dados em uma ou mais dessas formas:

### Cenário A: Bucket S3 (AWS/MinIO/DigitalOcean Spaces)
- **Formato:** Arquivos DICOM, áudio WAV/MP3, JSON (FHIR), texto.
- **Acesso:** Credenciais S3 (access key + secret key).
- **Configuração:** `INGESTION_MODE=s3`

### Cenário B: PACS via DICOMweb
- **Formato:** DICOM (imagens médicas).
- **Acesso:** URL do servidor DICOMweb (ex.: `http://pacs.hospital.local:8080/dcm4chee-arc`).
- **Autenticação:** Token ou Basic Auth.
- **Configuração:** `INGESTION_MODE=dicomweb`

### Cenário C: Servidor FHIR (HL7 FHIR R4/R5)
- **Formato:** JSON (recursos FHIR: Patient, Observation, DiagnosticReport).
- **Acesso:** URL do servidor FHIR (ex.: `http://fhir.hospital.local:8080/fhir`).
- **Autenticação:** Token OAuth2 ou Basic Auth.
- **Configuração:** `INGESTION_MODE=fhir`

### Cenário D: Híbrido (PACS/FHIR + S3 fallback)
- **Uso:** Hospital tem PACS principal, mas alguns dados antigos em S3.
- **Configuração:** `INGESTION_MODE=hybrid` + `HYBRID_FALLBACK_TO_S3=true`

### Cenário E: Arquivos locais (filesystem)
- **Formato:** Diretório montado com DICOM/áudio/texto.
- **Acesso:** Volume Docker mapeado.
- **Configuração:** `INGESTION_MODE=s3` com MinIO local ou `fs` (futuro).

---

## 3. Preparação Pré-Deploy

### 3.1. Informações a coletar do hospital

Antes de subir o Sidecar, você precisa:

- [ ] **Identificação:**
  - Nome do hospital (ex.: "Hospital São Lucas").
  - ID único (ex.: `tenant_hospital_sao_lucas`).
  - Contrato/ID no Brain (ex.: `contract_abc123`).

- [ ] **Fonte de dados (escolha um cenário):**
  - **S3:** bucket name, região, access key, secret key, prefixo (opcional).
  - **DICOMweb:** URL, token/credenciais.
  - **FHIR:** URL, token/credenciais.
  - **Híbrido:** combinação acima.

- [ ] **Infraestrutura:**
  - Servidor/VM onde o Sidecar vai rodar (IP, acesso SSH).
  - Espaço em disco para cache (mínimo 100GB, recomendado 500GB+).
  - Porta aberta para métricas (9090) ou túnel/VPN.

- [ ] **Credenciais do Brain:**
  - `XASE_API_KEY` (gerado no Brain para esse hospital).
  - `LEASE_ID` (gerado no Brain para esse Sidecar).
  - `CONTRACT_ID` (ID do contrato no Brain).

### 3.2. Decisões técnicas

- **Modo de boot inicial:**
  - Use `XASE_SKIP_AUTH=1` para validar que o serviço sobe antes de plugar credenciais reais.
  - Depois remova essa flag e configure as credenciais reais.

- **Features a ativar:**
  - OCR (scrubbing de texto em imagens DICOM): `DICOM_ENABLE_OCR=true`
  - NLP (redação de PHI em relatórios): `FHIR_ENABLE_NLP=true`
  - Áudio (redação de voz): `AUDIO_ENABLE_REDACTION=true`
  - Prefetch (pré-processamento em background): `DISABLE_PREFETCH=false` (padrão é true no boot).

- **Rede:**
  - Expor porta 9090 publicamente (HTTPS via proxy) ou via túnel (Cloudflare/Tailscale).
  - Se server-to-server, pode ser privado (VPN/tunnel).

---

## 4. Deploy do Sidecar no Easypanel

### 4.1. Criar o serviço no Easypanel

1. **Login no Easypanel** (ex.: http://159.89.225.143).
2. **Dashboard → Services → Create Service**.
3. **Escolher tipo:**
   - Nome: `xase-sidecar`
   - Tipo: **App** (Docker/Nixpacks).
4. **Source:**
   - Git Repository: `https://github.com/seu-usuario/xase-sheets` (ou seu fork).
   - Branch: `main` (ou a branch do Sidecar).
   - Build Context: `/sidecar` (se o Dockerfile está em `sidecar/Dockerfile`).
   - Dockerfile Path: `Dockerfile` (relativo ao context).
5. **Build Method:** Docker (usar o Dockerfile existente).

### 4.2. Configurar variáveis de ambiente

No Easypanel, vá em **Environment Variables** e adicione:

#### Modo Boot (validação inicial)
```bash
XASE_SKIP_AUTH=1
DISABLE_PREFETCH=1
DISABLE_KILL_SWITCH=1
AWS_EC2_METADATA_DISABLED=true
AWS_REGION=us-east-1
INGESTION_MODE=s3
DATA_PIPELINE=text
SESSION_ID=session_boot_1
METRICS_BIND_ADDR=0.0.0.0:9090
SOCKET_PATH=/tmp/xase.sock
RESILIENCE_GRACE_PERIOD_SECONDS=300
METADATA_BACKEND=fs
METADATA_STORE_PATH=/var/lib/xase/metadata
TENANT_ID=hospital_boot
DATASET_ID=ds_boot
BUCKET_NAME=boot_bucket
RUST_LOG=info
```

#### Modo Produção (após validar boot)
Remova `XASE_SKIP_AUTH`, `DISABLE_PREFETCH`, `DISABLE_KILL_SWITCH` e adicione:

```bash
CONTRACT_ID=contract_abc123
XASE_API_KEY=sk_live_xxxxxxxxxxxxxxxx
LEASE_ID=lease_xyz789
XASE_BASE_URL=https://xase.ai
BUCKET_NAME=hospital-data-prod
BUCKET_PREFIX=dicom/
AWS_ACCESS_KEY_ID=AKIAXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
INGESTION_MODE=s3
DATA_PIPELINE=dicom
TENANT_ID=tenant_hospital_sao_lucas
DATASET_ID=ds_main
DICOM_ENABLE_OCR=true
FHIR_ENABLE_NLP=false
AUDIO_ENABLE_REDACTION=false
CACHE_SIZE_GB=500
METRICS_BIND_ADDR=0.0.0.0:9090
SOCKET_PATH=/tmp/xase.sock
METADATA_BACKEND=fs
METADATA_STORE_PATH=/var/lib/xase/metadata
RUST_LOG=info
```

### 4.3. Configurar storage (volume)

1. **Volumes → Add Volume:**
   - Name: `xase-data`
   - Mount Path: `/var/lib/xase`
   - Size: 100GB (ou mais, conforme cache).
2. Salvar.

### 4.4. Configurar rede (expor porta 9090)

#### Opção 1: Porta TCP pública
1. **Networking → Ports → Add Port:**
   - Protocol: TCP
   - Container Port: 9090
   - Host Port: 9090
   - Public: Enabled
2. Salvar.
3. Testar: `http://<IP-DO-SERVIDOR>:9090/metrics`

#### Opção 2: Proxy HTTPS (recomendado)
1. **Domains → Add Domain:**
   - Domain: `sidecar.hospital.com` (configure DNS apontando para o IP).
   - Target Port: 9090
   - HTTPS: Enabled (Let's Encrypt).
2. Salvar.
3. Testar: `https://sidecar.hospital.com/metrics`

### 4.5. Deploy

1. **Deploy Service** (botão no topo).
2. Aguarde o build (10–15 min na primeira vez).
3. Verifique logs em **Logs → Runtime Logs**.

#### Logs esperados (boot mode):
```
INFO xase_sidecar: Xase Sidecar starting...
INFO xase_sidecar: Configuration loaded
INFO xase_sidecar:   Contract ID: boot_contract
INFO xase_sidecar: Data provider initialized: S3 (mode: s3)
INFO xase_sidecar: Cache initialized (100 GB, lock-free DashMap)
INFO xase_sidecar: Prefetch disabled by configuration
INFO xase_sidecar: Kill switch disabled by configuration
INFO xase_sidecar: ✓ Prometheus metrics server listening on 0.0.0.0:9090
INFO xase_sidecar:   - Metrics: http://0.0.0.0:9090/metrics
INFO xase_sidecar:   - Health:  http://0.0.0.0:9090/health
INFO xase_sidecar:   - Ready:   http://0.0.0.0:9090/ready
```

Se aparecer isso, o Sidecar está **saudável** e pronto para configuração real.

---

## 5. Configuração por Fonte de Dados

### 5.1. S3 (AWS/MinIO/Spaces)

**Variáveis necessárias:**
```bash
INGESTION_MODE=s3
BUCKET_NAME=hospital-dicom-prod
BUCKET_PREFIX=studies/
AWS_ACCESS_KEY_ID=AKIAXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
DATA_PIPELINE=dicom  # ou audio, fhir, text
```

**Estrutura esperada no bucket:**
```
s3://hospital-dicom-prod/studies/
  ├── patient_001/
  │   ├── study_001/
  │   │   ├── series_001/
  │   │   │   ├── image_001.dcm
  │   │   │   └── image_002.dcm
  │   └── study_002/...
  └── patient_002/...
```

**Validação:**
- Rode `aws s3 ls s3://hospital-dicom-prod/studies/` com as credenciais para confirmar acesso.
- No Sidecar, verifique logs: `INFO xase_sidecar: Data provider initialized: S3 (mode: s3)`

### 5.2. DICOMweb (PACS)

**Variáveis necessárias:**
```bash
INGESTION_MODE=dicomweb
DICOMWEB_URL=http://pacs.hospital.local:8080/dcm4chee-arc/aets/DCM4CHEE/rs
DICOMWEB_AUTH_TOKEN=Bearer xxxxxxxx  # ou deixe vazio se não tiver auth
DATA_PIPELINE=dicom
DICOM_ENABLE_OCR=true
```

**Endpoints que o Sidecar vai usar:**
- `GET /studies` (listar estudos)
- `GET /studies/{studyUID}/series` (listar séries)
- `GET /studies/{studyUID}/series/{seriesUID}/instances` (listar instâncias)
- `GET /studies/{studyUID}/series/{seriesUID}/instances/{instanceUID}` (baixar DICOM)

**Validação:**
- Teste manualmente: `curl -H "Authorization: Bearer xxx" http://pacs.hospital.local:8080/.../studies`
- No Sidecar, verifique logs: `INFO xase_sidecar: Data provider initialized: DICOMweb`

### 5.3. FHIR (HL7 FHIR R4)

**Variáveis necessárias:**
```bash
INGESTION_MODE=fhir
FHIR_URL=http://fhir.hospital.local:8080/fhir
FHIR_AUTH_TOKEN=Bearer xxxxxxxx  # ou deixe vazio
DATA_PIPELINE=fhir
FHIR_ENABLE_NLP=true
FHIR_DATE_SHIFT_DAYS=30  # deslocamento de datas para desidentificação
FHIR_REDACT_PATHS=$.patient.name,$.identifier
```

**Recursos que o Sidecar vai buscar:**
- `GET /Patient`
- `GET /Observation`
- `GET /DiagnosticReport`
- `GET /Encounter`

**Validação:**
- Teste: `curl -H "Authorization: Bearer xxx" http://fhir.hospital.local:8080/fhir/Patient`
- No Sidecar, verifique logs: `INFO xase_sidecar: Data provider initialized: FHIR`

### 5.4. Híbrido (DICOMweb + S3 fallback)

**Variáveis necessárias:**
```bash
INGESTION_MODE=hybrid
DICOMWEB_URL=http://pacs.hospital.local:8080/dcm4chee-arc/aets/DCM4CHEE/rs
DICOMWEB_AUTH_TOKEN=Bearer xxxxxxxx
HYBRID_FALLBACK_TO_S3=true
BUCKET_NAME=hospital-archive
AWS_ACCESS_KEY_ID=AKIAXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
DATA_PIPELINE=dicom
```

**Comportamento:**
- Tenta buscar no DICOMweb primeiro.
- Se falhar (404, timeout), busca no S3.

---

## 6. Validação e Testes

### 6.1. Verificar saúde do Sidecar

**Endpoints de observabilidade:**
- `GET /health` → Status geral (sempre "healthy" se o processo está up).
- `GET /ready` → Readiness (hoje sempre "ready: true", futuro vai checar conectores).
- `GET /metrics` → Métricas Prometheus (cache, bytes processados, etc.).

**Teste manual:**
```bash
# Health
curl http://159.89.225.143:9090/health
# Esperado: {"status":"healthy","timestamp":"...","service":"xase-sidecar","version":"0.1.0"}

# Ready
curl http://159.89.225.143:9090/ready
# Esperado: {"ready":true,"timestamp":"..."}

# Metrics
curl http://159.89.225.143:9090/metrics
# Esperado: texto Prometheus com métricas (xase_cache_hit_rate, etc.)
```

### 6.2. Verificar conectividade com a fonte de dados

**S3:**
- Verifique logs: `INFO xase_sidecar: Data provider initialized: S3 (mode: s3)`
- Sem erros de "failed to list bucket" ou "access denied".

**DICOMweb/FHIR:**
- Verifique logs: `INFO xase_sidecar: Data provider initialized: DICOMweb` (ou FHIR).
- Sem erros de "connection refused" ou "401 Unauthorized".

### 6.3. Testar prefetch (se ativado)

Se `DISABLE_PREFETCH=false`:
- Verifique logs: `INFO xase_sidecar: Prefetch enabled - starting engine (pipeline: dicom)`
- Aguarde alguns minutos e cheque métricas:
  ```bash
  curl http://159.89.225.143:9090/metrics | grep xase_cache_entries
  # Esperado: xase_cache_entries > 0 (se houver dados)
  ```

### 6.4. Testar desidentificação (OCR/NLP/Áudio)

**OCR (DICOM):**
- Ative: `DICOM_ENABLE_OCR=true`
- Processe uma imagem DICOM com texto queimado (burned-in).
- Verifique logs: `INFO xase_sidecar: OCR scrubbing applied to DICOM`
- Cheque métricas: `xase_redactions_total` deve incrementar.

**NLP (FHIR):**
- Ative: `FHIR_ENABLE_NLP=true`
- Processe um DiagnosticReport com PHI no texto.
- Verifique logs: `INFO xase_sidecar: NLP redaction applied to FHIR resource`
- Cheque métricas: `xase_redactions_total` deve incrementar.

**Áudio:**
- Ative: `AUDIO_ENABLE_REDACTION=true`
- Processe um arquivo de áudio com voz.
- Verifique logs: `INFO xase_sidecar: Audio redaction applied`
- Cheque métricas: `xase_redactions_total` deve incrementar.

---

## 7. Operação Diária

### 7.1. Monitoramento

**Grafana (recomendado):**
- Configure Grafana para scrape `http://159.89.225.143:9090/metrics`.
- Dashboards sugeridos:
  - Cache hit rate (`xase_cache_hit_rate`)
  - Bytes processados (`xase_bytes_processed_total`)
  - Redações (`xase_redactions_total`)
  - Latência de serve (`xase_serve_latency_seconds`)
  - Modo cache-only (`xase_cache_only_mode`)

**Alertas:**
- `xase_cache_only_mode == 1` → Sidecar perdeu conexão com o Brain.
- `xase_data_provider_errors_total` crescendo → Problema com S3/PACS/FHIR.
- `xase_cache_hit_rate < 0.5` → Cache pequeno ou prefetch desligado.

### 7.2. Logs

**Acessar logs no Easypanel:**
- Dashboard → Services → xase-sidecar → Logs → Runtime Logs.

**Logs importantes:**
- `INFO xase_sidecar: Xase Sidecar starting...` → Boot OK.
- `WARN xase_sidecar: Failed to send telemetry` → Conexão com Brain falhou (temporário OK).
- `ERROR xase_sidecar: Data provider error` → Problema com fonte de dados.

**Nível de log:**
- `RUST_LOG=info` (padrão, recomendado).
- `RUST_LOG=debug` (verbose, use para troubleshooting).
- `RUST_LOG=warn` (silencioso, use em produção estável).

### 7.3. Atualizações

**Quando atualizar o Sidecar:**
- Nova versão disponível no repo.
- Correção de bug crítico.
- Ativação de nova feature (OCR, NLP, etc.).

**Processo de atualização:**
1. **Git push** da nova versão para o repo.
2. **Easypanel → Deploy Service** (ou configure webhook para auto-deploy).
3. Aguarde build e restart.
4. Verifique logs e métricas pós-deploy.

**Rollback:**
- Se algo quebrar, faça rollback no Git e redeploy.
- Ou use "Deploy History" no Easypanel para voltar a um deploy anterior.

### 7.4. Backup

**O que fazer backup:**
- Volume `/var/lib/xase` (metadados e cache).
- Variáveis de ambiente (export do Easypanel).

**Frequência:**
- Metadados: diário (se crítico).
- Cache: opcional (pode ser reconstruído via prefetch).

---

## 8. Troubleshooting

### 8.1. Sidecar não sobe (crash loop)

**Sintomas:**
- Logs mostram erro e o container reinicia repetidamente.

**Causas comuns:**
- `INGESTION_MODE` inválido (use: s3, dicomweb, fhir, hybrid).
- Falta de variáveis obrigatórias (CONTRACT_ID, XASE_API_KEY, LEASE_ID) quando `XASE_SKIP_AUTH` não está setado.
- Porta 9090 já em uso.

**Solução:**
- Verifique logs: `Easypanel → Logs → Runtime Logs`.
- Corrija variáveis de ambiente.
- Se persistir, use `XASE_SKIP_AUTH=1` para boot e valide depois.

### 8.2. Métricas não acessíveis (404 ou timeout)

**Sintomas:**
- `curl http://159.89.225.143:9090/metrics` retorna erro.

**Causas:**
- Porta 9090 não exposta no Easypanel.
- Firewall bloqueando inbound TCP 9090.
- Sidecar não iniciou o servidor de métricas.

**Solução:**
- Verifique logs: `INFO xase_sidecar: ✓ Prometheus metrics server listening on 0.0.0.0:9090`
- Configure port mapping no Easypanel (Networking → Ports).
- Libere porta 9090 no firewall do provedor (DigitalOcean, AWS, etc.).

### 8.3. Erro "Failed to list bucket" (S3)

**Sintomas:**
- Logs: `ERROR xase_sidecar: Data provider error: failed to list bucket`

**Causas:**
- Credenciais S3 inválidas (access key/secret key).
- Bucket não existe ou nome errado.
- Região errada (`AWS_REGION`).
- Permissões IAM insuficientes (precisa `s3:ListBucket`, `s3:GetObject`).

**Solução:**
- Teste credenciais manualmente: `aws s3 ls s3://bucket-name --region us-east-1`
- Verifique IAM policy do usuário.
- Corrija `BUCKET_NAME` e `AWS_REGION`.

### 8.4. Erro "Connection refused" (DICOMweb/FHIR)

**Sintomas:**
- Logs: `ERROR xase_sidecar: Data provider error: connection refused`

**Causas:**
- URL errada (`DICOMWEB_URL` ou `FHIR_URL`).
- Servidor PACS/FHIR não acessível da rede do Sidecar.
- Firewall bloqueando saída.

**Solução:**
- Teste conectividade: `curl http://pacs.hospital.local:8080/...`
- Verifique se o Sidecar está na mesma rede ou tem rota para o PACS/FHIR.
- Ajuste firewall/VPN.

### 8.5. Cache hit rate baixo (<50%)

**Sintomas:**
- Métrica `xase_cache_hit_rate` < 0.5.

**Causas:**
- Prefetch desligado (`DISABLE_PREFETCH=1`).
- Cache pequeno (`CACHE_SIZE_GB` insuficiente).
- Dados muito grandes ou padrão de acesso aleatório.

**Solução:**
- Ative prefetch: remova `DISABLE_PREFETCH` ou sete `DISABLE_PREFETCH=false`.
- Aumente cache: `CACHE_SIZE_GB=500` (ou mais).
- Monitore `xase_cache_size_bytes` e `xase_cache_entries`.

### 8.6. Modo cache-only ativado (xase_cache_only_mode=1)

**Sintomas:**
- Métrica `xase_cache_only_mode` = 1.
- Logs: `WARN xase_sidecar: Entering cache-only mode (Brain unavailable)`

**Causas:**
- Brain (Vercel) inacessível (down, DNS, firewall).
- Credenciais inválidas (`XASE_API_KEY`, `LEASE_ID`).
- Grace period expirado (padrão 300s).

**Solução:**
- Verifique conectividade com o Brain: `curl https://xase.ai/api/v1/sidecar/auth`
- Corrija credenciais.
- Aguarde o Brain voltar (Sidecar sai do cache-only automaticamente após auth bem-sucedida).

---

## 9. Roadmap de Segurança (JWT/AuthZ)

**Estado atual:**
- Sidecar autentica com o Brain via `X-API-Key` + `LEASE_ID`.
- Não há validação de JWT por request de usuário.
- Endpoints `/metrics`, `/health`, `/ready` são públicos (ou protegidos por rede).

**Próximos passos (em desenvolvimento):**

### 9.1. Brain: Emissão de JWT curto
- Endpoint: `POST /api/v1/sidecar/token` (emite JWT curto para chamadas ao Sidecar).
- Claims: `sub` (user_id), `tenant_id`, `contract_id`, `scopes`, `exp` (5–15 min).
- JWKS: `GET /.well-known/jwks.json` (chave pública RS256).

### 9.2. Sidecar: Validação de JWT
- Middleware Axum para validar `Authorization: Bearer <JWT>`.
- Cache de JWKS (refresh a cada 15 min).
- Checagem de `tenant_id/contract_id` vs. config do Sidecar.
- Checagem de `scopes` por endpoint (ex.: `read:dicom`, `process:text`).

### 9.3. Endpoints protegidos (futuro)
- `GET /v1/segments` → requer `read:*`
- `GET /v1/segment/:id` → requer `read:*`
- `POST /v1/process/text` → requer `process:text`
- `POST /v1/process/dicom` → requer `process:dicom`

### 9.4. Capabilities e Readiness enriquecidos
- `/ready` vai checar:
  - Auth recente (< 60s).
  - Conectores (S3/DICOMweb/FHIR) com health check.
  - Features ativas (OCR/NLP/áudio).
- `/capabilities` novo endpoint:
  - Versão, pipelines suportados, features, limites.

**Timeline:** Q1 2026 (próximas 4–6 semanas).

---

## Resumo: Checklist de Deploy

### Fase 1: Boot Mode (validação)
- [ ] Criar serviço no Easypanel (`xase-sidecar`).
- [ ] Configurar variáveis de ambiente (boot mode com `XASE_SKIP_AUTH=1`).
- [ ] Configurar volume (`/var/lib/xase`, 100GB+).
- [ ] Deploy e verificar logs (esperado: "Prometheus metrics server listening").
- [ ] Testar `/health`, `/ready`, `/metrics` (HTTP 200).

### Fase 2: Configuração Real
- [ ] Coletar credenciais do hospital (S3/DICOMweb/FHIR).
- [ ] Gerar `CONTRACT_ID`, `XASE_API_KEY`, `LEASE_ID` no Brain.
- [ ] Atualizar variáveis de ambiente (remover `XASE_SKIP_AUTH`, adicionar credenciais reais).
- [ ] Redeploy e verificar logs (sem erros de auth ou data provider).
- [ ] Testar conectividade com fonte de dados (S3 list, DICOMweb GET, etc.).

### Fase 3: Features e Otimização
- [ ] Ativar prefetch (`DISABLE_PREFETCH=false`).
- [ ] Ativar OCR/NLP/Áudio conforme necessário.
- [ ] Configurar Grafana para scrape `/metrics`.
- [ ] Configurar alertas (cache-only, errors, hit rate).
- [ ] Documentar configuração específica do hospital (runbook).

### Fase 4: Produção
- [ ] Expor porta 9090 via HTTPS (proxy ou túnel).
- [ ] Configurar `NEXT_PUBLIC_SIDECAR_ORIGIN` no Brain (Vercel).
- [ ] Testar fluxo end-to-end (usuário → Brain → Sidecar → dados).
- [ ] Configurar backup de `/var/lib/xase`.
- [ ] Treinar equipe do hospital (acesso, logs, alertas).

---

## Contato e Suporte

- **Documentação:** `/docs` no repo.
- **Issues:** GitHub Issues.
- **Slack/Discord:** (se tiver canal de suporte).
- **Email:** suporte@xase.ai (se aplicável).

---

**Fim do Guia.**
