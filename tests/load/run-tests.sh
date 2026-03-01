#!/bin/bash

# k6 Load Testing Runner
# Executes all load tests with proper configuration

set -e

echo "🚀 XASE Sheets Load Testing Suite"
echo "=================================="
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ k6 is not installed"
    echo "Install with: brew install k6 (macOS) or visit https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-test_api_key}"
RESULTS_DIR="./results"

# Create results directory
mkdir -p "$RESULTS_DIR"

echo "Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Results Dir: $RESULTS_DIR"
echo ""

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local output_file="$RESULTS_DIR/${test_name}-$(date +%Y%m%d-%H%M%S).json"
    
    echo "▶️  Running: $test_name"
    echo "   File: $test_file"
    echo "   Output: $output_file"
    echo ""
    
    k6 run \
        --out json="$output_file" \
        -e BASE_URL="$BASE_URL" \
        -e API_KEY="$API_KEY" \
        "$test_file"
    
    echo ""
    echo "✅ Completed: $test_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# Parse command line arguments
TEST_TYPE="${1:-all}"

case "$TEST_TYPE" in
    smoke)
        echo "🔥 Running Smoke Test (minimal load)"
        run_test "smoke" "api-endpoints.test.js"
        ;;
    
    load)
        echo "📊 Running Load Test (normal expected load)"
        run_test "load" "api-endpoints.test.js"
        ;;
    
    stress)
        echo "💪 Running Stress Test (pushing to limits)"
        run_test "stress" "stress-test.js"
        ;;
    
    spike)
        echo "⚡ Running Spike Test (sudden traffic surge)"
        run_test "spike" "spike-test.js"
        ;;
    
    auth)
        echo "🔐 Running Authentication Test"
        run_test "auth" "authentication.test.js"
        ;;
    
    all)
        echo "🎯 Running All Load Tests"
        echo ""
        
        run_test "api-endpoints" "api-endpoints.test.js"
        run_test "authentication" "authentication.test.js"
        run_test "stress" "stress-test.js"
        run_test "spike" "spike-test.js"
        
        echo ""
        echo "🎉 All tests completed!"
        ;;
    
    *)
        echo "❌ Unknown test type: $TEST_TYPE"
        echo ""
        echo "Usage: $0 [smoke|load|stress|spike|auth|all]"
        echo ""
        echo "Test Types:"
        echo "  smoke  - Minimal load to verify system works"
        echo "  load   - Normal expected load"
        echo "  stress - Push system to limits"
        echo "  spike  - Sudden traffic surge"
        echo "  auth   - Authentication flow"
        echo "  all    - Run all tests (default)"
        exit 1
        ;;
esac

echo ""
echo "📁 Results saved to: $RESULTS_DIR"
echo ""
echo "To analyze results:"
echo "  k6 inspect $RESULTS_DIR/[test-name].json"
echo ""
