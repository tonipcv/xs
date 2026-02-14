# 🎯 XASE HITL - Plano Completo de Implementação

## 📊 Status Atual (17/12/2025 - 10:54)

### ✅ O que está funcionando

1. **Backend Core (100%)**
   - ✅ Schema Prisma com `HumanIntervention` e campos derivados
   - ✅ Migrations aplicadas (006, 007, 008, 009)
   - ✅ Trigger de imutabilidade relaxada para campos HITL
   - ✅ `src/lib/xase/human-intervention.ts` com validações
   - ✅ `src/lib/xase/audit.ts` com eventos HITL
   - ✅ Autenticação por API Key funcionando

2. **APIs REST (100%)**
   - ✅ `POST /api/xase/v1/records/[id]/intervene` (criar intervenção)
   - ✅ `GET /api/xase/v1/records/[id]/intervene` (listar intervenções)
   - ✅ Validação Zod por ação
   - ✅ Captura de IP/UA
   - ✅ Logs detalhados (STEP1..STEP5)

3. **Testes Manuais (100%)**
   - ✅ APPROVED funcionando
   - ✅ Listagem de intervenções OK
   - ✅ Campos derivados atualizados corretamente

### ⏳ O que falta (priorizado)

## 🚀 FASE 1: Segurança e Robustez (ALTA PRIORIDADE)

### 1.1 RBAC para HITL
**Tempo:** 30min  
**Arquivos:** `src/lib/xase/auth.ts`, `src/app/api/xase/v1/records/[id]/intervene/route.ts`

```typescript
// Adicionar em validateApiKey
export interface AuthResult {
  valid: boolean;
  tenantId?: string;
  apiKeyId?: string;
  permissions?: string[];
  role?: 'OWNER' | 'ADMIN' | 'REVIEWER' | 'VIEWER'; // NOVO
  error?: string;
}

// Enforcar na rota
if (!['OWNER', 'ADMIN', 'REVIEWER'].includes(auth.role || '')) {
  return NextResponse.json(
    { error: 'Insufficient permissions', code: 'FORBIDDEN', required_role: 'REVIEWER' },
    { status: 403 }
  );
}
```

### 1.2 Validação por Ação
**Tempo:** 20min  
**Arquivo:** `src/app/api/xase/v1/records/[id]/intervene/route.ts`

```typescript
const InterventionSchema = z.object({
  action: z.enum(['REVIEW_REQUESTED', 'APPROVED', 'REJECTED', 'OVERRIDE', 'ESCALATED']),
  // ... campos base
}).superRefine((data, ctx) => {
  // OVERRIDE exige newOutcome
  if (data.action === 'OVERRIDE' && !data.newOutcome) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'newOutcome is required for OVERRIDE action',
      path: ['newOutcome'],
    });
  }
  
  // REJECTED/OVERRIDE exigem reason
  if (['REJECTED', 'OVERRIDE'].includes(data.action) && !data.reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'reason is required for REJECTED/OVERRIDE actions',
      path: ['reason'],
    });
  }
});
```

### 1.3 Idempotência
**Tempo:** 40min  
**Arquivos:** `src/lib/xase/idempotency.ts`, `route.ts`

```typescript
// Usar hash de (transactionId + action + actorEmail + reason)
const idempotencyKey = request.headers.get('Idempotency-Key');
if (idempotencyKey) {
  const existing = checkIdempotency(auth.tenantId!, idempotencyKey);
  if (existing.exists) {
    return NextResponse.json(existing.response, {
      status: 201,
      headers: { 'X-Idempotency-Replay': 'true' },
    });
  }
}
```

### 1.4 Tratamento de Erros DB
**Tempo:** 15min  
**Arquivo:** `src/lib/xase/auth.ts`

```typescript
// Retornar 503 em vez de 401 quando DB está indisponível
catch (error) {
  if (error.message?.includes("Can't reach database")) {
    return { valid: false, error: 'DB_UNAVAILABLE' };
  }
  // ...
}

// Na rota
if (auth.error === 'DB_UNAVAILABLE') {
  return NextResponse.json(
    { error: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' },
    { status: 503 }
  );
}
```

---

## 🎨 FASE 2: Interface de Usuário (ALTA PRIORIDADE)

### 2.1 Componente InterventionDialog
**Tempo:** 1h30min  
**Arquivo:** `src/components/xase/InterventionDialog.tsx`

**Features:**
- Modal com formulário de intervenção
- Seletor de ação (APPROVED, REJECTED, OVERRIDE, ESCALATED)
- Campo de justificativa (obrigatório para REJECT/OVERRIDE)
- Editor JSON para newOutcome (se OVERRIDE)
- Loading states e feedback visual
- Validação client-side

### 2.2 Atualizar RecordDetails
**Tempo:** 1h  
**Arquivo:** `src/components/xase/RecordDetails.tsx`

**Adicionar:**
- Badge `finalDecisionSource` no header
- Seção "Human Interventions" com tabela
- Botão "Add Intervention" que abre o dialog
- Timeline de intervenções (ícones por ação)

### 2.3 Criar API Server-Side
**Tempo:** 30min  
**Arquivos:** 
- `src/app/api/records/[id]/intervene/route.ts`
- `src/lib/xase/server-auth.ts`

```typescript
// Autenticação via sessão Next-Auth
export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = await getTenantId();
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { name: true, email: true, xaseRole: true },
  });

  // Chamar createIntervention com dados do usuário
  const result = await createIntervention({
    transactionId: context.params.id,
    tenantId,
    action: body.action,
    actorUserId: session.user.id,
    actorName: user.name,
    actorEmail: user.email,
    actorRole: user.xaseRole,
    // ...
  });
}
```

### 2.4 Dashboard Stats
**Tempo:** 30min  
**Arquivo:** `src/app/xase/page.tsx`

**Adicionar card:**
```typescript
{
  label: 'INTERVENTIONS',
  value: totalInterventions.toString(),
  change: `${overrideRate.toFixed(1)}% override rate`,
}
```

---

## 📦 FASE 3: Export e Evidências (MÉDIA PRIORIDADE)

### 3.1 Incluir Intervenções no Bundle
**Tempo:** 45min  
**Arquivo:** `src/lib/xase/evidence-bundle.ts`

```typescript
// Em generateProofBundle()
const interventions = await prisma.humanIntervention.findMany({
  where: { recordId: record.id },
  orderBy: { timestamp: 'asc' },
});

// decision.json
{
  "ai_decision": { ... },
  "human_interventions": interventions.map(i => ({
    "action": i.action,
    "actor": {
      "name": i.actorName,
      "email": i.actorEmail,
      "role": i.actorRole,
    },
    "reason": i.reason,
    "timestamp": i.timestamp,
    "new_outcome": i.newOutcome ? JSON.parse(i.newOutcome) : null,
  })),
  "final_decision_source": record.finalDecisionSource,
}
```

### 3.2 Atualizar report.txt
**Tempo:** 20min  
**Arquivo:** `src/lib/xase/evidence-bundle.ts`

```
## HUMAN INTERVENTIONS

Total interventions: 2

1. APPROVED by João Silva (joao@empresa.com)
   Date: 2025-12-17 10:30:00
   Reason: Decisão validada manualmente conforme política

2. OVERRIDE by Maria Santos (maria@empresa.com)
   Date: 2025-12-17 14:45:00
   Reason: Cliente possui garantia adicional
   Previous outcome: {"decision": "REJECTED"}
   New outcome: {"decision": "APPROVED", "rate": 3.5}
```

---

## 🧪 FASE 4: Testes e Qualidade (MÉDIA PRIORIDADE)

### 4.1 Testes de Integração
**Tempo:** 2h  
**Arquivo:** `__tests__/xase/hitl.test.ts`

```typescript
describe('HITL API', () => {
  it('should create APPROVED intervention', async () => {
    const res = await fetch(`/api/xase/v1/records/${txnId}/intervene`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'APPROVED',
        actorName: 'Test User',
        actorEmail: 'test@test.com',
        reason: 'Test reason',
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.intervention_id).toBeDefined();
  });

  it('should require newOutcome for OVERRIDE', async () => {
    const res = await fetch(`/api/xase/v1/records/${txnId}/intervene`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'OVERRIDE',
        actorName: 'Test User',
        actorEmail: 'test@test.com',
        reason: 'Override test',
        // newOutcome ausente
      }),
    });
    expect(res.status).toBe(400);
  });

  it('should enforce idempotency', async () => {
    const key = 'test-idem-key-1';
    const payload = { action: 'APPROVED', actorName: 'Test', actorEmail: 'test@test.com', reason: 'Test' };
    
    const res1 = await fetch(`/api/xase/v1/records/${txnId}/intervene`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Idempotency-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data1 = await res1.json();
    
    const res2 = await fetch(`/api/xase/v1/records/${txnId}/intervene`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Idempotency-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data2 = await res2.json();
    
    expect(res2.headers.get('X-Idempotency-Replay')).toBe('true');
    expect(data1.intervention_id).toBe(data2.intervention_id);
  });
});
```

### 4.2 Testes de UI (Playwright)
**Tempo:** 1h30min  
**Arquivo:** `e2e/hitl.spec.ts`

```typescript
test('should add intervention via UI', async ({ page }) => {
  await page.goto('/xase/records/txn_...');
  await page.click('button:has-text("Add Intervention")');
  await page.selectOption('select[name="action"]', 'APPROVED');
  await page.fill('textarea[name="reason"]', 'Test reason');
  await page.click('button:has-text("Submit")');
  await expect(page.locator('text=Intervention added successfully')).toBeVisible();
});
```

---

## 📚 FASE 5: Documentação (BAIXA PRIORIDADE)

### 5.1 Guia de API
**Tempo:** 1h  
**Arquivo:** `docs/HITL_API_GUIDE.md`

- Endpoints completos
- Exemplos curl para cada ação
- Códigos de erro
- Best practices

### 5.2 Guia de UI
**Tempo:** 30min  
**Arquivo:** `docs/HITL_UI_GUIDE.md`

- Screenshots
- Fluxo de uso
- Permissões necessárias

### 5.3 Atualizar README
**Tempo:** 15min  
**Arquivo:** `XASE_README.md`

- Adicionar HITL nas features
- Link para guias

---

## 🎯 FASE 6: Melhorias Avançadas (OPCIONAL)

### 6.1 Webhooks
**Tempo:** 1h  
**Arquivo:** `src/lib/xase/webhooks.ts`

```typescript
// Emitir evento intervention.created
await emitWebhook(tenantId, {
  event: 'intervention.created',
  data: {
    intervention_id: intervention.id,
    transaction_id: transactionId,
    action: intervention.action,
    actor: { name, email },
    timestamp: intervention.timestamp,
  },
});
```

### 6.2 Rate Limit Específico
**Tempo:** 30min  
**Arquivo:** `src/lib/xase/auth.ts`

```typescript
// Bucket separado para intervene
const interventionLimit = await checkInterventionRateLimit(auth.apiKeyId!);
if (!interventionLimit.allowed) {
  return NextResponse.json(
    { error: 'Intervention rate limit exceeded', retry_after: 3600 },
    { status: 429 }
  );
}
```

### 6.3 Filtros e Paginação no GET
**Tempo:** 45min  
**Arquivo:** `src/app/api/xase/v1/records/[id]/intervene/route.ts`

```typescript
// Query params: action, actorEmail, from, to, page, limit
const { searchParams } = new URL(request.url);
const action = searchParams.get('action');
const actorEmail = searchParams.get('actorEmail');
const from = searchParams.get('from');
const to = searchParams.get('to');
const page = parseInt(searchParams.get('page') || '1');
const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

const where = {
  recordId: record.id,
  ...(action && { action }),
  ...(actorEmail && { actorEmail }),
  ...(from && to && {
    timestamp: {
      gte: new Date(from),
      lte: new Date(to),
    },
  }),
};

const [interventions, total] = await Promise.all([
  prisma.humanIntervention.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  }),
  prisma.humanIntervention.count({ where }),
]);
```

### 6.4 Privacidade/GDPR
**Tempo:** 1h  
**Arquivos:** `src/lib/xase/privacy.ts`, migration

```typescript
// Função para anonimizar ator após N dias
export async function anonymizeOldInterventions(tenantId: string, daysOld: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  
  await prisma.humanIntervention.updateMany({
    where: {
      tenantId,
      timestamp: { lt: cutoff },
      actorEmail: { not: null },
    },
    data: {
      actorName: '[REDACTED]',
      actorEmail: '[REDACTED]',
      ipAddress: null,
      userAgent: null,
    },
  });
}
```

---

## 📋 Ordem de Execução Recomendada

### Sprint 1 (4h) - Segurança e Robustez
1. ✅ RBAC (30min)
2. ✅ Validação por ação (20min)
3. ✅ Idempotência (40min)
4. ✅ Tratamento de erros DB (15min)
5. ✅ Testes manuais das APIs (30min)
6. ✅ Documentação básica de API (30min)

### Sprint 2 (3h30min) - Interface de Usuário
1. ✅ InterventionDialog component (1h30min)
2. ✅ Atualizar RecordDetails (1h)
3. ✅ API server-side (30min)
4. ✅ Dashboard stats (30min)

### Sprint 3 (2h) - Export e Evidências
1. ✅ Incluir intervenções no bundle (45min)
2. ✅ Atualizar report.txt (20min)
3. ✅ Testes de export (30min)
4. ✅ Documentação de export (25min)

### Sprint 4 (3h30min) - Testes
1. ✅ Testes de integração API (2h)
2. ✅ Testes de UI (1h30min)

### Sprint 5 (2h) - Documentação
1. ✅ Guia de API (1h)
2. ✅ Guia de UI (30min)
3. ✅ Atualizar README (15min)
4. ✅ Review final (15min)

### Sprint 6 (Opcional - 3h15min) - Melhorias
1. Webhooks (1h)
2. Rate limit específico (30min)
3. Filtros e paginação (45min)
4. Privacidade/GDPR (1h)

---

## 🎯 Resultado Final

Ao completar todas as fases, você terá:

✅ **Sistema HITL completo e production-ready**
- APIs seguras com RBAC e idempotência
- UI intuitiva para capturar intervenções
- Export forense incluindo intervenções
- Testes automatizados (API + UI)
- Documentação completa
- Conformidade legal (LGPD, GDPR, EU AI Act)

✅ **Garantias legais**
- Prova imutável de supervisão humana
- Rastreabilidade completa (quem, quando, por quê)
- Assinatura criptográfica cobrindo IA + humano
- Exportável para auditoria externa

✅ **Métricas e observabilidade**
- Taxa de override
- Atores mais ativos
- Tempo médio de revisão
- Distribuição por tipo de ação

---

## 📊 Tempo Total Estimado

- **Mínimo viável (Sprints 1-3):** 9h30min
- **Completo com testes (Sprints 1-4):** 13h
- **Production-ready (Sprints 1-5):** 15h
- **Com melhorias avançadas (Sprints 1-6):** 18h15min

---

**Última atualização:** 17 de dezembro de 2025 - 10:54
**Status:** Backend 100% | Frontend 0% | Testes 0% | Docs 40%
