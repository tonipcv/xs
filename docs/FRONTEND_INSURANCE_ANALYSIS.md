# 📊 Análise do Frontend — Adaptação para Insurance UK/EU

**Data:** 4 de Janeiro de 2026  
**Objetivo:** Identificar gaps e adaptações necessárias no frontend para empresas de seguros (UK/EU)

---

## 🎯 ESTRUTURA ATUAL DO FRONTEND

### Páginas Principais (src/app/xase/)
1. **Dashboard** (`/xase/dashboard`) — Métricas gerais
2. **Records** (`/xase/records`) — Lista de decisões
3. **Record Detail** (`/xase/records/[id]`) — Detalhes de uma decisão
4. **Bundles** (`/xase/bundles`) — Pacotes de evidência
5. **Bundle Detail** (`/xase/bundles/[bundleId]`) — Detalhes do bundle
6. **Checkpoints** (`/xase/checkpoints`) — Checkpoints criptográficos
7. **Audit Log** (`/xase/audit`) — Trilha de auditoria
8. **API Keys** (`/xase/api-keys`) — Gerenciamento de chaves
9. **Docs** (`/xase/docs`) — Documentação

### Componentes Principais (src/components/xase/)
- `RecordDetails.tsx` — Visualização detalhada de decisão
- `InterventionDialog.tsx` — Diálogo de intervenção humana
- `TrustDashboard.tsx` — Dashboard de confiança/métricas

---

## 🔍 GAPS IDENTIFICADOS PARA INSURANCE

### 1. Records Page — Faltam Campos Insurance
**Problema:**
- Lista apenas: `transactionId`, `policyId`, `decisionType`, `confidence`, `timestamp`
- **Não mostra:** `claimNumber`, `policyNumber`, `claimType`, `claimAmount`, `decisionOutcome`

**Solução:**
```typescript
// src/app/xase/records/page.tsx (linha 44-52)
// ADICIONAR:
select: {
  id: true,
  transactionId: true,
  policyId: true,
  decisionType: true,
  confidence: true,
  isVerified: true,
  timestamp: true,
  // NOVOS CAMPOS INSURANCE:
  insuranceDecision: {
    select: {
      claimNumber: true,
      claimType: true,
      claimAmount: true,
      policyNumber: true,
      decisionOutcome: true,
      decisionImpactConsumerImpact: true,
    }
  }
}
```

**Impacto:**
- Tabela de records mostrará claim number e policy number (essencial para insurance)
- Filtros por claim type (AUTO, HEALTH, LIFE, etc.)
- Badge visual para consumer impact (LOW, MEDIUM, HIGH)

---

### 2. Record Detail — Sem Seção Insurance
**Problema:**
- `RecordDetails.tsx` não exibe campos insurance
- Não mostra snapshots (external data, business rules, environment, feature vector)

**Solução:**
Adicionar seção "Insurance Details" no `RecordDetails.tsx`:

```tsx
{record.insuranceDecision && (
  <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
    <h3 className="text-sm font-medium text-white mb-4">Insurance Details</h3>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-white/40">Claim Number</p>
        <p className="text-sm text-white">{record.insuranceDecision.claimNumber}</p>
      </div>
      <div>
        <p className="text-xs text-white/40">Policy Number</p>
        <p className="text-sm text-white">{record.insuranceDecision.policyNumber}</p>
      </div>
      <div>
        <p className="text-xs text-white/40">Claim Type</p>
        <p className="text-sm text-white">{record.insuranceDecision.claimType}</p>
      </div>
      <div>
        <p className="text-xs text-white/40">Claim Amount</p>
        <p className="text-sm text-white">£{record.insuranceDecision.claimAmount?.toLocaleString()}</p>
      </div>
      <div>
        <p className="text-xs text-white/40">Decision Outcome</p>
        <span className="text-sm text-white">{record.insuranceDecision.decisionOutcome}</span>
      </div>
      <div>
        <p className="text-xs text-white/40">Consumer Impact</p>
        <span className={`text-sm ${getImpactColor(record.insuranceDecision.decisionImpactConsumerImpact)}`}>
          {record.insuranceDecision.decisionImpactConsumerImpact}
        </span>
      </div>
    </div>
  </div>
)}
```

**Adicionar seção "Reproducibility Snapshots":**

```tsx
{(record.externalDataSnapshotId || record.businessRulesSnapshotId || 
  record.environmentSnapshotId || record.featureVectorSnapshotId) && (
  <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
    <h3 className="text-sm font-medium text-white mb-4">Reproducibility Snapshots</h3>
    <div className="space-y-2">
      {record.externalDataSnapshotId && (
        <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-white">External Data</span>
          </div>
          <button className="text-xs text-blue-400 hover:underline">
            View Snapshot
          </button>
        </div>
      )}
      {/* Repetir para business rules, environment, feature vector */}
    </div>
  </div>
)}
```

---

### 3. Bundles Page — Sem Indicadores Insurance
**Problema:**
- Não mostra se bundle contém decisões insurance
- Não indica se tem PDF legal ou custody report

**Solução:**
Adicionar badges e indicadores:

```tsx
// src/app/xase/bundles/page.tsx
// ADICIONAR colunas:
select: {
  id: true,
  bundleId: true,
  status: true,
  recordCount: true,
  purpose: true,
  createdBy: true,
  createdAt: true,
  completedAt: true,
  expiresAt: true,
  // NOVOS:
  includesPdf: true,
  pdfReportUrl: true,
  legalFormat: true,
  bundleManifestHash: true,
}
```

Adicionar badges visuais:
- 📄 "PDF Legal" se `includesPdf = true`
- 🔐 "Manifest" se `bundleManifestHash` existe
- ⚖️ "Court-Ready" se `legalFormat = 'uk_insurance'`

---

### 4. Bundle Detail — Faltam Artefatos Jurídicos
**Problema:**
- Não mostra Custody Report
- Não mostra PDF Legal
- Não mostra Manifest

**Solução:**
Adicionar seção "Legal Artifacts" no bundle detail:

```tsx
<div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
  <h3 className="text-sm font-medium text-white mb-4">Legal Artifacts</h3>
  <div className="space-y-3">
    {/* Custody Report */}
    <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-blue-400" />
        <span className="text-sm text-white">Chain of Custody Report</span>
      </div>
      <div className="flex gap-2">
        <button className="text-xs text-blue-400 hover:underline">
          View JSON
        </button>
        <button className="text-xs text-blue-400 hover:underline">
          Download PDF
        </button>
      </div>
    </div>

    {/* PDF Legal */}
    {bundle.pdfReportUrl && (
      <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-green-400" />
          <span className="text-sm text-white">PDF Legal Report (Court-Ready)</span>
        </div>
        <div className="flex gap-2">
          <button className="text-xs text-green-400 hover:underline">
            Download
          </button>
          <span className="text-xs text-white/40">
            Hash: {bundle.pdfReportHash?.substring(0, 16)}...
          </span>
        </div>
      </div>
    )}

    {/* Manifest */}
    {bundle.bundleManifestHash && (
      <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-400" />
          <span className="text-sm text-white">Cryptographic Manifest</span>
        </div>
        <div className="flex gap-2">
          <button className="text-xs text-purple-400 hover:underline">
            View
          </button>
          <span className="text-xs text-white/40">
            Hash: {bundle.bundleManifestHash.substring(0, 16)}...
          </span>
        </div>
      </div>
    )}
  </div>
</div>
```

---

### 5. Dashboard — Métricas Insurance Ausentes
**Problema:**
- Dashboard genérico, não mostra métricas insurance
- Faltam: total de claims, approval rate, average claim amount, high-impact decisions

**Solução:**
Adicionar seção "Insurance Metrics" no dashboard:

```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
    <p className="text-[10px] text-white/40 tracking-wider">TOTAL CLAIMS</p>
    <p className="text-3xl font-semibold text-white">{totalClaims}</p>
    <p className="text-xs text-white/40 mt-1">Last 30 days</p>
  </div>
  
  <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
    <p className="text-[10px] text-white/40 tracking-wider">APPROVAL RATE</p>
    <p className="text-3xl font-semibold text-white">{approvalRate}%</p>
    <p className="text-xs text-green-400 mt-1">↑ 2.3% vs last month</p>
  </div>
  
  <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
    <p className="text-[10px] text-white/40 tracking-wider">AVG CLAIM AMOUNT</p>
    <p className="text-3xl font-semibold text-white">£{avgClaimAmount}</p>
  </div>
  
  <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
    <p className="text-[10px] text-white/40 tracking-wider">HIGH IMPACT</p>
    <p className="text-3xl font-semibold text-white">{highImpactCount}</p>
    <p className="text-xs text-yellow-400 mt-1">Requires review</p>
  </div>
</div>
```

---

### 6. Filtros e Busca — Sem Campos Insurance
**Problema:**
- Filtros atuais: date range, policy, decision type
- Faltam: claim number, policy number, claim type, consumer impact

**Solução:**
Adicionar filtros insurance na RecordsTable:

```tsx
<div className="flex gap-2">
  <input
    type="text"
    placeholder="Search by claim number..."
    className="px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded text-sm text-white"
  />
  <select className="px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded text-sm text-white">
    <option value="">All Claim Types</option>
    <option value="AUTO">Auto</option>
    <option value="HEALTH">Health</option>
    <option value="LIFE">Life</option>
    <option value="PROPERTY">Property</option>
    <option value="LIABILITY">Liability</option>
    <option value="TRAVEL">Travel</option>
  </select>
  <select className="px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded text-sm text-white">
    <option value="">All Impact Levels</option>
    <option value="LOW">Low Impact</option>
    <option value="MEDIUM">Medium Impact</option>
    <option value="HIGH">High Impact</option>
  </select>
</div>
```

---

## 📋 RESUMO DE ADAPTAÇÕES NECESSÁRIAS

### Prioridade ALTA (Essencial para Insurance)
1. ✅ **Records List** — Adicionar colunas insurance (claim number, policy number, claim type)
2. ✅ **Record Detail** — Seção "Insurance Details" completa
3. ✅ **Record Detail** — Seção "Reproducibility Snapshots"
4. ✅ **Bundle Detail** — Seção "Legal Artifacts" (custody, PDF, manifest)
5. ✅ **Filtros** — Busca por claim number, filtro por claim type e consumer impact

### Prioridade MÉDIA (Melhora UX)
6. ⚠️ **Dashboard** — Métricas insurance (claims, approval rate, avg amount)
7. ⚠️ **Bundles List** — Badges visuais (PDF, Manifest, Court-Ready)
8. ⚠️ **Record Detail** — Link direto para custody report e PDF
9. ⚠️ **Audit Log** — Filtro por eventos insurance (CLAIM_INGESTED, PDF_GENERATED)

### Prioridade BAIXA (Nice to have)
10. 💡 **Dashboard** — Gráfico de claims por tipo (AUTO, HEALTH, etc.)
11. 💡 **Dashboard** — Timeline de decisões high-impact
12. 💡 **Record Detail** — Preview inline do PDF legal
13. 💡 **Bundles** — Geração de bundle filtrado por claim type

---

## 🎨 DESIGN PATTERNS RECOMENDADOS

### Badges de Status
```tsx
// Claim Type
<span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-blue-500/10 text-blue-400">
  AUTO
</span>

// Consumer Impact
<span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-red-500/10 text-red-400">
  HIGH IMPACT
</span>

// Decision Outcome
<span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-green-500/10 text-green-400">
  APPROVED
</span>
```

### Ícones Recomendados (lucide-react)
- `FileText` — PDF, documentos
- `Shield` — Manifest, segurança
- `Database` — Snapshots
- `Scale` — Legal, court-ready
- `AlertTriangle` — High impact
- `CheckCircle` — Approved
- `XCircle` — Rejected

---

## 🚀 IMPLEMENTAÇÃO SUGERIDA

### Fase 1 (Imediato)
- Adicionar campos insurance na query de records
- Criar seção "Insurance Details" no RecordDetails
- Adicionar filtros por claim type e consumer impact

### Fase 2 (Curto prazo)
- Implementar seção "Legal Artifacts" no bundle detail
- Adicionar badges visuais nos bundles
- Criar métricas insurance no dashboard

### Fase 3 (Médio prazo)
- Preview inline de PDF legal
- Gráficos de claims por tipo
- Timeline de decisões high-impact

---

## 📝 NOTAS TÉCNICAS

### Queries Prisma a Atualizar
1. `src/app/xase/records/page.tsx` — incluir `insuranceDecision`
2. `src/app/xase/records/[id]/page.tsx` — incluir `insuranceDecision` e snapshots
3. `src/app/xase/bundles/page.tsx` — incluir `includesPdf`, `legalFormat`, `bundleManifestHash`
4. `src/app/xase/bundles/[bundleId]/page.tsx` — incluir todos os campos legais

### Componentes a Criar
1. `InsuranceDetailsCard.tsx` — Card de detalhes insurance
2. `SnapshotsCard.tsx` — Card de snapshots de reproducibility
3. `LegalArtifactsCard.tsx` — Card de artefatos jurídicos
4. `InsuranceMetrics.tsx` — Métricas insurance para dashboard

### APIs a Criar/Atualizar
1. `GET /api/xase/v1/bundles/:bundleId/custody` — já existe ✅
2. `POST /api/xase/v1/bundles/:bundleId/pdf` — já existe ✅
3. `GET /api/xase/v1/bundles/:bundleId/manifest` — criar
4. `GET /api/xase/v1/snapshots/:snapshotId` — criar (para preview)

---

**Preparado por:** Cascade AI  
**Data:** 4 de Janeiro de 2026  
**Próximo:** Documentação técnica e jurídica completa
