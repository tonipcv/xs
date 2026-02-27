# Guia de Teste Visual - Contraste e UX

## 🎯 Objetivo

Validar visualmente todas as correções de contraste e UX implementadas.

---

## ✅ Checklist de Teste Visual

### 1. Pricing Page (`/pricing`)

**URL:** `http://localhost:3000/pricing`

#### Verificações de Contraste
- [ ] **Título principal** "Technical Pricing Model" - texto escuro, legível
- [ ] **Subtítulo** - texto cinza médio, legível
- [ ] **Cards de planos:**
  - [ ] Títulos dos planos (Development, Clinical, Hospital Network) - texto preto
  - [ ] Descrições - texto cinza escuro
  - [ ] Preços ($3,000, $9,000, On Request) - texto preto, grande
  - [ ] Features list - texto legível
  - [ ] Processing units - texto preto

#### Verificações de Conteúdo
- [ ] Planos chamados: Development, Clinical, Hospital Network (não Basic/Professional)
- [ ] Todos os preços em USD ($) não BRL (R$)
- [ ] Badge "Production" no plano Clinical
- [ ] Processing units:
  - [ ] DICOM Studies: $10/1k (Dev), $8/1k (Clinical), Contact sales (Hospital)
  - [ ] FHIR Records: $4/1k (Dev), $3.20/1k (Clinical), Contact sales (Hospital)
  - [ ] Audio Processing: $16/100min (Dev), $12.80/100min (Clinical), Contact sales (Hospital)
  - [ ] Document OCR: $3/1k (Dev), $2.40/1k (Clinical), Contact sales (Hospital)

#### Verificações de FAQ
- [ ] Perguntas técnicas (não marketing):
  - [ ] "How does unit-based pricing work?"
  - [ ] "What happens at quota limits?"
  - [ ] "Evidence bundle compliance?"
  - [ ] "Contract terms?"
  - [ ] "Outcome-based pricing available?"
- [ ] Respostas com linguagem técnica/hospitalar
- [ ] Texto das respostas em cinza escuro (text-gray-900)

---

### 2. Request Access (`/app/marketplace/request-access`)

**URL:** `http://localhost:3000/app/marketplace/request-access`

#### Verificações de Contraste
- [ ] **Título** "Request Access" - texto preto, legível
- [ ] **Descrição** abaixo do título - texto preto (não cinza claro)
- [ ] **Card headers:**
  - [ ] "Contact Information" - texto preto
  - [ ] Descrição do card - texto preto (não cinza claro)
- [ ] **Labels de formulário** - texto legível
- [ ] **Trust indicators** (24-48h, 99.7%, SOC 2):
  - [ ] Números grandes - texto preto
  - [ ] Descrições - texto preto (não cinza claro)

#### Teste de Legibilidade
```
Abra a página e verifique:
1. Todo texto é facilmente legível em fundo claro
2. Não há texto cinza claro em fundo branco/cinza claro
3. Contraste adequado em todos os elementos
```

---

### 3. Billing Usage Dashboard (`/app/billing/usage`)

**URL:** `http://localhost:3000/app/billing/usage`

#### Verificações de Contraste
- [ ] **Header:**
  - [ ] Título "Usage Dashboard" - texto preto
  - [ ] Período - texto preto (não cinza claro)
  - [ ] Botões "Export CSV" e "View Ledger":
    - [ ] Border cinza escuro (border-gray-900)
    - [ ] Texto cinza escuro
    - [ ] Hover muda para fundo escuro com texto branco

- [ ] **Estimated Invoice Card (azul):**
  - [ ] Título - texto azul escuro
  - [ ] Descrição - texto azul escuro (não azul claro)
  - [ ] Total em USD - texto azul escuro, grande
  - [ ] Mini-cards (Base, DICOM, FHIR, Audio, Text):
    - [ ] Labels - texto preto
    - [ ] Valores em USD - texto preto

- [ ] **Usage Metrics Cards:**
  - [ ] Títulos - texto preto
  - [ ] Valores - texto preto, grande
  - [ ] Descrições - texto preto (não cinza claro)
  - [ ] Barras de progresso coloridas e visíveis

- [ ] **Pricing Reference:**
  - [ ] Título "Clinical plan" (não "Professional")
  - [ ] Rates em USD
  - [ ] Todo texto em preto

- [ ] **Help Section:**
  - [ ] Ícones - cinza escuro (não cinza claro)
  - [ ] Títulos - texto preto
  - [ ] Descrições - texto preto

#### Verificações de Conteúdo
- [ ] Todos os valores em USD ($) não BRL (R$)
- [ ] Rates corretos:
  - [ ] DICOM: $8/1k
  - [ ] FHIR: $3.20/1k
  - [ ] Audio: $12.80/100min
  - [ ] Document OCR: $2.40/1k pages
- [ ] Referência a "Clinical plan" (não "Professional")
- [ ] Referência a "Hospital Network" (não "Enterprise")

---

### 4. Governed Access (`/app/marketplace/governed-access`)

**URL:** `http://localhost:3000/app/marketplace/governed-access`

#### Verificações de Contraste
- [ ] **Filtro Risk Class:**
  - [ ] Background transparente (não branco)
  - [ ] Texto do select legível
  - [ ] Options legíveis quando aberto

#### Verificações de Conteúdo
- [ ] Filtro "Max Price (per hour)" NÃO existe
- [ ] Apenas filtro "Risk Class" presente
- [ ] Cards de ofertas sem preço por hora

---

### 5. Billing Dashboard (`/app/billing`)

**URL:** `http://localhost:3000/app/billing`

#### Verificações Técnicas
- [ ] Página carrega sem erro
- [ ] Console do navegador sem erro "redis.zrangebyscore is not a function"
- [ ] Console sem erro "P2010"
- [ ] Dados de billing carregam corretamente

---

## 🎨 Padrão de Contraste Esperado

### Regra Geral
**Fundo claro → Texto escuro (text-gray-900)**

### Exemplos Corretos
```tsx
// ✅ CORRETO
<p className="text-gray-900">Descrição legível</p>
<CardDescription className="text-gray-900">Texto legível</CardDescription>
<Button className="border-gray-900 text-gray-900">Botão legível</Button>

// ❌ INCORRETO
<p className="text-gray-600">Texto difícil de ler</p>
<CardDescription>Texto sem contraste</CardDescription>
<Button className="border-gray-300">Botão sem contraste</Button>
```

### Cores Permitidas em Fundos Claros
- ✅ `text-gray-900` - Preto quase puro
- ✅ `text-blue-900` - Azul escuro (em cards azuis)
- ✅ `text-orange-900` - Laranja escuro (em alertas)
- ✅ `text-red-600` - Vermelho (em alertas críticos)
- ❌ `text-gray-600` - Cinza médio (evitar em fundos claros)
- ❌ `text-gray-500` - Cinza claro (evitar)
- ❌ `text-gray-400` - Cinza muito claro (nunca usar)

---

## 🧪 Teste de Acessibilidade

### Ferramentas Recomendadas

1. **Chrome DevTools - Lighthouse**
   ```
   1. Abrir DevTools (F12)
   2. Aba "Lighthouse"
   3. Selecionar "Accessibility"
   4. Run audit
   5. Verificar score de contraste
   ```

2. **Extensão WAVE**
   - Instalar: https://wave.webaim.org/extension/
   - Verificar contraste em todas as páginas
   - Score mínimo: AA (4.5:1 para texto normal)

3. **Teste Manual de Contraste**
   ```
   1. Abrir página
   2. Zoom out (Cmd/Ctrl + -)
   3. Verificar se todo texto ainda é legível
   4. Zoom in (Cmd/Ctrl + +)
   5. Verificar se não há pixelização
   ```

---

## 📊 Checklist de Validação Final

### Antes de Aprovar
- [ ] Todas as páginas testadas visualmente
- [ ] Script de validação passou (`./scripts/validate-billing-corrections.sh`)
- [ ] Build TypeScript passou (`npm run build`)
- [ ] Sem erros no console do navegador
- [ ] Contraste adequado em todas as páginas
- [ ] Preços em USD em todos os lugares
- [ ] Nomes técnicos/hospitalares implementados
- [ ] FAQ com linguagem técnica

### Testes de Regressão
- [ ] Login funciona
- [ ] Navegação entre páginas funciona
- [ ] Formulários submetem corretamente
- [ ] APIs respondem sem erro
- [ ] Billing dashboard carrega dados

---

## 🚨 Problemas Comuns

### Problema: Texto cinza claro em fundo claro
**Solução:** Trocar `text-gray-600` por `text-gray-900`

### Problema: Botões sem contraste
**Solução:** Adicionar `border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white`

### Problema: Background branco em select
**Solução:** Trocar `bg-white` por `bg-transparent`

### Problema: Erro Redis no billing dashboard
**Solução:** Verificar que `zRangeByScore` existe em `src/lib/redis.ts`

---

## 📝 Relatório de Teste

Após completar todos os testes, preencha:

```
Data: _______________
Testador: _______________

Páginas Testadas:
[ ] Pricing - Contraste OK
[ ] Request Access - Contraste OK
[ ] Billing Usage - Contraste OK
[ ] Governed Access - Background OK
[ ] Billing Dashboard - Sem erros

Problemas Encontrados:
_______________________________________
_______________________________________
_______________________________________

Status Final: [ ] APROVADO  [ ] REPROVADO

Assinatura: _______________
```

---

## 🎯 Critérios de Aprovação

### Obrigatórios (Bloqueantes)
- ✅ Contraste mínimo AA (4.5:1) em todo texto
- ✅ Sem erros no console
- ✅ Build TypeScript passa
- ✅ Todos os preços em USD

### Desejáveis (Não Bloqueantes)
- ✅ Score Lighthouse Accessibility > 90
- ✅ Nomes técnicos/hospitalares
- ✅ FAQ com linguagem técnica

---

**Última Atualização:** 2026-02-24  
**Versão:** 1.0  
**Autor:** Xase Engineering Team
