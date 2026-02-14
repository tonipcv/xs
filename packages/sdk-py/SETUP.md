# xase-sdk - Guia de Setup e Instalação

## 📦 Instalação

### Via pip

```bash
pip install xase-sdk
```

### Via poetry

```bash
poetry add xase-sdk
```

### Via pipenv

```bash
pipenv install xase-sdk
```

---

## 🔧 Setup Local (Desenvolvimento)

### 1. Clonar e instalar

```bash
cd packages/sdk-py
pip install -e ".[dev]"
```

**Output esperado:**
```
Successfully installed xase-sdk httpx pytest mypy ruff
```

---

### 2. Testar exemplos

```bash
# Rodar exemplo básico
XASE_API_KEY=xase_pk_demo python examples/basic.py

# Rodar exemplo síncrono
XASE_API_KEY=xase_pk_demo python examples/sync.py
```

---

## 🔑 Obter API Key

### 1. Via Dashboard (Produção)

1. Acesse `http://localhost:3000/xase/api-keys`
2. Clique em "Nova API Key"
3. Escolha permissões: `ingest`, `verify`, `export`
4. Copie a key (será exibida apenas uma vez)

### 2. Via Seed Script (Desenvolvimento)

```bash
# No diretório raiz do projeto
node database/seed-demo-data.js
```

**Output:**
```
✅ Demo API Key: xase_pk_abc123...
```

Copie a key e use nas variáveis de ambiente.

---

## 🌍 Variáveis de Ambiente

### .env (recomendado)

```bash
# .env
XASE_API_KEY=xase_pk_abc123...
XASE_BASE_URL=http://localhost:3000/api/xase/v1
ENV=development
```

### Carregar com python-dotenv

```bash
pip install python-dotenv
```

```python
# app.py
from dotenv import load_dotenv
import os

load_dotenv()

from xase import XaseClient

xase = XaseClient({
    "api_key": os.getenv("XASE_API_KEY"),
    "base_url": os.getenv("XASE_BASE_URL"),
})
```

---

## 🚀 Quick Start

### Python

```python
from xase import XaseClient
import os

xase = XaseClient({
    "api_key": os.getenv("XASE_API_KEY"),
})

def main():
    xase.record({
        "policy": "credit_policy_v4",
        "input": {"user_id": "u_001", "amount": 50000},
        "output": {"decision": "APPROVED"},
        "confidence": 0.94,
    })
    
    xase.flush()
    print("✅ Evidence recorded!")

if __name__ == "__main__":
    main()
```

---

## 🧪 Testar Integração

### 1. Iniciar servidor Xase

```bash
# Terminal 1
npm run dev
```

### 2. Criar API Key

```bash
# Terminal 2
node database/seed-demo-data.js
```

Copie a API key gerada.

### 3. Testar SDK

```bash
# Terminal 2
cd packages/sdk-py

# Criar arquivo de teste
cat > test_integration.py << 'EOF'
from xase import XaseClient
import os

xase = XaseClient({
    "api_key": "COLE_SUA_API_KEY_AQUI",
    "base_url": "http://localhost:3000/api/xase/v1",
    "fire_and_forget": False,  # Modo síncrono para ver resultado
})

def test():
    try:
        result = xase.record({
            "policy": "test_policy_v1",
            "input": {"test": "input"},
            "output": {"test": "output"},
            "confidence": 0.99,
        })
        
        print("✅ Success!")
        print(f"Transaction ID: {result['transaction_id']}")
        print(f"Record Hash: {result['record_hash']}")
        print(f"Receipt URL: {result['receipt_url']}")
    except Exception as error:
        print(f"❌ Error: {error}")

if __name__ == "__main__":
    test()
EOF

# Rodar teste
python test_integration.py
```

**Output esperado:**
```
✅ Success!
Transaction ID: txn_abc123...
Record Hash: a3f9c2...
Receipt URL: http://localhost:3000/xase/receipt/txn_abc123...
```

---

## 📊 Verificar no Dashboard

1. Acesse `http://localhost:3000/xase/records`
2. Você deve ver o record criado
3. Verifique os detalhes: policy, confidence, timestamp

---

## 🐛 Troubleshooting

### "ModuleNotFoundError: No module named 'xase'"

**Causa:** SDK não foi instalado.

**Fix:**
```bash
pip install xase-sdk
# ou para desenvolvimento local
pip install -e .
```

---

### "Missing X-API-Key header"

**Causa:** API key não foi fornecida.

**Fix:**
```python
xase = XaseClient({
    "api_key": os.getenv("XASE_API_KEY"),  # Certifique-se que está definido
})
```

---

### "Invalid API key"

**Causa:** API key inválida ou expirada.

**Fix:**
1. Gere nova key no dashboard
2. Ou rode `node database/seed-demo-data.js`
3. Atualize `.env`

---

### "Connection refused"

**Causa:** Servidor Xase não está rodando.

**Fix:**
```bash
# Terminal 1
npm run dev
```

---

### Build errors

**Causa:** Dependências não instaladas.

**Fix:**
```bash
cd packages/sdk-py
pip install -e ".[dev]"
```

---

## 📝 Próximos Passos

1. ✅ SDK instalado e funcionando
2. ✅ API key configurada
3. ✅ Primeiro record criado

**Agora você pode:**
- Integrar no seu app de produção
- Explorar exemplos em `examples/`
- Ler documentação completa em `DOCUMENTATION.md`
- Customizar configurações

---

## 🔗 Links Úteis

- **README:** Guia de uso completo
- **DOCUMENTATION:** Documentação técnica detalhada
- **Examples:** Exemplos práticos
- **Dashboard:** `http://localhost:3000/xase`

---

## 💡 Dicas

### Desenvolvimento

```python
xase = XaseClient({
    "api_key": os.getenv("XASE_API_KEY"),
    "base_url": "http://localhost:3000/api/xase/v1",
    "fire_and_forget": False,  # Ver erros imediatamente
    "on_error": lambda e: print(f"Error: {e}"),
    "on_success": lambda r: print(f"Success: {r}"),
})
```

### Produção

```python
xase = XaseClient({
    "api_key": os.getenv("XASE_API_KEY"),
    "base_url": "https://api.xase.ai/v1",
    "fire_and_forget": True,  # Zero latency
    "timeout": 5.0,
    "max_retries": 5,
})
```

---

## 🎉 Pronto!

Seu SDK está configurado e pronto para uso.

Para dúvidas, consulte:
- `README.md` - Guia de uso
- `DOCUMENTATION.md` - Documentação técnica
- `examples/` - Exemplos práticos

---

## 🏭 Produção (Guia Rápido)

- **Base URL**: `https://api.xase.ai/v1`.
- **Autenticação**: header `X-API-Key` (não exponha em cliente/browser).
- **Modo**: `fire_and_forget=True` para zero latência em hot-paths.
- **Timeout**: 5.0s. **Retries**: 3–5 com backoff exponencial.
- **Idempotência**: envie `transaction_id` sempre que possível.

```python
from xase import XaseClient
import os

xase = XaseClient({
    "api_key": os.getenv("XASE_API_KEY"),
    "base_url": "https://api.xase.ai/v1",
    "fire_and_forget": True,
    "timeout": 5.0,
    "max_retries": 5,
})
```

### Variáveis em Produção

```bash
XASE_API_KEY= xase_pk_prod_...
XASE_BASE_URL= https://api.xase.ai/v1
ENV= production
XASE_QUEUE_MAX_SIZE= 50000   # opcional
XASE_MAX_RETRIES= 5          # opcional
XASE_TIMEOUT_S= 5.0          # opcional
```

### Segurança

- Armazene secrets em vault (AWS/GCP/Azure Secret Manager, Doppler, 1Password).
- **HTTPS** obrigatório. Faça redaction de PII quando necessário.
- `store_payload=False` por padrão; habilite somente em fluxos auditáveis.
- Rotacione API keys periodicamente (90 dias) e com escopo mínimo.

### Observabilidade

- Use callbacks `on_success`/`on_error` para métricas/logs.
- Contadores recomendados: `xase.records.success`, `xase.records.error`, `xase.queue.size`.
- Logue `error.code`, `status_code`, `retry_count` ao tratar exceções.

```python
def on_success(r):
    metrics.increment("xase.records.success")

def on_error(e):
    metrics.increment("xase.records.error")
    logger.error({"code": e.code, "status": e.status_code}, "xase error")

xase = XaseClient({
    "api_key": os.getenv("XASE_API_KEY"),
    "base_url": "https://api.xase.ai/v1",
    "fire_and_forget": True,
    "on_success": on_success,
    "on_error": on_error,
})
```

### Boas Práticas de Deploy

- Em shutdown gracioso, chame `xase.flush(2.0)` antes de encerrar.
- Em serverless (AWS Lambda, Cloud Run): use síncrono no fim da execução ou `flush()` antes do retorno.
- Ajuste `queue_max_size` conforme throughput; implemente backpressure quando necessário.

### SLOs sugeridos

- 99.9% de sucesso na ingestão (com retries).
- <200ms P95 para chamadas síncronas (dependente de rede).
- 0 perdas no shutdown com `flush` > 2s e fila < 10k.

---

## 📘 Manual Operacional

- **Rotina diária**
  - **[monitorar]** sucesso/erro de records e tamanho da fila.
  - **[auditar]** recibos no dashboard (`/xase/records`).
  - **[rotacionar]** API keys e revisar permissões.

- **Incidentes comuns**
  - **RATE_LIMIT_EXCEEDED (429)**: reduzir taxa, aumentar retries, aplicar backpressure.
  - **MAX_RETRIES**: checar conectividade e status do serviço Xase.
  - **QUEUE_FULL**: aumentar `queue_max_size`, reduzir taxa, considerar batch.

- **Playbooks**
  - **Queda de upstream**: trocar para modo síncrono com retries agressivos em caminhos críticos; registrar fallback em disco/filas internas.
  - **Latência alta**: manter fire-and-forget; evitar síncrono no hot-path.
  - **Compliance**: habilitar `store_payload=True` apenas quando necessário e mascarar PII.

### Exemplos de Integração (Produção)

FastAPI:

```python
from fastapi import FastAPI, Request
from xase import XaseClient

app = FastAPI()
xase = XaseClient({"api_key": os.getenv("XASE_API_KEY"), "base_url": "https://api.xase.ai/v1", "fire_and_forget": True})

@app.post("/checkout")
async def checkout(req: Request):
    body = await req.json()
    # ... lógica de decisão
    xase.record({
        "policy": "checkout_risk_v3",
        "input": {"userId": body["userId"], "cart": body["cart"]},
        "output": {"decision": "APPROVED"},
        "confidence": 0.92,
        "transaction_id": body["orderId"],
    })
    return {"ok": True}
```

Django (service/camada de domínio): invoque `xase.record()` no service; chame `xase.flush()` em sinais de shutdown quando aplicável.

---
