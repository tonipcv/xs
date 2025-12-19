# XASE — Roadmap e Próximos Passos

> **Status:** Implementação base completa. Este documento lista melhorias e funcionalidades adicionais.

Este documento sumariza o que já está implementado e o que falta para transformar a XASE em uma camada de evidência enterprise-ready (produto, arquitetura, segurança, compliance, UX e operações).

---

## Índice

1. [Estado Atual](#1-estado-atual-confirmado-no-código)
2. [Gaps Técnicos e Melhorias](#2-gaps-técnicos-e-melhorias-priorizadas)
3. [UX/Produto](#3-uxproduto)
4. [Segurança & Compliance](#4-segurança--compliance)
5. [Operações & Observabilidade](#5-operações--observabilidade)
6. [Roadmap Sugerido](#6-roadmap-sugerido-incremental)
7. [Tarefas Técnicas](#7-tarefas-técnicas-checklist)

---

## 1. Estado Atual (Confirmado no Código)

- **Ledger de decisões**: `DecisionRecord` com hashes, chain (`previousHash`), payloads e metadados. Fonte: `prisma/schema.prisma`.
- **Export verificável**: bundle ZIP com `decision.json`, `proof.json`, `verify.js`, `policy.json`, `payloads/*`, `report.txt`. Fontes: `src/lib/xase/export.ts` e rota `src/app/api/xase/v1/export/[id]/download/route.ts`.
- **Assinatura criptográfica**: serviço de assinatura com KMS mock e suporte a AWS KMS. Fontes: `src/lib/xase/kms.ts`, `src/lib/xase/signing-service.ts`.
- **API Key**: validação via `X-API-Key`, permissões (`ingest`, `verify`, `export`), audit básico. Fontes: `src/lib/xase/auth.ts`, rotas `src/app/xase/api-keys/*`.
- **Policies versionadas**: CRUD/snapshot e resolução da versão usada. Fonte: `src/lib/xase/policies.ts`.
- **Checkpoint**: modelo e hooks para âncoras de integridade. Fonte: `prisma/schema.prisma` (`CheckpointRecord`).
- **Auditoria**: `AuditLog` com registros de ações-chave (ex.: assinatura). Fontes: `src/lib/xase/audit.ts`, `src/lib/xase/signing-service.ts`, `src/lib/xase/export.ts`.

---

## 2. Gaps Técnicos e Melhorias Priorizadas

### ✅ Storage Externo (Implementado)

- Upload do bundle para MinIO/S3, com persistência em `EvidenceBundle` e reuso
  - Implementar cliente S3 (`src/lib/xase/storage.ts`) com envs: `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`.
  - Na rota de download, após gerar o ZIP: calcular `sha256`, subir para bucket (chave: `evidence/{transactionId}_{includePayloads}.zip`), salvar em `EvidenceBundle` (`storageUrl`, `storageKey`, `bundleHash`, `bundleSize`, `includesPayloads`).
  - Antes de gerar, verificar cache em `EvidenceBundle` e servir via URL assinado (reuso; evita CPU/memória).

- **[URL assinado]** Retorno como pre-signed URL (em vez de stream pelo Node)
  - Parâmetro `download=redirect|json|stream` para controlar comportamento.
  - `GET` pode responder 302 (redirect) ou JSON `{ presigned_url, ... }`.

- **[parametrização]** Flags de export na rota `download`
  - `include_payloads=true|false` (default true hoje) para export “somente-hashes”.
  - `format=json|zip` (para integrações headless que só querem `manifest/payloads/proof`).
  - `lang=pt|en` (localização do `report.txt`).

- **[auditoria completa]** Eventos e métricas de export/storage/download
  - `EXPORT_CREATED` (já existe), `BUNDLE_STORED`, `BUNDLE_DOWNLOADED` (com IP, `userId`/`apiKeyId`, `bundleId`).
  - EvidenceBundle é imutável (create-only). "Last Access" deve ser derivado via `AuditLog` (último `BUNDLE_DOWNLOADED`).
  - Expor métricas (ex.: counts por tenant/hora) para painel interno.

- **[rate limit & quotas]** Políticas de export
  - Rate limit dedicado para `export` por tenant/API key (separado do serviço de assinatura).
  - Cotas por período (ex.: N bundles/dia por plan).

- **[KMS produção]** Chave gerenciada e pin de confiança
  - Habilitar `XASE_KMS_TYPE=aws` com `XASE_KMS_KEY_ID`, IAM e região.
  - Incluir na `proof.json` o `key_id`/ARN e fingerprint oficial; publicar fingerprint em canal de confiança (site/docs) para pinning.

- **[checkpoint TSA opcional]**
  - Emitir carimbo de tempo (RFC3161) e armazenar em `CheckpointRecord` (`tsaToken`, `tsaUrl`, `tsaTimestamp`).
  - Referenciar no proof para auditoria avançada.

- **[determinismo/versões]**
  - Versionar formato do bundle (já há `version`/`format` no manifest). Manter backward compatibility.
  - Evitar qualquer campo não determinístico fora dos locais certos (ex.: timestamps documentados).

- **[streaming/grandes bundles]**
  - Para payloads muito grandes, suportar streaming do ZIP (ou sempre usar storage + pre-signed) para reduzir pressão no Node.

---

## 3. UX/Produto

### ✅ UI Download (Implementado)

- Botão na página do record (server-side), sem expor `X-API-Key` ao browser
  - Uma server action/route que valida sessão e gera pre-signed; retorna arquivo.
  - Mostrar `report.txt` renderizado + status (hash/assinatura válidos) no painel.

- **[Histórico de exports]**
  - Tela de `EvidenceBundle` por decision/tenant com re-download e metadata (hash, tamanho, retenção, initial/exported_at, accessedAt).

- **[Human-in-the-loop]**
  - UI para captura de revisão humana (quem, quando, o que mudou, justificativa) e link no `decision.json`.

---

## 4. Segurança & Compliance

- **[retention/hold]** Mapeamento de `EvidenceBundle.retentionUntil`/`legalHold` para política do bucket (Object Lock/Lifecycle).
- **[segredo/API]** `X-API-Key` apenas server-side; tokens temporários para download público, se necessário.
- **[LGPD/GDPR]** Se payloads contiverem PII, permitir export “somente-hashes” e mascaramento.
- **[assinatura/PKI]** Política de rotação de chaves e pin/fingerprint públicos auditáveis.

---

## 5. Operações & Observabilidade

- **[jobs]** Cron/queue para exportar automaticamente decisões críticas (marcadas via regra ou SLA) e armazenar no bucket.
- **[alertas]** Alarmes para falha no upload/assinatura/ZIP; budget de export por tenant.
- **[logs]** Correlação entre `AuditLog` e requests (traceId) e export IDs.

---

## 6. Roadmap Sugerido (Incremental)

- **Fase 1 (Infra de storage e reuso)**
  - Cliente S3/MinIO (`src/lib/xase/storage.ts`).
  - Upload + persistência `EvidenceBundle` na rota; reuso se já existir.
  - Retorno por URL assinado.

- **Fase 2 (Parametrização e UI)**
  - Query params: `include_payloads`, `format`, `lang`.
  - Botão “Baixar evidência” (server-side) e tela de histórico `EvidenceBundle`.

- **Fase 3 (Segurança/Compliance)**
  - KMS AWS em produção + pin oficial de fingerprint.
  - Retenção/hold no bucket e mapeamento de políticas.
  - Rate limit/quotas de export.

- **Fase 4 (TSA & Observabilidade)**
  - Integração TSA (opcional) nos checkpoints.
  - Eventos `BUNDLE_STORED`/`BUNDLE_DOWNLOADED` + métricas/alertas.

---

## 7. Tarefas Técnicas (Checklist)

- **[storage]** Criar `src/lib/xase/storage.ts` com:
  - `S3Client` compatível MinIO (endpoint, forcePathStyle, credenciais).
  - `uploadBuffer(bucket, key, buf, contentType)` e `getPresignedUrl(bucket, key, expires)`.
- **[rota download]** `src/app/api/xase/v1/export/[id]/download/route.ts`:
  - Ler `include_payloads`/`format`/`download` via `request.nextUrl.searchParams`.
  - Cache/reuso via `EvidenceBundle` (upsert na primeira geração).
  - Upload do ZIP, salvar `bundleHash`/`bundleSize`, retornar pre-signed.
  - Auditar: `BUNDLE_STORED`, `BUNDLE_DOWNLOADED`.
- **[UI]** Página do record: botão baixar; página de bundles (lista e re-download).
- **[KMS]** Variáveis AWS e roles; doc do pin de fingerprint.
- **[retention]** Configuração do bucket e mapeamento para `EvidenceBundle`.
- **[rate limit]** Limite de export por hora/tenant e quotas por plano.

---

## Conclusão

**Status atual:** ✅ Base técnica sólida e funcional

A implementação atual inclui:
- Ledger de decisões com hashes e chain
- Assinatura criptográfica (KMS mock + AWS KMS)
- Export verificável offline
- Storage MinIO/S3 com URL assinado
- UI de download segura
- Histórico de bundles
- Auditoria completa

**Próximos passos prioritários:**
1. KMS de produção (AWS)
2. Rate limit e quotas
3. TSA (carimbo de tempo)
4. Jobs de export automático
5. Painel de métricas

Com essas melhorias, a XASE evolui de "prova funcional" para "prova enterprise" adequada a auditorias e exigências regulatórias.

---

**Última atualização:** 16 de dezembro de 2025
