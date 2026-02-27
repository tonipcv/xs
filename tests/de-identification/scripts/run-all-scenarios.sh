#!/bin/bash

# XASE De-Identification - Complete Test Suite Runner
# Executes all test scenarios and generates comprehensive reports

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     XASE De-Identification - Complete Test Suite          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found. Please install npm${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node --version)${NC}"
echo -e "${GREEN}✓ npm $(npm --version)${NC}"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Step 1: Generate test data
echo "📊 Step 1: Generating test data..."
npx ts-node src/download-datasets.ts
npx ts-node src/download-clinical-texts.ts
npx ts-node src/generate-audio-samples.ts
echo -e "${GREEN}✓ Test data generated${NC}"
echo ""

# Step 2: Run core tests
echo "🧪 Step 2: Running core de-identification tests..."
npm run test:all
echo -e "${GREEN}✓ Core tests completed${NC}"
echo ""

# Step 3: Run edge case tests
echo "🔬 Step 3: Running advanced edge case tests..."
npx ts-node src/advanced-edge-cases.ts
echo -e "${GREEN}✓ Edge case tests completed${NC}"
echo ""

# Step 4: Run scenario tests
echo "🎯 Step 4: Running scenario integration tests..."
npx ts-node src/scenario-tests.ts
echo -e "${GREEN}✓ Scenario tests completed${NC}"
echo ""

# Step 5: Run performance benchmarks
echo "⚡ Step 5: Running performance benchmarks..."
npx ts-node src/performance-benchmark.ts
echo -e "${GREEN}✓ Performance benchmarks completed${NC}"
echo ""

# Step 6: Run full integration test
echo "🔄 Step 6: Running full integration test..."
npx ts-node src/full-integration-test.ts
echo -e "${GREEN}✓ Full integration test completed${NC}"
echo ""

# Step 7: Generate monitoring dashboard
echo "📈 Step 7: Generating monitoring dashboard..."
npx ts-node src/monitoring-dashboard.ts
echo -e "${GREEN}✓ Dashboard generated${NC}"
echo ""

# Step 8: Generate summary report
echo "📄 Step 8: Generating summary report..."
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    TEST SUITE SUMMARY                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if reports exist
if [ -f "output/full-integration-report.json" ]; then
    REDACTION_RATE=$(jq -r '.summary.overallRedactionRate' output/full-integration-report.json)
    INTEGRITY_RATE=$(jq -r '.summary.overallIntegrityRate' output/full-integration-report.json)
    STATUS=$(jq -r '.status' output/full-integration-report.json)
    
    echo "Overall Redaction Rate: ${REDACTION_RATE}%"
    echo "Overall Integrity Rate: ${INTEGRITY_RATE}%"
    echo "Status: ${STATUS}"
    echo ""
    
    if [ "$STATUS" = "PRODUCTION_READY" ]; then
        echo -e "${GREEN}🎉 SYSTEM IS PRODUCTION READY!${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Review reports in output/ directory"
        echo "  2. Open dashboard: output/monitoring/dashboard.html"
        echo "  3. Follow PRODUCTION_DEPLOYMENT_GUIDE.md for deployment"
    else
        echo -e "${YELLOW}⚠️  System needs improvements before production${NC}"
        echo ""
        echo "Review recommendations in:"
        echo "  - output/full-integration-report.json"
        echo "  - COMPREHENSIVE_TEST_REPORT.md"
    fi
else
    echo -e "${YELLOW}⚠️  Integration report not found${NC}"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    GENERATED ARTIFACTS                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Reports:"
echo "  - output/comprehensive-report.json"
echo "  - output/test-summary.txt"
echo "  - output/full-integration-report.json"
echo "  - output/performance-benchmark.json"
echo ""
echo "Dashboard:"
echo "  - output/monitoring/dashboard.html"
echo ""
echo "De-identified Data:"
echo "  - output/dicom/"
echo "  - output/fhir/"
echo "  - output/text/"
echo "  - output/audio/"
echo ""
echo "Documentation:"
echo "  - README.md"
echo "  - USAGE_GUIDE.md"
echo "  - COMPREHENSIVE_TEST_REPORT.md"
echo "  - PRODUCTION_DEPLOYMENT_GUIDE.md"
echo ""
echo "✅ All tests completed successfully!"
echo ""
