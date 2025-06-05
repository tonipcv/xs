# ZAP Membership - Sistema de AI-Powered Customer Experience

Sistema completo de gestão de membros com integração WhatsApp e agentes de IA para atendimento automatizado.

## 🚀 Funcionalidades

- **Sistema de Membros**: Gestão completa de usuários e assinaturas
- **Integração WhatsApp**: Conecte múltiplas instâncias via Evolution API
- **Agentes de IA**: Atendimento automatizado com OpenAI
- **Base de Conhecimento**: Sistema de busca semântica para respostas contextuais
- **Dashboard Analytics**: Estatísticas em tempo real
- **Sistema de Tokens**: Controle de uso com limites mensais
- **Rate Limiting**: Proteção contra spam e uso excessivo
- **🔌 API Externa**: Integração com outros sistemas Next.js para envio de mensagens

## 🔌 API Externa para Integração

### Novo! Integre com Outros Sistemas

Agora você pode integrar facilmente outros sistemas Next.js ou qualquer aplicação com o ZAP Membership para enviar mensagens WhatsApp sem gerenciar a Evolution API diretamente.

**Endpoints disponíveis:**
- `GET /api/external/send-message` - Status da API
- `GET /api/external/instances` - Listar instâncias WhatsApp
- `POST /api/external/send-message` - Enviar mensagens

**Exemplo de uso:**
```javascript
const response = await fetch('https://seu-zap-membership.com/api/external/send-message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'sua-api-key'
  },
  body: JSON.stringify({
    instanceId: 'sua-instancia',
    number: '11999887766',
    message: 'Olá mundo!'
  })
});
```

**📚 Documentação completa:** [docs/EXTERNAL_API.md](docs/EXTERNAL_API.md)

**🧪 Teste a integração:**
```bash
npm run test:external-api
```

## 🛡️ Segurança

### ⚠️ IMPORTANTE - Configuração de Segurança

Este projeto contém configurações sensíveis que **NUNCA** devem ser expostas publicamente:

1. **Arquivos .env**: Contêm chaves de API e credenciais
2. **Chaves hardcoded**: Foram removidas do código
3. **Tokens de acesso**: Configurados via variáveis de ambiente

### 🔐 Variáveis de Ambiente Obrigatórias

Copie `.env.example` para `.env` e configure:

```bash
cp .env.example .env
```

**Variáveis críticas que DEVEM ser configuradas:**

```env
# Database
DATABASE_URL=your_database_url_here

# NextAuth
NEXTAUTH_SECRET=your_secure_random_string
NEXTAUTH_URL=http://localhost:3000

# OpenAI
OPENAI_API_KEY=sk-your_openai_api_key

# Evolution API
EVOLUTION_API_URL=your_evolution_api_url
EVOLUTION_API_KEY=your_evolution_api_key

# API Externa (NOVO!)
EXTERNAL_API_KEY=sua-chave-super-segura-para-integracao

# Stripe (para pagamentos)
STRIPE_SECRET_KEY=sk_your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_your_stripe_publishable_key

# Redis (para cache e rate limiting)
REDIS=redis://your_redis_connection_string
```

### 🔑 Configuração da API Externa

A `EXTERNAL_API_KEY` é **obrigatória** para usar os endpoints de integração externa:

1. **Gere uma chave segura:**
```bash
# Exemplo de chave forte
EXTERNAL_API_KEY=zap-membership-api-$(openssl rand -hex 16)
```

2. **Configure no .env.local:**
```env
EXTERNAL_API_KEY=sua-chave-super-segura-aqui
```

3. **⚠️ NUNCA exponha esta chave:**
   - Não commite no Git
   - Use apenas em variáveis de ambiente
   - Rotacione periodicamente

4. **Teste a configuração:**
```bash
npm run test:external-api
```

Se a chave não estiver configurada, você verá o erro:
```
❌ EXTERNAL_API_KEY não configurada no arquivo .env
```

## 📋 Pré-requisitos

- Node.js 18+ 
- PostgreSQL ou MySQL
- Redis (para cache e rate limiting)
- Conta OpenAI com API Key
- Evolution API configurada
- Conta Stripe (para pagamentos)

## 🚀 Instalação

1. **Clone o repositório**
```bash
git clone <repository-url>
cd zap-membership
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure o banco de dados**
```bash
npx prisma generate
npx prisma db push
```

4. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
# Edite o .env com suas configurações
```

5. **Execute o projeto**
```bash
npm run dev
```

6. **Teste a API Externa (opcional)**
```bash
npm run test:external-api
```

## 🤖 Sistema de AI-Agent

### Configuração do Agente

1. **Acesse o Dashboard**: `/ai-agent`
2. **Configure os campos guiados**:
   - Nome da empresa
   - Produto/serviço
   - Principal dor do cliente
   - Caso de sucesso
   - Objeção de preço
   - Objetivo do agente

3. **Base de Conhecimento**:
   - Upload de documentos (PDF, TXT, DOCX)
   - Busca semântica automática
   - Contexto inteligente em 2 camadas

### Funcionalidades do Agente

- ✅ **Histórico via Redis** (mais eficiente)
- ✅ **Rate limiting** configurável
- ✅ **Simulação de digitação** realista
- ✅ **Marcação de lida** automática
- ✅ **Sistema de tokens** com limites
- ✅ **Logs detalhados** de todas as interações

## 📊 Webhooks

O sistema usa **apenas** o webhook otimizado:
- **URL**: `/api/ai-agent/webhook/messages-upsert`
- **Eventos**: `MESSAGES_UPSERT`, `CONNECTION_UPDATE`
- **Configuração**: Automática via Evolution API

## 🔧 Configuração da Evolution API

1. **Instância WhatsApp**:
```bash
POST /instance/create
{
  "instanceName": "seu_agente",
  "integration": "WHATSAPP-BAILEYS",
  "webhook": {
    "url": "https://seu-dominio.com/api/ai-agent/webhook/messages-upsert",
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }
}
```

2. **QR Code**: Gerado automaticamente
3. **Webhook**: Configurado automaticamente

## 📈 Monitoramento

### Logs do Sistema
- Todas as interações são logadas
- Métricas de performance
- Controle de tokens utilizados
- Rate limiting por usuário

### Dashboard Analytics
- Mensagens processadas
- Tokens consumidos
- Taxa de resposta
- Usuários ativos

## 🚨 Troubleshooting

### Problemas Comuns

1. **Erro de API Key**:
   - Verifique se `EVOLUTION_API_KEY` está configurada
   - Confirme se a chave é válida

2. **Webhook não funciona**:
   - Verifique se a URL é acessível publicamente
   - Use ngrok para desenvolvimento local

3. **Rate Limit atingido**:
   - Ajuste `maxMessagesPerMinute` no agente
   - Verifique logs de rate limiting

4. **Tokens esgotados**:
   - Verifique limite mensal do usuário
   - Configure `freeTokensLimit` adequadamente

5. **API Externa não funciona**:
   - Verifique se `EXTERNAL_API_KEY` está configurada
   - Execute `