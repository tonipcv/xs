#!/bin/bash

# Script de Validação Rápida das Correções de Billing/UX
# Verifica se todas as correções foram aplicadas corretamente

echo "🔍 Validando Correções de Billing/UX..."
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Função para verificar string em arquivo
check_file_contains() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} $description"
    else
        echo -e "${RED}❌${NC} $description"
        ((ERRORS++))
    fi
}

# Função para verificar que string NÃO existe em arquivo
check_file_not_contains() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if ! grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} $description"
    else
        echo -e "${RED}❌${NC} $description - Pattern ainda existe: $pattern"
        ((ERRORS++))
    fi
}

echo "📋 1. Verificando Pricing Page (USD e nomes técnicos)..."
check_file_contains "src/app/pricing/page.tsx" "Development" "Plano Development existe"
check_file_contains "src/app/pricing/page.tsx" "Clinical" "Plano Clinical existe"
check_file_contains "src/app/pricing/page.tsx" "Hospital Network" "Plano Hospital Network existe"
check_file_contains "src/app/pricing/page.tsx" '\$3,000' "Preço Development em USD"
check_file_contains "src/app/pricing/page.tsx" '\$9,000' "Preço Clinical em USD"
check_file_not_contains "src/app/pricing/page.tsx" "R\$" "Sem referências a BRL (R$)"
check_file_not_contains "src/app/pricing/page.tsx" "Basic" "Sem plano 'Basic'"
check_file_not_contains "src/app/pricing/page.tsx" "Professional" "Sem plano 'Professional'"
echo ""

echo "📋 2. Verificando Request Access (contraste)..."
check_file_contains "src/app/app/marketplace/request-access/page.tsx" 'text-gray-900' "Contraste adequado implementado"
check_file_contains "src/app/app/marketplace/request-access/page.tsx" 'className="text-gray-900"' "CardDescription com contraste"
check_file_not_contains "src/app/app/marketplace/request-access/page.tsx" 'text-gray-600.*Fill out the form' "Sem text-gray-600 em descrições principais"
echo ""

echo "📋 3. Verificando Billing Usage (contraste e USD)..."
check_file_contains "src/app/app/billing/usage/page.tsx" 'dicom_per_1k: 8' "Rate DICOM em USD (8)"
check_file_contains "src/app/app/billing/usage/page.tsx" 'fhir_per_1k: 3.20' "Rate FHIR em USD (3.20)"
check_file_contains "src/app/app/billing/usage/page.tsx" 'base_monthly: 9000' "Base monthly em USD (9000)"
check_file_contains "src/app/app/billing/usage/page.tsx" "en-US" "Formatação USD (en-US)"
check_file_contains "src/app/app/billing/usage/page.tsx" 'border-gray-900 text-gray-900' "Botões com contraste adequado"
check_file_contains "src/app/app/billing/usage/page.tsx" 'Clinical plan' "Referência a Clinical plan"
check_file_not_contains "src/app/app/billing/usage/page.tsx" 'pt-BR' "Sem formatação BRL (pt-BR)"
check_file_not_contains "src/app/app/billing/usage/page.tsx" 'Professional plan' "Sem referência a Professional"
echo ""

echo "📋 4. Verificando Governed Access (bg transparente)..."
check_file_contains "src/app/app/marketplace/governed-access/page.tsx" 'bg-transparent' "Risk Class com bg-transparent"
check_file_not_contains "src/app/app/marketplace/governed-access/page.tsx" 'Max Price.*per hour' "Sem filtro Max Price"
echo ""

echo "📋 5. Verificando BillingUsageChart (contraste)..."
check_file_contains "src/components/xase/BillingUsageChart.tsx" 'text-gray-900' "Contraste adequado implementado"
check_file_not_contains "src/components/xase/BillingUsageChart.tsx" 'text-gray-600.*Period:' "Sem text-gray-600 em labels principais"
echo ""

echo "📋 6. Verificando Redis Fix..."
check_file_contains "src/lib/redis.ts" 'zRangeByScore' "Método zRangeByScore adicionado"
check_file_contains "src/lib/redis.ts" 'async zRangeByScore(key: string, min: number, max: number)' "Assinatura correta do método"
echo ""

echo "📋 7. Verificando FAQ (linguagem técnica)..."
check_file_contains "src/app/pricing/page.tsx" 'unit-based pricing' "FAQ com linguagem técnica"
check_file_contains "src/app/pricing/page.tsx" 'quota limits' "FAQ com termos técnicos"
check_file_contains "src/app/pricing/page.tsx" 'Hospital Network tier' "FAQ referencia Hospital Network"
echo ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ TODAS AS CORREÇÕES VALIDADAS COM SUCESSO!${NC}"
    echo ""
    echo "📊 Resumo:"
    echo "  - Pricing em USD: ✅"
    echo "  - Nomes técnicos/hospitalares: ✅"
    echo "  - Contraste de fontes: ✅"
    echo "  - Background transparente: ✅"
    echo "  - Redis fix: ✅"
    echo "  - FAQ técnico: ✅"
    echo ""
    exit 0
else
    echo -e "${RED}❌ VALIDAÇÃO FALHOU - $ERRORS erro(s) encontrado(s)${NC}"
    echo ""
    echo "Por favor, revise os arquivos marcados com ❌"
    echo ""
    exit 1
fi
