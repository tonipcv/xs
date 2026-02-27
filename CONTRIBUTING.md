# Contributing to XASE Sheets

**Versão:** 3.0.0  
**Última Atualização:** 26 de Fevereiro de 2024

---

## 🎯 Bem-vindo

Obrigado por considerar contribuir para o XASE Sheets! Este documento fornece diretrizes para contribuir com o projeto.

---

## 📋 Índice

- [Código de Conduta](#código-de-conduta)
- [Como Contribuir](#como-contribuir)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Setup de Desenvolvimento](#setup-de-desenvolvimento)
- [Workflow de Desenvolvimento](#workflow-de-desenvolvimento)
- [Padrões de Código](#padrões-de-código)
- [Testes](#testes)
- [Documentação](#documentação)
- [Pull Requests](#pull-requests)

---

## 📜 Código de Conduta

### Nossos Valores

- **Respeito:** Trate todos com respeito e profissionalismo
- **Colaboração:** Trabalhe em conjunto para alcançar objetivos comuns
- **Qualidade:** Mantenha altos padrões de qualidade em todo o código
- **Transparência:** Comunique-se abertamente sobre mudanças e decisões

### Comportamento Esperado

✅ Seja respeitoso e inclusivo  
✅ Aceite críticas construtivas  
✅ Foque no que é melhor para a comunidade  
✅ Mostre empatia com outros membros  

❌ Não use linguagem ofensiva  
❌ Não faça ataques pessoais  
❌ Não publique informações privadas de outros  
❌ Não faça spam ou trolling  

---

## 🤝 Como Contribuir

### Tipos de Contribuições

1. **Reportar Bugs**
   - Use o template de issue
   - Inclua passos para reproduzir
   - Descreva o comportamento esperado vs atual

2. **Sugerir Features**
   - Descreva o problema que resolve
   - Explique a solução proposta
   - Considere alternativas

3. **Melhorar Documentação**
   - Corrija erros de digitação
   - Adicione exemplos
   - Melhore clareza

4. **Contribuir com Código**
   - Corrija bugs
   - Implemente features
   - Melhore performance

---

## 📊 Estrutura do Projeto

```
xase-sheets/
├── app/                      # Frontend Next.js
│   ├── (authenticated)/      # Rotas autenticadas
│   ├── (public)/             # Rotas públicas
│   └── api/                  # API routes
│
├── lib/                      # Bibliotecas compartilhadas
│   ├── billing/              # Sistema de billing
│   ├── governance/           # Governança de dados
│   ├── auth/                 # Autenticação
│   └── utils/                # Utilitários
│
├── components/               # Componentes React
├── hooks/                    # React hooks
├── utils/                    # Utilitários gerais
│
├── tests/                    # Testes
│   ├── de-identification/    # Sistema de de-identificação
│   ├── insurance-demo/       # Demos
│   └── insurance-advanced/   # Testes avançados
│
├── sidecar/                  # Rust sidecar
├── packages/                 # Monorepo packages
│   ├── sdk-py/               # Python SDK
│   └── xase-cli/             # CLI tool
│
└── prisma/                   # Database schema
```

---

## 🚀 Setup de Desenvolvimento

### Pré-requisitos

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Rust 1.70+ (para sidecar)
- Python 3.11+ (para SDK)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/xase/xase-sheets
cd xase-sheets

# Instale dependências
npm install

# Configure variáveis de ambiente
cp .env.example .env
# Edite .env com suas configurações

# Setup database
npm run db:migrate
npm run db:seed

# Inicie o servidor de desenvolvimento
npm run dev
```

### Usando Makefile

```bash
# Setup completo
make setup

# Desenvolvimento
make dev

# Testes
make test

# Status
make status
```

---

## 🔄 Workflow de Desenvolvimento

### 1. Fork e Clone

```bash
# Fork no GitHub
# Clone seu fork
git clone https://github.com/SEU_USERNAME/xase-sheets
cd xase-sheets

# Adicione upstream
git remote add upstream https://github.com/xase/xase-sheets
```

### 2. Crie uma Branch

```bash
# Atualize main
git checkout main
git pull upstream main

# Crie branch feature
git checkout -b feature/nome-da-feature

# Ou branch fix
git checkout -b fix/nome-do-bug
```

### 3. Desenvolva

```bash
# Faça suas mudanças
# Teste localmente
npm run dev
npm run test

# Commit frequentemente
git add .
git commit -m "feat: adiciona nova funcionalidade"
```

### 4. Push e PR

```bash
# Push para seu fork
git push origin feature/nome-da-feature

# Crie Pull Request no GitHub
```

---

## 📝 Padrões de Código

### TypeScript/JavaScript

**Style Guide:**
- Use TypeScript sempre que possível
- Siga ESLint e Prettier
- Use const/let, nunca var
- Prefira arrow functions
- Use async/await sobre promises

**Exemplo:**
```typescript
// ✅ Bom
const fetchUser = async (id: string): Promise<User> => {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
};

// ❌ Ruim
function fetchUser(id) {
  return fetch('/api/users/' + id).then(r => r.json());
}
```

### React Components

**Padrões:**
- Use functional components
- Use hooks (useState, useEffect, etc.)
- Extraia lógica complexa em custom hooks
- Use TypeScript para props

**Exemplo:**
```typescript
// ✅ Bom
interface UserCardProps {
  user: User;
  onEdit: (id: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onEdit }) => {
  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <button onClick={() => onEdit(user.id)}>Edit</button>
    </div>
  );
};
```

### Naming Conventions

- **Componentes:** PascalCase (`UserCard.tsx`)
- **Hooks:** camelCase com use prefix (`useAuth.ts`)
- **Utilities:** camelCase (`formatDate.ts`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Types/Interfaces:** PascalCase (`User`, `UserProps`)

### Comentários

```typescript
// ✅ Bom - Explica o "porquê"
// Retry 3 times because API is flaky during peak hours
const MAX_RETRIES = 3;

// ❌ Ruim - Explica o "o quê" (óbvio)
// Set max retries to 3
const MAX_RETRIES = 3;
```

---

## 🧪 Testes

### Tipos de Testes

1. **Unit Tests**
   - Teste funções individuais
   - Use Jest
   - Coverage mínimo: 80%

2. **Integration Tests**
   - Teste fluxos completos
   - Use Playwright
   - Cubra casos principais

3. **E2E Tests**
   - Teste user journeys
   - Use Playwright
   - Cubra fluxos críticos

### Executando Testes

```bash
# Todos os testes
npm run test

# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# Com coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Escrevendo Testes

**Unit Test:**
```typescript
import { formatDate } from './utils';

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date('2024-02-26');
    expect(formatDate(date)).toBe('26/02/2024');
  });

  it('should handle invalid dates', () => {
    expect(formatDate(null)).toBe('Invalid date');
  });
});
```

**Integration Test:**
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { UserCard } from './UserCard';

describe('UserCard', () => {
  it('should call onEdit when button clicked', () => {
    const onEdit = jest.fn();
    const user = { id: '1', name: 'John' };
    
    render(<UserCard user={user} onEdit={onEdit} />);
    fireEvent.click(screen.getByText('Edit'));
    
    expect(onEdit).toHaveBeenCalledWith('1');
  });
});
```

---

## 📚 Documentação

### Tipos de Documentação

1. **README.md** - Overview do projeto
2. **API Documentation** - Endpoints e schemas
3. **Component Documentation** - Props e usage
4. **Code Comments** - Explicações inline

### Atualizando Documentação

- Atualize README.md para mudanças significativas
- Documente novas APIs
- Adicione exemplos de uso
- Mantenha changelog atualizado

### Exemplo de Documentação

```typescript
/**
 * Fetches user data from the API
 * 
 * @param id - User ID
 * @returns Promise resolving to User object
 * @throws {Error} If user not found
 * 
 * @example
 * ```typescript
 * const user = await fetchUser('123');
 * console.log(user.name);
 * ```
 */
export const fetchUser = async (id: string): Promise<User> => {
  // Implementation
};
```

---

## 🔀 Pull Requests

### Checklist

Antes de submeter um PR, certifique-se de:

- [ ] Código segue os padrões do projeto
- [ ] Todos os testes passam
- [ ] Adicionou testes para novas funcionalidades
- [ ] Documentação atualizada
- [ ] Commit messages seguem convenção
- [ ] Branch está atualizada com main
- [ ] Sem conflitos de merge

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: adiciona autenticação OAuth
fix: corrige bug no upload de arquivos
docs: atualiza README com novos exemplos
style: formata código com prettier
refactor: reorganiza estrutura de pastas
test: adiciona testes para UserCard
chore: atualiza dependências
```

### Template de PR

```markdown
## Descrição
Breve descrição das mudanças

## Tipo de Mudança
- [ ] Bug fix
- [ ] Nova feature
- [ ] Breaking change
- [ ] Documentação

## Como Testar
1. Passo 1
2. Passo 2
3. Resultado esperado

## Checklist
- [ ] Testes passam
- [ ] Documentação atualizada
- [ ] Código revisado
```

### Review Process

1. **Automated Checks**
   - Linting
   - Type checking
   - Tests
   - Build

2. **Code Review**
   - Pelo menos 1 aprovação
   - Sem mudanças solicitadas
   - CI/CD passa

3. **Merge**
   - Squash and merge
   - Delete branch após merge

---

## 🐛 Reportando Bugs

### Template de Bug Report

```markdown
## Descrição
Descrição clara do bug

## Passos para Reproduzir
1. Vá para '...'
2. Clique em '...'
3. Veja o erro

## Comportamento Esperado
O que deveria acontecer

## Comportamento Atual
O que está acontecendo

## Screenshots
Se aplicável

## Ambiente
- OS: [e.g. macOS 14]
- Browser: [e.g. Chrome 120]
- Version: [e.g. 3.0.0]

## Informações Adicionais
Qualquer contexto adicional
```

---

## 💡 Sugerindo Features

### Template de Feature Request

```markdown
## Problema
Qual problema isso resolve?

## Solução Proposta
Como você resolveria?

## Alternativas Consideradas
Outras opções que você pensou?

## Contexto Adicional
Screenshots, mockups, etc.
```

---

## 📞 Suporte

### Canais de Comunicação

- **GitHub Issues:** Bugs e features
- **GitHub Discussions:** Perguntas gerais
- **Email:** dev@xase.com
- **Slack:** #xase-dev (para contribuidores)

### Recursos

- [Documentação](https://docs.xase.com)
- [API Reference](https://api.xase.com/docs)
- [Exemplos](https://github.com/xase/examples)

---

## 🎓 Recursos para Aprender

### Tecnologias Principais

- [Next.js](https://nextjs.org/docs)
- [React](https://react.dev)
- [TypeScript](https://www.typescriptlang.org/docs)
- [Prisma](https://www.prisma.io/docs)
- [Rust](https://doc.rust-lang.org)

### Boas Práticas

- [Clean Code](https://github.com/ryanmcdermott/clean-code-javascript)
- [React Best Practices](https://react.dev/learn)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)

---

## 🙏 Agradecimentos

Obrigado a todos os contribuidores que ajudam a tornar o XASE Sheets melhor!

---

**Versão:** 3.0.0  
**Última Atualização:** 26 de Fevereiro de 2024  
**Licença:** Proprietária

🚀 **Feliz contribuição!** 🚀
