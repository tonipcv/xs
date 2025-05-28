# Configuração do Ngrok para Desenvolvimento

Este guia explica como configurar o ngrok para desenvolvimento local com webhooks do WhatsApp.

## 🚀 Configuração Rápida

### 1. Instalar o ngrok
```bash
# Via npm (recomendado)
npm install -g ngrok

# Ou baixar diretamente do site
# https://ngrok.com/download
```

### 2. Iniciar o ngrok
```bash
# Em um terminal separado
ngrok http 3000
```

### 3. Configurar a URL automaticamente
```bash
# Atualizar automaticamente (detecta a URL do ngrok)
npm run ngrok:update

# Ou definir manualmente
npm run ngrok:set https://abc123.ngrok-free.app
```

### 4. Verificar configuração
- Acesse a página de AI Agents: http://localhost:3000/ai-agent
- Vá para a aba "Webhook"
- Verifique se aparece "Usando NGROK_URL configurada no .env.local"

## 📋 Fluxo Completo de Desenvolvimento

### Terminal 1: Aplicação Next.js
```bash
npm run dev
```

### Terminal 2: Ngrok
```bash
ngrok http 3000
```

### Terminal 3: Atualizar URL
```bash
# Quando o ngrok reiniciar e gerar nova URL
npm run ngrok:update
```

## 🔧 Configuração Manual

Se preferir configurar manualmente, adicione no seu `.env.local`:

```env
# Ngrok URL for webhooks (update this when ngrok restarts)
NGROK_URL=https://abc123.ngrok-free.app
```

## 🔄 Quando o Ngrok Reinicia

O ngrok gera uma nova URL a cada reinicialização (na versão gratuita). Quando isso acontecer:

1. **Copie a nova URL HTTPS** do terminal do ngrok
2. **Atualize a configuração**:
   ```bash
   npm run ngrok:set https://nova-url.ngrok-free.app
   ```
3. **Reconfigure os webhooks** dos agentes ativos usando o botão "Auto-Config"

## 🛠️ Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run ngrok:update` | Detecta automaticamente a URL do ngrok e atualiza o .env.local |
| `npm run ngrok:set <url>` | Define manualmente a URL do ngrok |
| `npm run dev:ngrok` | Inicia o dev com instruções do ngrok |

## 🔍 Verificação e Debug

### Verificar se o ngrok está funcionando
```bash
# Verificar túneis ativos
curl http://localhost:4040/api/tunnels
```

### Verificar webhook na Evolution API
```bash
# Substituir pelos seus valores
curl -X GET "https://sua-evolution-api.com/webhook/find/sua-instancia" \
  -H "apikey: sua-api-key"
```

### Logs do webhook
- Acesse: http://localhost:4040 (interface web do ngrok)
- Veja as requisições em tempo real
- Útil para debug de problemas de webhook

## ⚠️ Problemas Comuns

### "Erro ao obter URL do ngrok automaticamente"
- Certifique-se que o ngrok está rodando: `ngrok http 3000`
- Verifique se a porta 4040 está acessível: http://localhost:4040

### "URL inválida. Deve ser uma URL HTTPS do ngrok"
- Use apenas URLs HTTPS do ngrok
- Formato correto: `https://abc123.ngrok-free.app`
- Não inclua caminhos ou barras finais

### Webhook não recebe mensagens
1. Verifique se a URL do ngrok está acessível externamente
2. Confirme se o webhook foi configurado na Evolution API
3. Verifique os logs no painel do ngrok (http://localhost:4040)
4. Teste o endpoint manualmente:
   ```bash
   curl -X POST "https://sua-url.ngrok-free.app/api/ai-agent/webhook/messages-upsert" \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

## 🎯 Dicas de Produção

Para produção, substitua o ngrok por:
- **Cloudflare Tunnels** (gratuito, URLs fixas)
- **Servidor VPS** com domínio próprio
- **Vercel/Netlify** para deploy completo

Configure a variável `NGROK_URL` com a URL de produção:
```env
NGROK_URL=https://seu-dominio.com
```

## 📚 Links Úteis

- [Documentação do Ngrok](https://ngrok.com/docs)
- [Evolution API Docs](https://doc.evolution-api.com/)
- [Webhook Testing Tools](https://webhook.site/) 