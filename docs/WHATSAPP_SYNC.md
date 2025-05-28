# 📱 WhatsApp Sync - Documentação Completa

## 🎯 Visão Geral

O sistema de **WhatsApp Sync** permite sincronizar e persistir todos os dados do WhatsApp Business no banco de dados da aplicação, incluindo:

- 👥 **Contatos** - Lista completa de contatos
- 💬 **Chats** - Conversas individuais e grupos  
- 📨 **Mensagens** - Histórico completo de mensagens
- 🏷️ **Labels** - Etiquetas e organizações

## 🏗️ Arquitetura

### Componentes Principais

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   Evolution API     │◄──►│   WhatsApp Service   │◄──►│     Database        │
│   (WhatsApp Bot)    │    │   (Sync Engine)      │    │   (SQLite/Prisma)   │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
          ▲                           ▲                           ▲
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│    WhatsApp Web     │    │    Next.js API       │    │    React Frontend   │
│   (Conectado)       │    │   (Routes & Logic)   │    │   (Interface)       │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
```

### Modelos de Dados

#### WhatsAppContact
```typescript
{
  id: string              // ID único
  jid: string            // WhatsApp ID (ex: 5511999887766@s.whatsapp.net)
  phone: string          // Número limpo (5511999887766)
  pushName: string       // Nome salvo no celular
  profileName: string    // Nome do perfil WhatsApp
  profilePicUrl: string  // URL da foto de perfil
  isMyContact: boolean   // Está na agenda
  isWABusiness: boolean  // É conta business
  businessName: string   // Nome da empresa
  isGroup: boolean       // É um grupo
  labels: Label[]        // Etiquetas associadas
}
```

#### WhatsAppChat
```typescript
{
  id: string              // ID único
  remoteJid: string      // WhatsApp chat ID
  name: string           // Nome do chat/grupo
  isGroup: boolean       // É um grupo
  unreadCount: number    // Mensagens não lidas
  lastMessageTime: Date  // Última mensagem
  lastMessagePreview: string // Preview da última mensagem
  isArchived: boolean    // Chat arquivado
  isMuted: boolean       // Chat silenciado
  isPinned: boolean      // Chat fixado
  contact: Contact       // Contato associado
  messages: Message[]    // Mensagens do chat
}
```

#### WhatsAppMessage
```typescript
{
  id: string              // ID único
  messageId: string      // ID da mensagem no WhatsApp
  remoteJid: string      // Chat onde foi enviada
  messageType: string    // text, image, video, audio, etc.
  content: string        // Conteúdo da mensagem
  mediaUrl: string       // URL de mídia (se houver)
  fileName: string       // Nome do arquivo
  fromMe: boolean        // Mensagem enviada por mim
  status: string         // SENT, DELIVERED, READ, etc.
  timestamp: Date        // Data/hora da mensagem
  quotedMessageId: string // Mensagem citada
  isForwarded: boolean   // Foi encaminhada
  reaction: string       // Emoji de reação
}
```

## 🚀 Como Usar

### 1. Pré-requisitos

- ✅ Evolution API rodando
- ✅ Instância WhatsApp conectada
- ✅ Variáveis de ambiente configuradas

```bash
# .env.local
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-api-key
```

### 2. Testando a Conexão

```bash
# Executar script de teste
node scripts/test-whatsapp-sync.js
```

### 3. Executando o Sync

#### Via Interface Web
1. Acesse `/whatsapp`
2. Clique em "Sync" na instância conectada
3. Escolha o tipo de sync:
   - **Completa**: Todos os dados
   - **Contatos**: Apenas contatos
   - **Chats**: Apenas conversas
   - **Mensagens**: Apenas mensagens
4. Configure opções avançadas
5. Clique em "Iniciar Sync"

#### Via API
```javascript
// POST /api/whatsapp/instances/{instanceId}/sync
{
  "type": "full",           // full, contacts, chats, messages
  "batchSize": 100,         // Tamanho do lote
  "includeGroups": true,    // Incluir grupos
  "dateFrom": "2024-01-01", // Data início (para mensagens)
  "dateTo": "2024-12-31"    // Data fim (para mensagens)
}
```

### 4. Visualizando os Dados

#### Via Interface Web
1. Clique em "Dados" na instância
2. Navegue pelas abas: Contatos, Chats, Mensagens
3. Use a busca e filtros
4. Navegue pelas páginas

#### Via API
```javascript
// GET /api/whatsapp/instances/{instanceId}/data
?type=contacts          // contacts, chats, messages
&page=1                 // Página
&limit=50               // Limite por página
&search=termo           // Termo de busca
&includeGroups=true     // Incluir grupos
&chatId=123             // ID do chat (para mensagens)
```

## 🔧 Configuração Avançada

### Opções de Sync

| Opção | Descrição | Padrão |
|-------|-----------|--------|
| `batchSize` | Quantidade de itens por lote | 100 |
| `includeGroups` | Incluir grupos na sincronização | true |
| `dateFrom` | Data início para mensagens | null |
| `dateTo` | Data fim para mensagens | null |

### Performance

#### Recomendações
- **Contatos**: 100-500 por lote
- **Chats**: 50-200 por lote  
- **Mensagens**: 25-100 por lote

#### Monitoramento
```javascript
// Callback de progresso
const options = {
  onProgress: (stats) => {
    console.log(`Contatos: ${stats.contacts?.total || 0}`);
    console.log(`Chats: ${stats.chats?.total || 0}`);
    console.log(`Mensagens: ${stats.messages?.total || 0}`);
  }
};
```

## 📊 Endpoints da API

### Sync
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/whatsapp/instances/{id}/sync` | Executar sincronização |

### Dados
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/whatsapp/instances/{id}/data` | Listar dados sincronizados |

### Estrutura de Resposta

#### Sync Response
```json
{
  "success": true,
  "type": "full",
  "stats": {
    "contacts": { "total": 150, "created": 100, "updated": 50 },
    "chats": { "total": 45, "created": 30, "updated": 15 },
    "messages": { "total": 2500, "created": 2000, "updated": 500 },
    "errors": []
  },
  "message": "Sync full executado com sucesso"
}
```

#### Data Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  },
  "meta": {
    "type": "contacts",
    "instanceId": "abc123",
    "search": "",
    "includeGroups": true
  }
}
```

## 🐛 Troubleshooting

### Problemas Comuns

#### 1. "Instância não conectada"
```bash
# Verificar status da instância
curl -H "apikey: YOUR_KEY" \
  http://localhost:8080/instance/connectionState/INSTANCE_NAME
```

#### 2. "Erro ao buscar contatos"
- Verifique se a Evolution API está rodando
- Confirme a API Key
- Teste manualmente os endpoints

#### 3. "Timeout durante sync"
- Reduza o `batchSize`
- Execute sync por partes (contacts → chats → messages)
- Verifique logs da Evolution API

### Logs e Debug

#### Evolution API Logs
```bash
# Docker
docker logs evolution-api

# PM2
pm2 logs evolution-api
```

#### Next.js Logs
```bash
# Development
npm run dev

# Production
npm run build && npm start
```

### Verificação de Dados

#### Contatar Banco de Dados
```sql
-- Contar registros
SELECT 
  'contacts' as type, COUNT(*) as total FROM whatsapp_contacts
UNION ALL
SELECT 
  'chats' as type, COUNT(*) as total FROM whatsapp_chats  
UNION ALL
SELECT 
  'messages' as type, COUNT(*) as total FROM whatsapp_messages;

-- Verificar última sincronização
SELECT instanceName, updatedAt 
FROM whatsapp_instances 
ORDER BY updatedAt DESC;
```

## 🔮 Roadmap Futuro

### Funcionalidades Planejadas

- [ ] **Sync Incremental** - Apenas dados novos/alterados
- [ ] **Sync em Background** - Jobs assíncronos
- [ ] **Múltiplas Instâncias** - Sync paralelo
- [ ] **Backup/Restore** - Exportar/importar dados
- [ ] **Analytics** - Estatísticas e relatórios
- [ ] **Webhook Sync** - Sync em tempo real via webhooks
- [ ] **API GraphQL** - Query flexível dos dados

### Melhorias Técnicas

- [ ] **Retry Logic** - Tentativas automáticas em falhas
- [ ] **Rate Limiting** - Controle de velocidade
- [ ] **Compression** - Compressão de dados
- [ ] **Encryption** - Criptografia de dados sensíveis
- [ ] **Clustering** - Distribuição de carga

## 📚 Recursos Adicionais

### Links Úteis
- [Evolution API Docs](https://doc.evolution-api.com/)
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/)
- [Prisma Docs](https://www.prisma.io/docs/)

### Exemplos de Código
- [Scripts de teste](../scripts/test-whatsapp-sync.js)
- [Componentes React](../src/components/whatsapp/)
- [API Routes](../src/app/api/whatsapp/)

---

**🔥 Pro Tip**: Execute sync de contatos primeiro, depois chats, e por último mensagens para melhor performance! 