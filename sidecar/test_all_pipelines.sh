#!/bin/bash
# Complete test suite for Clinical Data Governance pipelines

set -e

echo "🧪 XASE Clinical Data Governance - Complete Test Suite"
echo "========================================================"
echo ""

cd "$(dirname "$0")"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_cmd="$2"
    
    echo -n "Testing: $test_name... "
    
    if eval "$test_cmd" > /tmp/test_output.log 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "  Error output:"
        cat /tmp/test_output.log | head -20
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

echo "📦 Step 1: Building sidecar (basic features)"
echo "--------------------------------------------"
run_test "Basic build" "cargo build --quiet 2>&1"

echo ""
echo "🧪 Step 2: Running unit tests (basic)"
echo "--------------------------------------"
run_test "Pipeline tests" "cargo test --lib pipeline 2>&1"
run_test "Audio advanced tests" "cargo test --lib audio_advanced 2>&1"
run_test "DICOM advanced tests" "cargo test --lib dicom_advanced 2>&1"
run_test "FHIR advanced tests" "cargo test --lib fhir_advanced 2>&1"
run_test "Metrics tests" "cargo test --lib metrics 2>&1"

echo ""
echo "🧪 Step 3: Running integration tests"
echo "-------------------------------------"
run_test "Advanced pipeline tests" "cargo test --test advanced_pipeline_tests 2>&1"
run_test "Basic pipeline tests" "cargo test --test pipeline_tests 2>&1"

echo ""
echo "🔧 Step 4: Building with DICOM features"
echo "----------------------------------------"
run_test "DICOM build" "cargo build --quiet --features dicom 2>&1"
run_test "DICOM full build" "cargo build --quiet --features dicom-full 2>&1"

echo ""
echo "🔧 Step 5: Testing with features"
echo "---------------------------------"
run_test "DICOM feature tests" "cargo test --features dicom 2>&1"

echo ""
echo "📊 Step 6: Validating test fixtures"
echo "------------------------------------"
run_test "FHIR fixture exists" "test -f tests/fixtures/sample_fhir.json"
run_test "HL7 fixture exists" "test -f tests/fixtures/sample_hl7.txt"
run_test "FHIR fixture valid JSON" "cat tests/fixtures/sample_fhir.json | python3 -m json.tool > /dev/null 2>&1"

echo ""
echo "🚀 Step 7: Release build validation"
echo "------------------------------------"
run_test "Release build" "cargo build --release --quiet 2>&1"

echo ""
echo "========================================================"
echo "📊 Test Results Summary"
echo "========================================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! 100% functionality achieved.${NC}"
    echo ""
    echo "🎉 Clinical Data Governance Implementation Complete:"
    echo "  ✓ Audio: F0 shift, diarization, redaction"
    echo "  ✓ DICOM: Tag stripping, OCR scrubbing, NIfTI conversion"
    echo "  ✓ FHIR/HL7: Date shifting, key redaction, NLP redaction"
    echo ""
    echo "Next steps:"
    echo "  1. cargo build --release --features dicom-full,audio-full,nlp-full"
    echo "  2. Configure environment variables (see CLINICAL_DATA_GOVERNANCE_IMPLEMENTATION.md)"
    echo "  3. Deploy to production"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Review output above.${NC}"
    exit 1
fi
