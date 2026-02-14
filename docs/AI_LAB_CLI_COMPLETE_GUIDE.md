# AI Lab CLI - Guia Completo de Uso

## ✅ Status: 100% Funcional

Todos os comandos do CLI estão funcionando perfeitamente com autenticação Bearer (email OTP).

---

## 📋 Pré-requisitos

1. **Python 3.7+** com virtualenv
2. **Servidor Next.js rodando** em http://localhost:3000
3. **Email configurado** para receber códigos OTP

---

## 🚀 Instalação

```bash
cd packages/xase-cli
python3 -m venv .venv
source .venv/bin/activate  # No Windows: .venv\Scripts\activate
pip install -e .
```

---

## 🔐 Autenticação

### Login via Email OTP (Recomendado)

```bash
xase-cli login --email seu@email.com
```

**Fluxo:**
1. CLI solicita código OTP
2. Código é enviado para seu email
3. Insira o código quando solicitado
4. Token Bearer é salvo em `~/.xase/config.json` (válido por 15 minutos)
5. Todas as requisições usam automaticamente o Bearer token

**Exemplo de saída:**
```
Requesting login code for seu@email.com...
A login code was sent to your email. It expires in 10 minutes.
Enter the code: 394525
✓ Logged in. Tokens saved to ~/.xase/config.json
Fetching usage statistics...
{
  "ok": true,
  "tenantId": "cml9sepwg000yjj6p4b1hqig9",
  "summary": {
    "offers": 1,
    "activeLeases": 2,
    "timestamp": "2026-02-12T22:28:57.263Z"
  },
  "debug": {
    "authMode": "bearer"
  }
}
```

### Logout

```bash
xase-cli logout
```

Remove tokens salvos e exibe dicas para novo login.

---

## 📊 Comandos Disponíveis

### 1. Verificar Uso

```bash
xase-cli usage
```

Retorna estatísticas de uso do tenant autenticado.

---

### 2. Listar Ofertas Disponíveis

```bash
xase-cli list-offers [--risk MEDIUM] [--language en-US] [--limit 20]
```

**Exemplo:**
```bash
xase-cli list-offers --risk MEDIUM --language en-US --limit 10
```

**Saída:**
```
Fetching offers from http://localhost:3000...
Found 0 offer(s):
```

---

### 3. Listar Leases Ativos

```bash
xase-cli list-leases [--limit 10]
```

**Exemplo:**
```bash
xase-cli list-leases --limit 50
```

**Saída:**
```
Fetching active leases...

Found 5 active lease(s):

Lease ID: lease_6b6888cbce9e324a4c78a1f6
  Dataset: ds_cc7aec46912dd8db99eb54d9
  Status: ACTIVE
  Issued: 2026-02-12T22:30:24.886Z
  Expires: 2026-02-12T23:00:24.885Z

Lease ID: lease_044524372f4b3487e5af140e
  Dataset: ds_cc7aec46912dd8db99eb54d9
  Status: ACTIVE
  Issued: 2026-02-12T22:20:03.129Z
  Expires: 2026-02-12T22:50:03.126Z
```

---

### 4. Criar Novo Lease (Mint)

```bash
xase-cli mint-lease <dataset_id> [--ttl-seconds 1800]
```

**Exemplo:**
```bash
xase-cli mint-lease ds_cc7aec46912dd8db99eb54d9 --ttl-seconds 1800
```

**Saída:**
```
Minting lease for dataset ds_cc7aec46912dd8db99eb54d9 (ttl=1800s)...
✓ Lease minted
Lease ID: lease_6b65a81a10cb76a13c7c3122
Expires: 2026-02-12T23:12:55.012Z
```

**Pré-requisito:** Você precisa ter uma **Policy ativa** para o dataset no seu tenant.

---

### 5. Detalhes de um Lease

```bash
xase-cli lease-details <lease_id>
```

**Exemplo:**
```bash
xase-cli lease-details lease_6b65a81a10cb76a13c7c3122
```

**Saída:**
```json
{
  "leaseId": "lease_6b65a81a10cb76a13c7c3122",
  "status": "ACTIVE",
  "issuedAt": "2026-02-12T22:42:55.014Z",
  "expiresAt": "2026-02-12T23:12:55.012Z",
  "revokedAt": null,
  "policy": {
    "policyId": "pol_05460a061d914c7f64812c00",
    "status": "ACTIVE",
    "expiresAt": null
  },
  "dataset": {
    "datasetId": "ds_cc7aec46912dd8db99eb54d9",
    "name": "AI-Labs-Gemini-PDFs-Raro"
  }
}
```

---

### 6. Stream de Dados para Treino

```bash
xase-cli stream <dataset_id> --lease-id <lease_id> [--env production] [--estimated-hours 0.5] [--output batch.json]
```

**Exemplo:**
```bash
xase-cli stream ds_cc7aec46912dd8db99eb54d9 \
  --lease-id lease_6b65a81a10cb76a13c7c3122 \
  --env production \
  --estimated-hours 0.1 \
  --output batch_001.json
```

**Saída:**
```
Streaming dataset ds_cc7aec46912dd8db99eb54d9...
✓ Data saved to batch_001.json
Size: 25359 bytes
```

**Formato do arquivo baixado:**
```json
{
  "datasetId": "ds_cc7aec46912dd8db99eb54d9",
  "expiresIn": 900,
  "batch": [
    {
      "key": "datasets/ds_.../file.wav",
      "url": "https://...presigned-url..."
    }
  ],
  "nextCursor": "...",
  "leaseExpiresAt": "2026-02-12T23:12:55.012Z"
}
```

---

## 🎯 Fluxo Completo de Treino

### Passo a Passo

```bash
# 1. Login
xase-cli login --email seu@email.com

# 2. Verificar leases existentes
xase-cli list-leases --limit 10

# 3. Criar novo lease (se necessário)
xase-cli mint-lease ds_cc7aec46912dd8db99eb54d9 --ttl-seconds 1800

# 4. Obter detalhes do lease
xase-cli lease-details lease_XXXXXXXX

# 5. Baixar primeiro batch
xase-cli stream ds_cc7aec46912dd8db99eb54d9 \
  --lease-id lease_XXXXXXXX \
  --env production \
  --estimated-hours 0.5 \
  --output batch_001.json

# 6. Baixar mais batches conforme necessário
xase-cli stream ds_cc7aec46912dd8db99eb54d9 \
  --lease-id lease_XXXXXXXX \
  --env production \
  --estimated-hours 0.5 \
  --output batch_002.json
```

---

## 🔄 Automação de Treino

### Script Bash para Download de Múltiplos Batches

```bash
#!/bin/bash
set -e

DATASET_ID="ds_cc7aec46912dd8db99eb54d9"
LEASE_ID="lease_6b65a81a10cb76a13c7c3122"
NUM_BATCHES=5

for i in $(seq -w 1 $NUM_BATCHES); do
  echo "Downloading batch $i/$NUM_BATCHES..."
  xase-cli stream "$DATASET_ID" \
    --lease-id "$LEASE_ID" \
    --env production \
    --estimated-hours 0.5 \
    --output "batch_${i}.json" || {
    echo "Failed to download batch $i"
    break
  }
  
  # Processar batch (exemplo)
  # python train.py --input "batch_${i}.json"
done

echo "Download complete!"
```

---

## 🐍 Integração Python

### Exemplo de Processamento de Batch

```python
import json
import requests
from pathlib import Path

def process_batch(batch_file: str):
    """Processa um batch baixado pelo CLI"""
    data = json.loads(Path(batch_file).read_text())
    
    print(f"Dataset: {data['datasetId']}")
    print(f"Files in batch: {len(data['batch'])}")
    print(f"Lease expires at: {data['leaseExpiresAt']}")
    
    # Download e processa cada arquivo
    for item in data['batch']:
        key = item['key']
        url = item['url']
        
        # Download do arquivo
        response = requests.get(url)
        if response.status_code == 200:
            # Processar conteúdo
            content = response.content
            print(f"Downloaded {key}: {len(content)} bytes")
            
            # Seu código de treino aqui
            # train_model(content)
        else:
            print(f"Failed to download {key}")

# Uso
process_batch("batch_001.json")
```

---

## 🔧 Troubleshooting

### Erro 401 Unauthorized

**Causa:** Token expirado (15 minutos de validade)

**Solução:**
```bash
xase-cli login --email seu@email.com
```

---

### Erro 403 No active policy

**Causa:** Não existe Policy ativa para o dataset no seu tenant

**Solução:**
- Se você é o **dono do dataset**: crie uma Policy via API ou UI
- Se você é **cliente**: solicite acesso ao dono do dataset

---

### Erro 403 Lease invalid or expired

**Causa:** Lease expirou (TTL padrão: 30 minutos)

**Solução:**
```bash
xase-cli mint-lease ds_XXXXXXXX --ttl-seconds 1800
```

---

### Erro 500 Internal error

**Causa:** Erro no servidor (geralmente schema/configuração)

**Solução:**
- Verifique logs do Next.js
- Confirme que o servidor está rodando
- Reporte o erro com timestamp

---

## 📝 Notas Importantes

### Segurança

- ✅ Tokens são salvos com permissões `chmod 600` em `~/.xase/config.json`
- ✅ Bearer tokens expiram em 15 minutos
- ✅ Nunca compartilhe seu arquivo de configuração
- ✅ Use variáveis de ambiente em produção

### Limites

- **TTL de Lease:** 1 minuto a 1 hora (padrão: 30 min)
- **Token Bearer:** 15 minutos de validade
- **Rate Limit:** Aplicado apenas quando usando API Key (não afeta Bearer)

### Boas Práticas

1. **Sempre faça login** antes de iniciar uma sessão de treino
2. **Verifique leases existentes** antes de criar novos
3. **Use `--estimated-hours`** para metering correto
4. **Especifique `--env`** quando a Policy exigir
5. **Monitore expiração** do lease durante downloads longos

---

## 🎉 Resumo de Funcionalidades

| Comando | Status | Descrição |
|---------|--------|-----------|
| `login` | ✅ | Autenticação via email OTP |
| `logout` | ✅ | Remove tokens salvos |
| `usage` | ✅ | Estatísticas de uso |
| `list-offers` | ✅ | Lista ofertas disponíveis |
| `list-leases` | ✅ | Lista leases ativos |
| `mint-lease` | ✅ | Cria novo lease |
| `lease-details` | ✅ | Detalhes de um lease |
| `stream` | ✅ | Download de dados para treino |
| `validate` | ⚠️ | Validação de policy (em desenvolvimento) |
| `execute` | 🚧 | Executar oferta (planejado) |

---

## 🔗 Links Úteis

- **Repositório:** `/Users/albertalves/xaseai/xase-sheets`
- **CLI Source:** `packages/xase-cli/xase_cli.py`
- **Teste Automatizado:** `./test-cli-flow.sh`
- **Backend API:** `src/app/api/v1/`

---

## ✨ Próximos Passos

1. Implementar comando `execute` para criar Policy + Lease em um passo
2. Adicionar flag `--json` para saída estruturada
3. Implementar comando `policies` para gerenciar policies
4. Adicionar suporte a refresh token automático
5. Criar comando `train` para orquestrar download + treino

---

**Última atualização:** 2026-02-12  
**Versão:** 1.0.0  
**Status:** Produção ✅
