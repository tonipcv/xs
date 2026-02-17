# XASE Integration Test Results

**Data:** 2026-02-17T14:55:00.077Z

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de Testes | 31 |
| ✅ Passou | 0 (0.0%) |
| ❌ Falhou | 31 |
| ⏱️ Tempo Médio | 105ms |

## Resultados por Flow

### Flow 1
**Cobertura:** 0/4 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Criar tenant | ❌ FAIL | 428ms |
| Criar usuário | ❌ FAIL | 286ms |
| Verificar usuário criado | ❌ FAIL | 160ms |
| Criar token de reset de senha | ❌ FAIL | 170ms |

### Flow 2
**Cobertura:** 0/5 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Criar dataset | ❌ FAIL | 3ms |
| Listar datasets do tenant | ❌ FAIL | 104ms |
| Atualizar status para PROCESSING | ❌ FAIL | 11ms |
| Publicar dataset | ❌ FAIL | 19ms |
| Verificar metadata do dataset | ❌ FAIL | 97ms |

### Flow 3
**Cobertura:** 0/3 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Criar access offer | ❌ FAIL | 5ms |
| Listar offers ativas | ❌ FAIL | 159ms |
| Verificar offer no marketplace | ❌ FAIL | 225ms |

### Flow 4
**Cobertura:** 0/3 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Executar offer e criar lease | ❌ FAIL | 0ms |
| Buscar detalhes do lease | ❌ FAIL | 0ms |
| Estender lease | ❌ FAIL | 0ms |

### Flow 5
**Cobertura:** 0/2 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Criar sessão de sidecar | ❌ FAIL | 2ms |
| Verificar sessões ativas | ❌ FAIL | 167ms |

### Flow 6
**Cobertura:** 0/3 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Criar audit log | ❌ FAIL | 83ms |
| Consultar audit trail | ❌ FAIL | 82ms |
| Verificar metadata do audit log | ❌ FAIL | 78ms |

### Flow 7
**Cobertura:** 0/1 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Verificar consentimento não existe | ❌ FAIL | 0ms |

### Flow 8
**Cobertura:** 0/2 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Verificar dados do usuário (DSAR simulation) | ❌ FAIL | 2ms |
| Listar todos os dados do tenant | ❌ FAIL | 107ms |

### Flow 9
**Cobertura:** 0/4 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Criar API key | ❌ FAIL | 178ms |
| Listar API keys do tenant | ❌ FAIL | 165ms |
| Desativar API key | ❌ FAIL | 181ms |
| Verificar isolamento entre tenants | ❌ FAIL | 97ms |

### Flow 10
**Cobertura:** 0/2 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Verificar tenant existe para billing | ❌ FAIL | 171ms |
| Simular uso de créditos | ❌ FAIL | 91ms |

### Flow 12
**Cobertura:** 0/2 (0.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| Criar dataset de voz | ❌ FAIL | 1ms |
| Verificar dataset de voz | ❌ FAIL | 176ms |

## Testes que Falharam

### Flow 1 - Criar tenant
**Erro:** 
Invalid `prisma.tenant.create()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:71:40

  68 console.log('-'.repeat(80));
  69 
  70 await runTest('Flow 1', 'Criar tenant', async () => {
→ 71   const tenant = await prisma.tenant.create({
         data: {
           name: "Test Tenant",
           organizationType: "AI_LAB",
       +   email: String
         }
       })

Argument `email` is missing.

### Flow 1 - Criar usuário
**Erro:** 
Invalid `prisma.user.create()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:83:36

  80 
  81 await runTest('Flow 1', 'Criar usuário', async () => {
  82   const hashedPassword = await bcrypt.hash(ctx.password, 10);
→ 83   const user = await prisma.user.create(
Foreign key constraint violated: `users_tenant_fkey (index)`

### Flow 1 - Verificar usuário criado
**Erro:** Usuário não encontrado

### Flow 1 - Criar token de reset de senha
**Erro:** 
Invalid `prisma.user.update()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:106:23

  103 
  104 await runTest('Flow 1', 'Criar token de reset de senha', async () => {
  105   const resetToken = `reset_${Date.now()}`;
→ 106   await prisma.user.update(
An operation failed because it depends on one or more records that were required but not found. Record to update not found.

### Flow 2 - Criar dataset
**Erro:** 
Invalid `prisma.dataset.create()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:120:42

  117 console.log('-'.repeat(80));
  118 
  119 await runTest('Flow 2', 'Criar dataset', async () => {
→ 120   const dataset = await prisma.dataset.create({
          data: {
            name: "Test Dataset",
            description: "Integration test dataset",
            tenantId: "",
            status: "DRAFT",
        +   datasetId: String
          }
        })

Argument `datasetId` is missing.

### Flow 2 - Listar datasets do tenant
**Erro:** 
Invalid `prisma.dataset.findMany()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:133:43

  130 });
  131 
  132 await runTest('Flow 2', 'Listar datasets do tenant', async () => {
→ 133   const datasets = await prisma.dataset.findMany(
The column `xase_voice_datasets.cloud_integration_id` does not exist in the current database.

### Flow 2 - Atualizar status para PROCESSING
**Erro:** 
Invalid `prisma.dataset.update()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:140:26

  137 });
  138 
  139 await runTest('Flow 2', 'Atualizar status para PROCESSING', async () => {
→ 140   await prisma.dataset.update({
          where: {
            id: ""
          },
          data: {
            status: "PROCESSING"
                    ~~~~~~~~~~~~
          }
        })

Invalid value for argument `status`. Expected DatasetStatus.

### Flow 2 - Publicar dataset
**Erro:** 
Invalid `prisma.dataset.update()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:149:26

  146 });
  147 
  148 await runTest('Flow 2', 'Publicar dataset', async () => {
→ 149   await prisma.dataset.update({
          where: {
            id: ""
          },
          data: {
            status: "PUBLISHED",
                    ~~~~~~~~~~~
            publishedAt: new Date("2026-02-17T14:54:57.987Z")
          }
        })

Invalid value for argument `status`. Expected DatasetStatus.

### Flow 2 - Verificar metadata do dataset
**Erro:** 
Invalid `prisma.dataset.findUnique()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:162:42

  159 });
  160 
  161 await runTest('Flow 2', 'Verificar metadata do dataset', async () => {
→ 162   const dataset = await prisma.dataset.findUnique(
The column `xase_voice_datasets.cloud_integration_id` does not exist in the current database.

### Flow 3 - Criar access offer
**Erro:** 
Invalid `prisma.accessOffer.create()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:175:44

  172 console.log('-'.repeat(80));
  173 
  174 await runTest('Flow 3', 'Criar access offer', async () => {
→ 175   const offer = await prisma.accessOffer.create({
          data: {
            datasetId: "",
            tenantId: "",
            name: "Test Offer",
            description: "Integration test offer",
            price: 100,
            currency: "USD",
            duration: 86400,
            status: "ACTIVE",
        +   offerId: String
          }
        })

Argument `offerId` is missing.

### Flow 3 - Listar offers ativas
**Erro:** Nenhuma offer encontrada

### Flow 3 - Verificar offer no marketplace
**Erro:** Offer não encontrada

### Flow 4 - Executar offer e criar lease
**Erro:** Cannot read properties of undefined (reading 'create')

### Flow 4 - Buscar detalhes do lease
**Erro:** Cannot read properties of undefined (reading 'findUnique')

### Flow 4 - Estender lease
**Erro:** Cannot read properties of undefined (reading 'update')

### Flow 5 - Criar sessão de sidecar
**Erro:** 
Invalid `prisma.sidecarSession.create()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:257:49

  254 console.log('-'.repeat(80));
  255 
  256 await runTest('Flow 5', 'Criar sessão de sidecar', async () => {
→ 257   const session = await prisma.sidecarSession.create({
          data: {
            leaseId: "",
            status: "ACTIVE",
            expiresAt: new Date("2026-02-17T15:54:58.494Z"),
        +   clientTenantId: String
          }
        })

Argument `clientTenantId` is missing.

### Flow 5 - Verificar sessões ativas
**Erro:** Nenhuma sessão ativa

### Flow 6 - Criar audit log
**Erro:** 
Invalid `prisma.auditLog.create()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:280:41

  277 console.log('-'.repeat(80));
  278 
  279 await runTest('Flow 6', 'Criar audit log', async () => {
→ 280   const audit = await prisma.auditLog.create(
The column `xase_audit_logs.error_message` does not exist in the current database.

### Flow 6 - Consultar audit trail
**Erro:** 
Invalid `prisma.auditLog.findMany()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:293:40

  290 });
  291 
  292 await runTest('Flow 6', 'Consultar audit trail', async () => {
→ 293   const logs = await prisma.auditLog.findMany(
The column `xase_audit_logs.error_message` does not exist in the current database.

### Flow 6 - Verificar metadata do audit log
**Erro:** 
Invalid `prisma.auditLog.findFirst()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:302:39

  299 });
  300 
  301 await runTest('Flow 6', 'Verificar metadata do audit log', async () => {
→ 302   const log = await prisma.auditLog.findFirst(
The column `xase_audit_logs.error_message` does not exist in the current database.

### Flow 7 - Verificar consentimento não existe
**Erro:** Cannot read properties of undefined (reading 'count')

### Flow 8 - Verificar dados do usuário (DSAR simulation)
**Erro:** 
Invalid `prisma.user.findUnique()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:331:36

  328 console.log('-'.repeat(80));
  329 
  330 await runTest('Flow 8', 'Verificar dados do usuário (DSAR simulation)', async () => {
→ 331   const user = await prisma.user.findUnique({
          where: {
            id: ""
          },
          include: {
            datasets: true,
            ~~~~~~~~
        ?   accounts?: true,
        ?   sessions?: true,
        ?   tenant?: true
          }
        })

Unknown field `datasets` for include statement on model `User`. Available options are marked with ?.

### Flow 8 - Listar todos os dados do tenant
**Erro:** 
Invalid `prisma.dataset.findMany()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:341:43

  338 });
  339 
  340 await runTest('Flow 8', 'Listar todos os dados do tenant', async () => {
→ 341   const datasets = await prisma.dataset.findMany(
The column `xase_voice_datasets.cloud_integration_id` does not exist in the current database.

### Flow 9 - Criar API key
**Erro:** 
Invalid `prisma.apiKey.create()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:360:40

  357 console.log('-'.repeat(80));
  358 
  359 await runTest('Flow 9', 'Criar API key', async () => {
→ 360   const apiKey = await prisma.apiKey.create(
Foreign key constraint violated: `xase_api_keys_tenant_id_fkey (index)`

### Flow 9 - Listar API keys do tenant
**Erro:** Nenhuma API key encontrada

### Flow 9 - Desativar API key
**Erro:** 
Invalid `prisma.apiKey.update()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:381:25

  378 });
  379 
  380 await runTest('Flow 9', 'Desativar API key', async () => {
→ 381   await prisma.apiKey.update(
An operation failed because it depends on one or more records that were required but not found. Record to update not found.

### Flow 9 - Verificar isolamento entre tenants
**Erro:** 
Invalid `prisma.dataset.findMany()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:390:41

  387 });
  388 
  389 await runTest('Flow 9', 'Verificar isolamento entre tenants', async () => {
→ 390   const myData = await prisma.dataset.findMany(
The column `xase_voice_datasets.cloud_integration_id` does not exist in the current database.

### Flow 10 - Verificar tenant existe para billing
**Erro:** Tenant não encontrado

### Flow 10 - Simular uso de créditos
**Erro:** Tenant não existe

### Flow 12 - Criar dataset de voz
**Erro:** 
Invalid `prisma.dataset.create()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:422:47

  419 console.log('-'.repeat(80));
  420 
  421 await runTest('Flow 12', 'Criar dataset de voz', async () => {
→ 422   const voiceDataset = await prisma.dataset.create({
          data: {
            name: "Voice Test Dataset",
            description: "Voice integration test",
            tenantId: "",
            status: "DRAFT",
        +   datasetId: String
          }
        })

Argument `datasetId` is missing.

### Flow 12 - Verificar dataset de voz
**Erro:** 
Invalid `prisma.dataset.findMany()` invocation in
/Users/albertalves/xaseai/xase-sheets/scripts/run-integration-tests.ts:434:43

  431 });
  432 
  433 await runTest('Flow 12', 'Verificar dataset de voz', async () => {
→ 434   const datasets = await prisma.dataset.findMany(
The column `xase_voice_datasets.cloud_integration_id` does not exist in the current database.

