#!/bin/bash
# Test Billing Hybrid System - Complete Flow
# Run: chmod +x scripts/test-billing-system.sh && ./scripts/test-billing-system.sh

set -e

echo "🧪 Testing Xase Billing Hybrid System"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://localhost:3000}"
SIDECAR_URL="${SIDECAR_URL:-https://aa-xase-sidecar.dpbdp1.easypanel.host}"

echo "📍 Base URL: $BASE_URL"
echo "📍 Sidecar URL: $SIDECAR_URL"
echo ""

# Test 1: JWKS Endpoint
echo "1️⃣  Testing JWKS endpoint..."
JWKS_RESPONSE=$(curl -s "$BASE_URL/.well-known/jwks.json")
if echo "$JWKS_RESPONSE" | grep -q "keys"; then
    echo -e "${GREEN}✓ JWKS endpoint working${NC}"
    echo "$JWKS_RESPONSE" | jq -r '.keys[0].kid' | sed 's/^/   Key ID: /'
else
    echo -e "${RED}✗ JWKS endpoint failed${NC}"
    echo "$JWKS_RESPONSE"
    exit 1
fi
echo ""

# Test 2: JWT Flow
echo "2️⃣  Testing JWT issuance and validation..."
JWT_RESPONSE=$(curl -s "$BASE_URL/api/test-jwt-flow")
if echo "$JWT_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ JWT flow working${NC}"
    echo "$JWT_RESPONSE" | jq -r '.test_results | to_entries[] | "   \(.key): \(.value)"'
else
    echo -e "${RED}✗ JWT flow failed${NC}"
    echo "$JWT_RESPONSE"
    exit 1
fi
echo ""

# Test 3: Sidecar /ready
echo "3️⃣  Testing Sidecar /ready endpoint..."
READY_RESPONSE=$(curl -s "$SIDECAR_URL/ready")
if echo "$READY_RESPONSE" | grep -q '"ready":true'; then
    echo -e "${GREEN}✓ Sidecar /ready working${NC}"
    # Print billing counters if present; otherwise show a short preview to avoid jq error
    if echo "$READY_RESPONSE" | jq -e '.billing_counters' >/dev/null 2>&1; then
        echo "$READY_RESPONSE" | jq -r '.billing_counters | to_entries[]? | "   \(.key): \(.value)"'
    else
        echo -e "${YELLOW}⚠ billing_counters not present in /ready (Sidecar build may be older). Showing preview:${NC}"
        # Try to show key fields if they exist; fallback to raw head
        echo "$READY_RESPONSE" | jq -r '. | {ready, version, ingestion_mode, data_pipeline} | to_entries[] | "   \(.key): \(.value)"' 2>/dev/null || echo "   $(echo "$READY_RESPONSE" | head -c 200)"
    fi
else
    echo -e "${RED}✗ Sidecar /ready failed${NC}"
    echo "$READY_RESPONSE"
    exit 1
fi
echo ""

# Test 4: Billing Report
echo "4️⃣  Testing billing report generation..."
BILLING_RESPONSE=$(curl -s "$BASE_URL/api/billing-report?tenant_id=test_tenant&month=2026-02")
if echo "$BILLING_RESPONSE" | grep -q '"tenant_id"'; then
    echo -e "${GREEN}✓ Billing report working${NC}"
    echo "$BILLING_RESPONSE" | jq -r '.billing_summary | to_entries[] | "   \(.key): \(.value)"'
    echo ""
    echo "$BILLING_RESPONSE" | jq -r '.estimated_charges | to_entries[] | "   \(.key): R$ \(.value)"'
else
    echo -e "${RED}✗ Billing report failed${NC}"
    echo "$BILLING_RESPONSE"
    exit 1
fi
echo ""

# Test 5: CSV Export
echo "5️⃣  Testing CSV export..."
CSV_FILE="/tmp/billing-test.csv"
curl -s "$BASE_URL/api/billing-report?tenant_id=test_tenant&month=2026-02&format=csv" -o "$CSV_FILE"
if [ -f "$CSV_FILE" ] && grep -q "Metric,Value" "$CSV_FILE"; then
    echo -e "${GREEN}✓ CSV export working${NC}"
    head -n 5 "$CSV_FILE" | sed 's/^/   /'
    rm "$CSV_FILE"
else
    echo -e "${RED}✗ CSV export failed${NC}"
    exit 1
fi
echo ""

# Summary
echo "======================================"
echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Apply migration: npx tsx database/scripts/apply-billing-snapshot-migration.ts"
echo "  2. Generate Prisma: npx prisma generate"
echo "  3. Configure production env vars (JWT keys, Sidecar URLs)"
echo "  4. Setup Vercel Cron for daily collection"
echo ""
echo "Documentation:"
echo "  - Complete guide: docs/BILLING_HYBRID_SYSTEM.md"
echo "  - Quick start: docs/BILLING_SETUP_QUICKSTART.md"
echo ""
