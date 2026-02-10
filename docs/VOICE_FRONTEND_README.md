# Voice Data Governance - Frontend Documentation

## Visão Geral

O frontend Voice Data Governance foi implementado seguindo exatamente o mesmo design system do Xase AI existente, garantindo consistência visual e de experiência do usuário.

## Design System

### Cores
- **Background principal**: `#0e0f12`
- **Cards e containers**: `bg-white/[0.02]` com `border-white/[0.04]`
- **Hover states**: `bg-white/[0.04]` com `border-white/[0.08]`
- **Texto primário**: `text-white`
- **Texto secundário**: `text-white/60` a `text-white/80`
- **Texto terciário**: `text-white/40` a `text-white/50`

### Tipografia
- **Headings**: Playfair Display (600, 700)
- **Corpo**: Sistema padrão
- **Monospace**: Para IDs, valores numéricos, timestamps

### Componentes Base
- Cards com bordas sutis e backgrounds semi-transparentes
- Badges de status com cores contextuais
- Tabelas responsivas com hover states
- Links com underline e transições suaves

## Estrutura de Páginas

### 1. Voice Dashboard (`/xase/voice`)
**Propósito**: Visão geral do sistema Voice Data Governance

**Métricas exibidas**:
- Total de datasets
- Políticas ativas
- Horas de voz disponíveis
- Saldo de créditos

**Seções**:
- Summary card com status geral
- Grid de estatísticas
- Tabela de datasets recentes
- Quick actions (criar dataset, gerenciar policies, ver logs)

### 2. Lista de Datasets (`/xase/voice/datasets`)
**Propósito**: Gerenciar todos os datasets de voz

**Funcionalidades**:
- Grid de cards com datasets
- Informações por dataset:
  - Nome, descrição, idioma
  - Status (DRAFT, ACTIVE, ARCHIVED)
  - Status de processamento
  - Duração total e número de gravações
  - Datas de criação e publicação
- Botão para criar novo dataset

### 3. Detalhe do Dataset (`/xase/voice/datasets/[datasetId]`)
**Propósito**: Visualizar e gerenciar um dataset específico

**Seções**:
- Overview com métricas principais (status, duração, gravações, consent)
- Informações detalhadas (idioma, versão, storage, sample rate, codec, canais)
- Tabela de políticas de acesso ativas
- Logs de acesso recentes
- Ações: Upload de áudio, Publicar dataset (se DRAFT e COMPLETED)

### 4. Políticas de Acesso (`/xase/voice/policies`)
**Propósito**: Gerenciar políticas de acesso aos datasets

**Funcionalidades**:
- Tabela completa de políticas (próprias e como cliente)
- Colunas: Dataset, Cliente, Status, Propósito, Horas máx/consumidas, Preço, Expiração
- Ação de revogar (para donos de dataset)
- Estatísticas: Políticas ativas, Horas concedidas, Horas consumidas
- Botão para criar nova política

### 5. Access Logs (`/xase/voice/access-logs`)
**Propósito**: Audit trail imutável de todos os acessos

**Funcionalidades**:
- Tabela de eventos de acesso (últimos 50)
- Colunas: Timestamp UTC, Dataset, Ação, Arquivos, Horas, Outcome, IP, Request ID
- Estatísticas: Total de acessos, Horas acessadas, Arquivos acessados
- Info card explicando imutabilidade

### 6. Credit Ledger (`/xase/voice/ledger`)
**Propósito**: Ledger financeiro append-only

**Funcionalidades**:
- Card de saldo atual com destaque visual
- Totais de créditos e débitos
- Tabela de entradas do ledger (últimas 50)
- Colunas: Timestamp UTC, Tipo de evento, Descrição, Valor, Saldo após
- Info card explicando append-only

## Navegação

### Menu Lateral (AppSidebar)
Nova seção "VOICE DATA" adicionada com:
- 🎤 Voice Dashboard
- 💾 Datasets
- 🛡️ Policies
- 📊 Access Logs
- 💰 Credit Ledger

## Padrões de Implementação

### Server Components
Todas as páginas são Server Components do Next.js 15, com:
- `getServerSession` para autenticação
- `getTenantId` para multi-tenancy
- Queries Prisma diretas no servidor
- Redirect para `/login` se não autenticado

### Tratamento de Dados
- Agregações calculadas no servidor
- Formatação de números com `toFixed()` e `toLocaleString()`
- Timestamps em ISO 8601 (UTC)
- Valores monetários com 2-4 casas decimais

### Status Badges
```tsx
<span className={`px-2 py-0.5 rounded text-[10px] ${
  status === 'ACTIVE' 
    ? 'bg-white/10 text-white/80'
    : status === 'DRAFT'
    ? 'bg-yellow-500/10 text-yellow-400'
    : 'bg-white/5 text-white/50'
}`}>
  {status}
</span>
```

### Links Internos
- Datasets: `/xase/voice/datasets/${datasetId}`
- Policies: `/xase/voice/policies?datasetId=${datasetId}`
- Sempre com hover states e underline

## Próximos Passos (Funcionalidades Interativas)

### Formulários a Implementar
1. **Criar Dataset**: Modal/página com form (nome, idioma, descrição)
2. **Upload de Áudio**: Interface de upload com presigned URLs
3. **Criar Policy**: Form com seleção de dataset, cliente, termos
4. **Revogar Policy**: Confirmação + razão

### Integrações API
- Conectar botões de ação às rotas API existentes
- Feedback visual (toasts/notifications)
- Loading states durante requests
- Error handling com mensagens claras

### Melhorias UX
- Paginação nas tabelas
- Filtros e busca
- Sorting de colunas
- Export de dados (CSV/JSON)
- Gráficos de uso ao longo do tempo

## Observações Técnicas

### Lints do Prisma
Os avisos sobre `schema-voice.prisma` duplicado podem ser ignorados ou resolvidos removendo/renomeando o arquivo alternativo. O schema ativo é `prisma/schema.prisma`.

### Performance
- Queries limitadas (take: 5, 10, 50 conforme contexto)
- Selects específicos para reduzir payload
- Agregações otimizadas com Prisma

### Acessibilidade
- Semantic HTML (table, thead, tbody)
- Contrast ratios adequados
- Hover states claros
- Font sizes legíveis (xs: 12px, sm: 14px, base: 16px)

## Manutenção

Para adicionar novas páginas Voice:
1. Criar em `/src/app/xase/voice/[nome]/page.tsx`
2. Seguir estrutura: AppLayout > container > header > conteúdo
3. Usar mesmas classes Tailwind do design system
4. Adicionar link no AppSidebar se necessário
5. Manter consistência de métricas e formatação
