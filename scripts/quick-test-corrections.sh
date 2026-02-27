#!/bin/bash

# Script de Teste Rápido - Desenvolvimento
# Abre todas as páginas corrigidas no navegador para validação visual

echo "🚀 Abrindo páginas corrigidas para teste visual..."
echo ""

BASE_URL="http://localhost:3000"

# Verificar se o servidor está rodando
if ! curl -s "$BASE_URL" > /dev/null 2>&1; then
    echo "❌ Servidor não está rodando em $BASE_URL"
    echo ""
    echo "Execute primeiro: npm run dev"
    exit 1
fi

echo "✅ Servidor detectado em $BASE_URL"
echo ""

# Páginas para testar
PAGES=(
    "/pricing"
    "/app/marketplace/request-access"
    "/app/billing/usage"
    "/app/marketplace/governed-access"
    "/app/billing"
)

DESCRIPTIONS=(
    "Pricing (USD, nomes técnicos)"
    "Request Access (contraste)"
    "Billing Usage (contraste, USD)"
    "Governed Access (bg transparente)"
    "Billing Dashboard (sem erro Redis)"
)

echo "📋 Páginas a serem abertas:"
for i in "${!PAGES[@]}"; do
    echo "  $((i+1)). ${DESCRIPTIONS[$i]}"
    echo "     ${BASE_URL}${PAGES[$i]}"
done
echo ""

read -p "Pressione ENTER para abrir todas as páginas no navegador..."

# Abrir cada página
for i in "${!PAGES[@]}"; do
    URL="${BASE_URL}${PAGES[$i]}"
    echo "🌐 Abrindo: ${DESCRIPTIONS[$i]}"
    
    # Detectar OS e abrir navegador
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open "$URL"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        xdg-open "$URL"
    else
        # Windows
        start "$URL"
    fi
    
    # Pequeno delay entre aberturas
    sleep 1
done

echo ""
echo "✅ Todas as páginas foram abertas!"
echo ""
echo "📝 Checklist de Validação:"
echo ""
echo "Pricing Page:"
echo "  [ ] Preços em USD (\$3,000, \$9,000)"
echo "  [ ] Planos: Development, Clinical, Hospital Network"
echo "  [ ] Processing units em USD"
echo "  [ ] FAQ técnico"
echo ""
echo "Request Access:"
echo "  [ ] Contraste adequado (texto escuro)"
echo "  [ ] Trust indicators legíveis"
echo ""
echo "Billing Usage:"
echo "  [ ] Contraste adequado em todos os textos"
echo "  [ ] Botões com border-gray-900"
echo "  [ ] Valores em USD"
echo "  [ ] Referência a 'Clinical plan'"
echo ""
echo "Governed Access:"
echo "  [ ] Risk Class com bg transparente"
echo "  [ ] Sem filtro 'Max Price'"
echo ""
echo "Billing Dashboard:"
echo "  [ ] Carrega sem erro no console"
echo "  [ ] Sem erro 'redis.zrangebyscore'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Para validação automática, execute:"
echo "  ./scripts/validate-billing-corrections.sh"
echo ""
