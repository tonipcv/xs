# 🔌 API Externa - Integração com Outros Sistemas

Esta API permite que outros sistemas Next.js ou qualquer aplicação enviem mensagens WhatsApp através do ZAP Membership sem precisar gerenciar a Evolution API diretamente.

## 🔐 Autenticação

Todas as requisições devem incluir o header de autenticação:

```
x-api-key: sua-chave-api-aqui
```

**Configure a variável de ambiente:**
```env
EXTERNAL_API_KEY=sua-chave-super-segura-aqui-123456
```

## 📡 Endpoints Disponíveis

### 1. Verificar Status da API

```http
GET /api/external/send-message
```

**Resposta:**
```json
{
  "service": "ZAP Membership External API",
  "status": "active",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "endpoints": {
    "sendMessage": "POST /api/external/send-message"
  },
  "authentication": "Required: x-api-key header"
}
```

### 2. Listar Instâncias Disponíveis

```http
GET /api/external/instances
x-api-key: sua-chave-api-aqui
```

**Resposta:**
```json
{
  "success": true,
  "count": 2,
  "instances": [
    {
      "id": "cm123abc456",
      "instanceName": "minha-instancia-1",
      "status": "CONNECTED",
      "connectedNumber": "5511999*****",
      "lastConnectedAt": "2024-01-15T10:25:00.000Z",
      "createdAt": "2024-01-15T09:00:00.000Z",
      "isAvailable": true
    },
    {
      "id": "cm789def012",
      "instanceName": "minha-instancia-2", 
      "status": "CONNECTED",
      "connectedNumber": "5511888*****",
      "lastConnectedAt": "2024-01-15T10:20:00.000Z",
      "createdAt": "2024-01-15T08:30:00.000Z",
      "isAvailable": true
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 3. Enviar Mensagem WhatsApp

```http
POST /api/external/send-message
Content-Type: application/json
x-api-key: sua-chave-api-aqui
```

**Body da Requisição:**
```json
{
  "instanceId": "sua-instancia-id",
  "number": "5511999887766",
  "message": "Olá! Esta é uma mensagem enviada via API externa.",
  "userId": "sistema-externo" // Opcional
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "messageId": "3EB0C767D26A1D8E6E73",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "instanceId": "sua-instancia-id",
  "status": "sent",
  "data": {
    "remoteJid": "5511999887766@s.whatsapp.net",
    "fromMe": true
  }
}
```

**Resposta de Erro (400/401/500):**
```json
{
  "success": false,
  "error": "Descrição do erro",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🔧 Códigos de Erro

| Código | Descrição |
|--------|-----------|
| 401 | API Key inválida ou ausente |
| 400 | Dados da requisição inválidos |
| 500 | Erro interno (instância desconectada, etc.) |

## 📋 Validações

### Campos Obrigatórios
- `instanceId`: ID da instância WhatsApp configurada
- `number`: Número do destinatário (apenas números)
- `message`: Texto da mensagem

### Formatação do Número
- Aceita: `11999887766`, `5511999887766`, `+5511999887766`
- Remove automaticamente caracteres especiais
- Adiciona código do país (55) se necessário
- Converte para formato WhatsApp (`@s.whatsapp.net`)

## 🚀 Cliente TypeScript (Recomendado)

Para facilitar a integração, use nosso cliente TypeScript:

### Instalação

1. Copie o arquivo `lib/whatsapp-external-client.ts` para seu projeto
2. Configure as variáveis de ambiente

### Uso Básico

```typescript
import { createZapMembershipClient } from './lib/whatsapp-external-client';

// Configurar cliente
const zapClient = createZapMembershipClient({
  baseUrl: 'https://seu-zap-membership.com',
  apiKey: process.env.ZAP_MEMBERSHIP_API_KEY!,
  timeout: 30000 // opcional
});

// Verificar status
const status = await zapClient.getApiStatus();
console.log('API Status:', status.status);

// Listar instâncias
const instances = await zapClient.listInstances();
console.log(`${instances.count} instâncias disponíveis`);

// Enviar mensagem específica
const result = await zapClient.sendMessage({
  instanceId: 'minha-instancia-id',
  number: '11999887766',
  message: 'Olá mundo!',
  userId: 'meu-sistema'
});

// Enviar mensagem automática (usa primeira instância disponível)
const autoResult = await zapClient.sendMessageAuto(
  '11999887766', 
  'Mensagem automática!'
);

console.log('Mensagem enviada:', autoResult.messageId);
```

### Exemplo em API Route (Next.js)

```typescript
// pages/api/send-whatsapp.ts ou app/api/send-whatsapp/route.ts
import { createZapMembershipClient } from '@/lib/whatsapp-external-client';

const zapClient = createZapMembershipClient({
  baseUrl: process.env.ZAP_MEMBERSHIP_URL!,
  apiKey: process.env.ZAP_MEMBERSHIP_API_KEY!
});

export async function POST(request: Request) {
  try {
    const { phone, message } = await request.json();

    const result = await zapClient.sendMessageAuto(phone, message);

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
```

## 🚀 Exemplos de Uso Direto

### JavaScript/Node.js

```javascript
const sendWhatsAppMessage = async (instanceId, number, message) => {
  try {
    const response = await fetch('https://seu-dominio.com/api/external/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'sua-chave-api-aqui'
      },
      body: JSON.stringify({
        instanceId,
        number,
        message,
        userId: 'meu-sistema'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Mensagem enviada:', result.messageId);
    } else {
      console.error('Erro:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Erro de conexão:', error);
    throw error;
  }
};

// Uso
await sendWhatsAppMessage('minha-instancia', '11999887766', 'Olá mundo!');
```

### cURL

```bash
# Listar instâncias
curl -X GET https://seu-dominio.com/api/external/instances \
  -H "x-api-key: sua-chave-api-aqui"

# Enviar mensagem
curl -X POST https://seu-dominio.com/api/external/send-message \
  -H "Content-Type: application/json" \
  -H "x-api-key: sua-chave-api-aqui" \
  -d '{
    "instanceId": "minha-instancia",
    "number": "11999887766",
    "message": "Mensagem via cURL",
    "userId": "teste-curl"
  }'
```

### Python

```python
import requests
import json

class ZapMembershipClient:
    def __init__(self, base_url, api_key):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            'Content-Type': 'application/json',
            'x-api-key': api_key
        }
    
    def list_instances(self):
        response = requests.get(f"{self.base_url}/api/external/instances", headers=self.headers)
        return response.json()
    
    def send_message(self, instance_id, number, message, user_id="python-client"):
        data = {
            "instanceId": instance_id,
            "number": number,
            "message": message,
            "userId": user_id
        }
        response = requests.post(f"{self.base_url}/api/external/send-message", 
                               headers=self.headers, json=data)
        return response.json()

# Uso
client = ZapMembershipClient("https://seu-dominio.com", "sua-chave-api-aqui")

# Listar instâncias
instances = client.list_instances()
print(f"Instâncias disponíveis: {instances['count']}")

# Enviar mensagem
result = client.send_message("minha-instancia", "11999887766", "Olá do Python!")
print(f"Resultado: {result}")
```

## 🛡️ Segurança

### Boas Práticas
1. **Nunca exponha a API Key** no frontend
2. **Use HTTPS** em produção
3. **Implemente rate limiting** se necessário
4. **Monitore logs** para detectar uso indevido
5. **Rotacione a API Key** periodicamente

### Rate Limiting (Opcional)
Para implementar rate limiting, adicione ao endpoint:

```typescript
// Exemplo simples com Redis
const rateLimitKey = `rate_limit:${apiKey}:${Date.now() / 60000 | 0}`;
const currentCount = await redis.incr(rateLimitKey);
await redis.expire(rateLimitKey, 60);

if (currentCount > 100) { // 100 mensagens por minuto
  return NextResponse.json(
    { success: false, error: 'Rate limit excedido' },
    { status: 429 }
  );
}
```

## 🔍 Logs e Monitoramento

Todas as requisições são logadas com:
- Timestamp da requisição
- Instance ID utilizada
- Número mascarado (para privacidade)
- Tamanho da mensagem
- User ID (se fornecido)
- Status da resposta

**Exemplo de log:**
```
[EXTERNAL_API] Requisição recebida: {
  instanceId: "minha-instancia",
  number: "119998*****",
  messageLength: 25,
  userId: "sistema-externo",
  timestamp: "2024-01-15T10:30:00.000Z"
}
```

## ❓ Troubleshooting

### Erro: "API Key inválida"
- Verifique se o header `x-api-key` está presente
- Confirme se a chave corresponde à variável `EXTERNAL_API_KEY`

### Erro: "Instância não encontrada"
- Verifique se o `instanceId` existe no sistema
- Confirme se a instância está ativa
- Use o endpoint `/api/external/instances` para listar instâncias disponíveis

### Erro: "Instância não está conectada"
- A instância WhatsApp precisa estar conectada
- Verifique o status no dashboard do ZAP Membership
- Use o endpoint de listagem para verificar status

### Mensagem não entregue
- Verifique se o número existe no WhatsApp
- Confirme se o número está no formato correto
- Verifique os logs da Evolution API

## 🔄 Fluxo de Integração Recomendado

1. **Configure a API Key** no sistema ZAP Membership
2. **Teste a conexão** com `GET /api/external/send-message`
3. **Liste instâncias** disponíveis com `GET /api/external/instances`
4. **Implemente o cliente** TypeScript em seu sistema
5. **Teste envio** de mensagens
6. **Monitore logs** e performance
7. **Implemente tratamento** de erros robusto 