# 🤖 AI Agent - Sistema de Assistente Virtual WhatsApp

Sistema completo de assistente virtual para WhatsApp usando OpenAI e Evolution API.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Requisitos](#requisitos)
- [Configuração Inicial](#configuração-inicial)
- [Como Usar](#como-usar)
- [Configuração do Webhook](#configuração-do-webhook)
- [Características](#características)
- [Troubleshooting](#troubleshooting)

## 🎯 Visão Geral

O AI Agent permite criar assistentes virtuais inteligentes que respondem automaticamente mensagens no WhatsApp usando:

- **OpenAI GPT**: Para gerar respostas inteligentes
- **Evolution API**: Para integração com WhatsApp
- **Sistema de Tokens**: Controle de uso com limite gratuito mensal
- **Rate Limiting**: Proteção contra spam e loops infinitos
- **Configuração Automática**: Setup automático de webhook e settings

## 📋 Requisitos

### Variáveis de Ambiente Obrigatórias

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Evolution API
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua-api-key

# Aplicação (opcional)
NEXTAUTH_URL=https://seu-dominio.com  # Para produção
```

### Instância WhatsApp

- Instância conectada na Evolution API (status CONNECTED)
- Número de WhatsApp válido e verificado

## ⚙️ Configuração Inicial

### 1. Configurar Variáveis de Ambiente

Adicione as variáveis no seu arquivo `.env.local`:

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
EVOLUTION_API_URL=https://evolution-api.example.com
EVOLUTION_API_KEY=A1B2C3D4E5F6...
NEXTAUTH_URL=http://localhost:3000  # Para desenvolvimento
```

### 2. Verificar Instância WhatsApp

- Acesse `/whatsapp-instances`
- Certifique-se que sua instância está CONNECTED
- Anote o nome da instância (instanceName)

## 🚀 Como Usar

### 1. Criar um Agente

1. Acesse `/ai-agent`
2. Clique em "Novo Agente"
3. Preencha o formulário:
   - **Instância**: Selecione uma instância conectada
   - **Modelo**: Escolha o modelo OpenAI (GPT-3.5, GPT-4, etc.)
   - **Prompt do Sistema**: Defina a personalidade do bot
   - **Configurações**: Ajuste tokens, criatividade, rate limits
   - **Auto-Config**: Deixe marcado para configuração automática

### 2. Configuração Automática (Recomendada)

Quando criar um agente com "Configurar webhook automaticamente" marcado:

- ✅ Settings da instância são configurados automaticamente
- ✅ Webhook é configurado automaticamente
- ✅ Agente fica pronto para uso imediato

### 3. Configuração Manual (se necessário)

Se a configuração automática falhar, use os botões "Auto-Config" nos agentes ou configure manualmente:

#### Passo 1: Configurar Settings
```bash
curl -X POST "https://evolution-api.com/settings/set/INSTANCE_NAME" \
  -H "Content-Type: application/json" \
  -H "apikey: SUA-API-KEY" \
  -d '{
    "always_online": true,
    "read_messages": true,
    "reject_call": true
  }'
```

#### Passo 2: Configurar Webhook
```bash
curl -X POST "https://evolution-api.com/webhook/set/INSTANCE_NAME" \
  -H "Content-Type: application/json" \
  -H "apikey: SUA-API-KEY" \
  -d '{
    "url": "https://seu-dominio.com/api/ai-agent/webhook/messages-upsert",
    "webhook_by_events": true,
    "events": ["MESSAGES_UPSERT"]
  }'
```

## 🌐 Configuração do Webhook

### Para Desenvolvimento (ngrok)

1. Instale o ngrok:
```bash
npm install -g ngrok
```

2. Execute o ngrok:
```bash
ngrok http 3000
```

3. Use a URL HTTPS fornecida:
```
https://abc123.ngrok.io/api/ai-agent/webhook
```

### Para Produção

Use sua URL de produção:
```
https://meudominio.com/api/ai-agent/webhook
```

## ✨ Características

### Sistema de Tokens
- **100.000 tokens gratuitos por mês** por usuário
- Renovação automática todo mês
- Dashboard com progresso em tempo real
- Mensagem de fallback quando limite esgotado

### Rate Limiting e Proteções
- **Rate Limit**: Máximo de mensagens por minuto configurável
- **Anti-Loop**: Limite de respostas consecutivas
- **Cooldown**: Pausa após atingir limites
- **Filtros**: Ignora mensagens próprias e grupos (opcional)

### Modelos OpenAI Suportados
- **GPT-3.5 Turbo**: Rápido e econômico
- **GPT-4**: Mais inteligente
- **GPT-4 Turbo**: Balanceado

### Recursos Avançados
- **Contexto**: Mantém histórico das últimas 10 mensagens
- **Typing Indicators**: Simula "digitando..." natural
- **Logs Detalhados**: Todas as interações são registradas
- **Status em Tempo Real**: Dashboard com estatísticas

## 📊 Dashboard

Acesse `/ai-agent` para ver:

- **Uso de Tokens**: Progresso mensal e diário
- **Estatísticas**: Mensagens, respostas, tempo médio
- **Status dos Agentes**: Configuração e saúde
- **Configuração do Webhook**: Instruções e status

## 🛠 Troubleshooting

### Agente não responde mensagens

1. **Verificar webhook**:
   - Status deve ser "Configurado" ✅
   - Use botão "Auto-Config" se necessário

2. **Verificar instância**:
   - Status deve ser CONNECTED
   - Número deve estar verificado

3. **Verificar tokens**:
   - Verifique se ainda tem tokens disponíveis
   - Dashboard mostra limite atual

4. **Verificar logs**:
   - Console do navegador
   - Logs da aplicação
   - Verifique se webhook está recebendo dados

### Configuração automática falha

1. **Verificar variáveis de ambiente**:
   ```bash
   echo $EVOLUTION_API_URL
   echo $EVOLUTION_API_KEY
   ```

2. **Testar conexão com Evolution API**:
   ```bash
   curl -H "apikey: SUA-API-KEY" "https://evolution-api.com/instance/fetchInstances"
   ```

3. **Configurar manualmente**:
   - Use instruções na aba "Webhook"
   - Copie comandos curl prontos

### Webhook não recebe mensagens

1. **URL pública**:
   - Para desenvolvimento: use ngrok
   - Para produção: URL HTTPS válida

2. **Eventos configurados**:
   - Deve incluir "MESSAGES_UPSERT"
   - webhook_by_events: true

3. **Firewall/Proxy**:
   - Certifique-se que Evolution API pode acessar sua URL

### Respostas muito lentas

1. **Modelo OpenAI**:
   - GPT-3.5 é mais rápido que GPT-4
   - Reduza max_tokens se necessário

2. **Rate Limits OpenAI**:
   - Verifique limites da sua conta
   - Considere upgrade do plano

### Limite de tokens esgotado

1. **Aguardar renovação mensal**
2. **Otimizar prompts**:
   - Prompts mais curtos = menos tokens
   - Reduza max_tokens nas configurações
3. **Configurar mensagem de fallback**:
   - Será enviada quando tokens esgotarem

## 📝 Notas Importantes

- **Privacidade**: Mensagens são enviadas para OpenAI para processamento
- **Custos**: Verifique custos da OpenAI e Evolution API
- **Rate Limits**: Respecte limites para evitar bloqueios
- **Backup**: Mantenha backup das configurações importantes

## 🆘 Suporte

Para problemas:

1. Verifique logs no dashboard
2. Teste configuração no webhook
3. Verifique status da instância
4. Confirme variáveis de ambiente

---

**💡 Dica**: Use a configuração automática sempre que possível. Ela configura tudo corretamente de uma vez! 