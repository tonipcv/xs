#!/bin/bash
###############################################################################
# XASE Sheets - Load Testing Runner
# Execute all k6 load tests with proper configuration
# F2-003: Load Testing (k6 - 100 a 1000 concurrent users)
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
SIDECAR_URL="${SIDECAR_URL:-http://localhost:8080}"
API_KEY="${API_KEY:-test-api-key}"
RESULTS_DIR="./load-test-results"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         XASE Sheets - Load Testing Suite                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}✗ k6 is not installed${NC}"
    echo -e "${YELLOW}Install k6: https://k6.io/docs/getting-started/installation/${NC}"
    exit 1
fi

echo -e "${GREEN}✓ k6 is installed${NC}"
echo -e "${BLUE}API URL: ${API_URL}${NC}"
echo -e "${BLUE}Sidecar URL: ${SIDECAR_URL}${NC}"
echo ""

# Create results directory
mkdir -p "$RESULTS_DIR"

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local description=$3
    
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Running: ${test_name}${NC}"
    echo -e "${BLUE}Description: ${description}${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local result_file="${RESULTS_DIR}/${test_name}_${timestamp}.json"
    local html_file="${RESULTS_DIR}/${test_name}_${timestamp}.html"
    
    # Run k6 test
    if k6 run \
        --out json="${result_file}" \
        -e API_URL="${API_URL}" \
        -e SIDECAR_URL="${SIDECAR_URL}" \
        -e API_KEY="${API_KEY}" \
        "${test_file}"; then
        
        echo ""
        echo -e "${GREEN}✓ ${test_name} completed successfully${NC}"
        echo -e "${BLUE}Results saved to: ${result_file}${NC}"
        
        # Generate HTML report if k6-reporter is available
        if command -v k6-reporter &> /dev/null; then
            k6-reporter "${result_file}" --output "${html_file}"
            echo -e "${BLUE}HTML report: ${html_file}${NC}"
        fi
        
        return 0
    else
        echo ""
        echo -e "${RED}✗ ${test_name} failed${NC}"
        return 1
    fi
}

# Test selection menu
echo -e "${YELLOW}Select test to run:${NC}"
echo "1) Streaming Test (100 concurrent users)"
echo "2) Marketplace Test (1000 concurrent users)"
echo "3) Sidecar Performance Test (350+ files/second)"
echo "4) Run All Tests"
echo "5) Exit"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        run_test "streaming" "k6-streaming.js" "100 concurrent users streaming data"
        ;;
    2)
        run_test "marketplace" "k6-marketplace.js" "1000 concurrent users browsing marketplace"
        ;;
    3)
        run_test "sidecar" "k6-sidecar.js" "Sidecar processing 350+ files/second"
        ;;
    4)
        echo -e "${BLUE}Running all load tests...${NC}"
        echo ""
        
        failed_tests=0
        
        run_test "streaming" "k6-streaming.js" "100 concurrent users streaming data" || ((failed_tests++))
        echo ""
        
        run_test "marketplace" "k6-marketplace.js" "1000 concurrent users browsing marketplace" || ((failed_tests++))
        echo ""
        
        run_test "sidecar" "k6-sidecar.js" "Sidecar processing 350+ files/second" || ((failed_tests++))
        echo ""
        
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}Load Testing Summary${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        
        if [ $failed_tests -eq 0 ]; then
            echo -e "${GREEN}✓ All tests passed${NC}"
        else
            echo -e "${RED}✗ ${failed_tests} test(s) failed${NC}"
        fi
        
        echo -e "${BLUE}Results directory: ${RESULTS_DIR}${NC}"
        ;;
    5)
        echo -e "${YELLOW}Exiting...${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Load Testing Complete                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
