#!/bin/bash

# XASE De-Identification - Full System Test
# Executa todos os testes e gera relatórios completos

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     XASE De-Identification - Full System Test             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Function to run test
run_test() {
    local test_name=$1
    local test_command=$2
    
    echo -e "${YELLOW}Running: ${test_name}${NC}"
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ ${test_name} passed${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ ${test_name} failed${NC}"
        ((FAILED++))
    fi
    echo ""
}

# 1. Download real DICOM data
echo "📥 Step 1: Downloading real DICOM data..."
npm run download:dicom-real
echo ""

# 2. Test DICOM Binary
run_test "DICOM Binary Tests" "npm run test:dicom-binary"

# 3. Test End-to-End
run_test "End-to-End Tests" "npm run test:e2e"

# 4. Test Advanced Benchmark
run_test "Advanced Benchmark" "npx ts-node src/advanced-benchmark.ts"

# 5. Complete Validation
run_test "Complete Validation" "npx ts-node src/complete-validation.ts"

# 6. Generate Quality Report
echo "📊 Generating quality report..."
npm run quality-report
echo ""

# 7. Generate Dashboard
echo "📈 Generating monitoring dashboard..."
npm run dashboard
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    Test Summary                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Total Tests:  $((PASSED + FAILED))"
echo -e "${GREEN}Passed:       ${PASSED}${NC}"
echo -e "${RED}Failed:       ${FAILED}${NC}"
echo ""

# Reports
echo "📄 Generated Reports:"
echo "  - Quality Report: output/quality-reports/quality-report.html"
echo "  - Dashboard: output/monitoring/dashboard.html"
echo "  - E2E Report: output/e2e/end-to-end-report.json"
echo "  - Benchmark: output/benchmark/advanced-benchmark-report.json"
echo "  - Validation: output/validation/complete-validation-report.json"
echo ""

# Exit code
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! System is ready for production.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review the reports.${NC}"
    exit 1
fi
