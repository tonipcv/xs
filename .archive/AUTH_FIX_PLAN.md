# 🔐 Plano de Correção - Sistema de Autenticação

## 📊 Diagnóstico Atual

### ❌ Problema Principal
- **Banco desalinhado com schema**: O Prisma Client está gerando queries com colunas que não existem no banco PostgreSQL
- **Erro específico**: `The column User.isPremium does not exist in the current database`

### 🔍 Análise Detalhada

#### 1. **Configuração do Banco**
- ✅ `DATABASE_URL` configurada para PostgreSQL
- ✅ Schema Prisma define PostgreSQL como provider
- ❌ Banco não possui todas as colunas do modelo User
- ⚠️ Existe um `dev.db` (SQLite) na pasta que não está sendo usado

#### 2. **Rotas de Autenticação Analisadas**

##### ✅ `/api/auth/register` (Corrigida)
- Parsing seguro do body implementado
- Logs blindados contra payloads null
- Debug messages em desenvolvimento
- **Bloqueio atual**: Prisma tentando acessar colunas inexistentes

##### ✅ `/api/auth/[...nextauth]` (NextAuth)
- Configuração correta em `auth.config.ts`
- Provider de credentials configurado
- Callbacks JWT e session implementados
- **Bloqueio atual**: `findUnique` falhará por colunas faltantes

##### ✅ `/api/auth/forgot-password`
- Validação de email
- Geração de token seguro
- Envio de email configurado
- **Bloqueio atual**: `findUnique` e `update` falharão

##### ✅ `/api/auth/reset-password`
- Validação de token e expiração
- Hash seguro de senha
- Confirmação por email
- **Bloqueio atual**: `findFirst` e `update` falharão

#### 3. **Páginas Frontend**

##### ✅ `/login` 
- Design minimalista implementado
- Link para "Criar conta" adicionado
- Preserva `callbackUrl`
- Tradução i18n configurada

##### ✅ `/register`
- Design alinhado com login
- Campos: name, email, region, password, confirmPassword
- Preserva e usa `callbackUrl` no redirect
- Auto-login após registro

##### ⚠️ `/forgot-password` e `/reset-password`
- Precisam ser verificadas para garantir alinhamento

## 🎯 Plano de Ação

### Fase 1: Sincronizar Banco de Dados ⚡ CRÍTICO

```bash
# Opção 1: Rápida (desenvolvimento)
node sync-db.js

# Opção 2: Com histórico de migrations
npx prisma migrate dev --name add_user_premium_fields
npx prisma generate
```

**O que será criado/atualizado no banco:**
- `User.isPremium` (Boolean, default: false)
- `User.isSuperPremium` (Boolean, default: false)
- `User.tokensUsedThisMonth` (Int, default: 0)
- `User.freeTokensLimit` (Int, default: 100000)
- `User.totalTokensUsed` (Int, default: 0)
- `User.lastTokenReset` (DateTime, default: now())
- `User.tenantId` (String, nullable)
- `User.xaseRole` (XaseRole enum, nullable)
- Todas as tabelas do Xase Core (Tenant, ApiKey, DecisionRecord, etc.)

### Fase 2: Validar Rotas de Auth ✅

#### Testes a realizar:

1. **Register** (`/register?callbackUrl=%2F`)
   - [ ] Criar conta com todos os campos
   - [ ] Verificar auto-login
   - [ ] Confirmar redirect para callbackUrl
   - [ ] Validar email de confirmação (se SMTP configurado)

2. **Login** (`/login?callbackUrl=%2F`)
   - [ ] Login com credenciais válidas
   - [ ] Redirect para callbackUrl
   - [ ] Verificar sessão JWT
   - [ ] Testar link "Criar conta"

3. **Forgot Password** (`/forgot-password`)
   - [ ] Solicitar reset com email válido
   - [ ] Verificar geração de token
   - [ ] Confirmar envio de email (se SMTP configurado)

4. **Reset Password** (`/reset-password?token=...`)
   - [ ] Validar token
   - [ ] Alterar senha
   - [ ] Confirmar email de notificação
   - [ ] Testar login com nova senha

### Fase 3: Correções Adicionais 🔧

#### 3.1 Mensagem de Log Enganosa
**Arquivo**: `src/lib/prisma.ts` (linha 21)

```typescript
// Atual (enganoso):
.then(() => console.log('Conectado ao SQLite'))

// Corrigir para:
.then(() => console.log('✅ Prisma conectado ao banco de dados'))
```

#### 3.2 Validação de Campos no Register
**Arquivo**: `src/app/register/page.tsx`

Validações já implementadas:
- ✅ Campos obrigatórios
- ✅ Email válido (@)
- ✅ Senha mínima (6 caracteres)
- ✅ Confirmação de senha

#### 3.3 Tratamento de Erros
Todas as rotas já possuem:
- ✅ Try/catch adequados
- ✅ Logs seguros (sem payloads null)
- ✅ Mensagens de erro apropriadas
- ✅ Status codes corretos

### Fase 4: Configuração de Email 📧

**Arquivo**: `src/lib/email.ts`

Variáveis necessárias no `.env`:
```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
EMAIL_FROM_NAME=Katsu
EMAIL_FROM_ADDRESS=oi@k17.com.br
```

**Fallback atual**: Se email falhar, registro continua (correto para dev)

## 🚀 Execução Imediata

### Comando para sincronizar banco:

```bash
node sync-db.js
```

Este script irá:
1. Gerar o Prisma Client atualizado
2. Aplicar o schema ao banco PostgreSQL
3. Criar todas as colunas e tabelas faltantes
4. Exibir instruções de próximos passos

### Após sincronização:

1. **Reiniciar servidor dev**
   ```bash
   # Ctrl+C no terminal do servidor
   npm run dev
   ```

2. **Testar fluxo completo**
   - Acesse `http://localhost:3000/register?callbackUrl=%2F`
   - Preencha o formulário
   - Verifique auto-login e redirect
   - Teste logout e login manual

## 📝 Checklist de Validação

### Banco de Dados
- [ ] Schema sincronizado com Prisma
- [ ] Todas as colunas User existem
- [ ] Tabelas Xase Core criadas
- [ ] Índices aplicados

### Autenticação
- [ ] Register funcionando (200)
- [ ] Login funcionando
- [ ] Logout funcionando
- [ ] Forgot password funcionando
- [ ] Reset password funcionando
- [ ] Sessão JWT persistindo

### UI/UX
- [ ] Design consistente (login/register)
- [ ] CallbackUrl preservado
- [ ] Traduções i18n funcionando
- [ ] Links entre páginas corretos
- [ ] Mensagens de erro claras

### Segurança
- [ ] Senhas com hash bcrypt
- [ ] Tokens criptograficamente seguros
- [ ] Validação de inputs
- [ ] Rate limiting (considerar adicionar)
- [ ] CSRF protection (NextAuth já possui)

## 🔒 Riscos Mitigados

1. ✅ **Payload null em logs**: Corrigido com fallback
2. ✅ **Body parsing**: Validação segura implementada
3. ✅ **Colunas faltantes**: Será resolvido com sync
4. ✅ **Erros sem contexto**: Debug messages em dev
5. ✅ **Redirect quebrado**: CallbackUrl preservado

## 📚 Documentação de Referência

- **NextAuth**: https://next-auth.js.org/
- **Prisma**: https://www.prisma.io/docs
- **bcryptjs**: https://github.com/dcodeIO/bcrypt.js

## 🎉 Resultado Esperado

Após executar o plano:
- ✅ Registro de usuários funcionando 100%
- ✅ Login/logout funcionando
- ✅ Reset de senha funcionando
- ✅ Todos os fluxos testados e validados
- ✅ Zero erros no console
- ✅ Experiência de usuário fluida
