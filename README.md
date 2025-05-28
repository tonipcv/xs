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

# Stripe (para pagamentos)
STRIPE_SECRET_KEY=sk_your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_your_stripe_publishable_key

# Redis (para cache e rate limiting)
REDIS=redis://your_redis_connection_string
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

## 🔒 Boas Práticas de Segurança

1. **Nunca commite arquivos .env**
2. **Use HTTPS em produção**
3. **Configure rate limiting adequadamente**
4. **Monitore uso de tokens**
5. **Faça backup regular do banco**
6. **Use Redis para cache em produção**

## 📝 Estrutura do Projeto

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── ai-agent/      # Endpoints do AI Agent
│   │   └── whatsapp/      # Endpoints WhatsApp
│   ├── ai-agent/          # Dashboard do AI Agent
│   └── dashboard/         # Dashboard principal
├── lib/                   # Bibliotecas e utilitários
│   ├── evolution-api.ts   # Cliente Evolution API
│   ├── ai-context-generator.ts # Gerador de contexto IA
│   ├── knowledge-search.ts # Busca na base de conhecimento
│   └── redis.ts          # Cliente Redis
└── components/           # Componentes React
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

## 🆘 Suporte

Para suporte técnico:
- Abra uma issue no GitHub
- Consulte a documentação da Evolution API
- Verifique os logs do sistema

---

**⚠️ LEMBRE-SE**: Mantenha suas chaves de API seguras e nunca as exponha publicamente! 