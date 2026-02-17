# XASE Real Flow Test Results

**Data:** 2026-02-17T15:39:31.329Z

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de Testes | 38 |
| ✅ Passou | 38 (100.0%) |
| ❌ Falhou | 0 |
| ⏱️ Tempo Médio | 218ms |

## Resultados por Flow

### Flow 1
**Cobertura:** 4/4 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 1.1 - Criar tenant | ✅ PASS | 786ms |
| 1.2 - Criar usuário | ✅ PASS | 238ms |
| 1.3 - Verificar usuário criado | ✅ PASS | 159ms |
| 1.4 - Criar token de reset de senha | ✅ PASS | 343ms |

### Flow 2
**Cobertura:** 5/5 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 2.1 - Criar dataset | ✅ PASS | 170ms |
| 2.2 - Listar datasets do tenant | ✅ PASS | 161ms |
| 2.3 - Atualizar status para ACTIVE | ✅ PASS | 339ms |
| 2.4 - Publicar dataset | ✅ PASS | 248ms |
| 2.5 - Verificar metadata do dataset | ✅ PASS | 80ms |

### Flow 3
**Cobertura:** 4/4 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 3.1 - Criar voice access policy | ✅ PASS | 245ms |
| 3.2 - Criar access offer | ✅ PASS | 173ms |
| 3.3 - Listar offers ativas | ✅ PASS | 168ms |
| 3.4 - Verificar offer no marketplace | ✅ PASS | 334ms |

### Flow 4
**Cobertura:** 4/4 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 4.1 - Executar offer e criar lease | ✅ PASS | 173ms |
| 4.2 - Buscar detalhes do lease | ✅ PASS | 247ms |
| 4.3 - Estender lease | ✅ PASS | 252ms |
| 4.4 - Registrar access log | ✅ PASS | 182ms |

### Flow 5
**Cobertura:** 3/3 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 5.1 - Criar sessão de sidecar | ✅ PASS | 170ms |
| 5.2 - Verificar sessões ativas | ✅ PASS | 169ms |
| 5.3 - Atualizar status da sessão | ✅ PASS | 371ms |

### Flow 6
**Cobertura:** 3/3 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 6.1 - Criar audit log | ✅ PASS | 185ms |
| 6.2 - Consultar audit trail | ✅ PASS | 160ms |
| 6.3 - Verificar metadata do audit log | ✅ PASS | 163ms |

### Flow 7
**Cobertura:** 2/2 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 7.1 - Verificar consent status do dataset | ✅ PASS | 90ms |
| 7.2 - Atualizar consent status | ✅ PASS | 261ms |

### Flow 8
**Cobertura:** 3/3 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 8.1 - Verificar dados do usuário (DSAR simulation) | ✅ PASS | 237ms |
| 8.2 - Listar todos os dados do tenant | ✅ PASS | 459ms |
| 8.3 - Criar audit log para compliance | ✅ PASS | 82ms |

### Flow 9
**Cobertura:** 4/4 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 9.1 - Criar API key | ✅ PASS | 183ms |
| 9.2 - Listar API keys do tenant | ✅ PASS | 181ms |
| 9.3 - Desativar API key | ✅ PASS | 362ms |
| 9.4 - Verificar isolamento entre tenants | ✅ PASS | 129ms |

### Flow 10
**Cobertura:** 3/3 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 10.1 - Criar transação no ledger | ✅ PASS | 174ms |
| 10.2 - Calcular saldo do ledger | ✅ PASS | 166ms |
| 10.3 - Verificar tenant premium status | ✅ PASS | 200ms |

### Flow 12
**Cobertura:** 3/3 (100.0%)

| Teste | Status | Duração |
|-------|--------|----------|
| 12.1 - Criar dataset de voz | ✅ PASS | 90ms |
| 12.2 - Criar policy de voz | ✅ PASS | 85ms |
| 12.3 - Registrar access log de voz | ✅ PASS | 81ms |

