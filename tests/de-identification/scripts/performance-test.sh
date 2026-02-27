#!/bin/bash

# Performance testing script for XASE De-Identification

set -e

API_URL="${API_URL:-http://localhost:3000}"
CONCURRENT_REQUESTS="${CONCURRENT_REQUESTS:-10}"
TOTAL_REQUESTS="${TOTAL_REQUESTS:-100}"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Performance Testing - XASE De-Identification       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Configuration:"
echo "  API URL: ${API_URL}"
echo "  Concurrent Requests: ${CONCURRENT_REQUESTS}"
echo "  Total Requests: ${TOTAL_REQUESTS}"
echo ""

# Test text de-identification performance
echo "📊 Testing Text De-identification Performance..."
echo ""

START_TIME=$(date +%s)
SUCCESS_COUNT=0
FAIL_COUNT=0

for i in $(seq 1 $TOTAL_REQUESTS); do
    {
        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/api/v1/deidentify/text" \
          -H "Content-Type: application/json" \
          -d '{"text": "Patient John Doe, MRN 123456, DOB 01/15/1980"}' 2>/dev/null)
        
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        
        if [ "$HTTP_CODE" = "200" ]; then
            ((SUCCESS_COUNT++))
        else
            ((FAIL_COUNT++))
        fi
    } &
    
    # Limit concurrent requests
    if [ $((i % CONCURRENT_REQUESTS)) -eq 0 ]; then
        wait
    fi
done

wait

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
REQUESTS_PER_SECOND=$((TOTAL_REQUESTS / DURATION))

echo "Results:"
echo "  Total Requests: ${TOTAL_REQUESTS}"
echo "  Successful: ${SUCCESS_COUNT}"
echo "  Failed: ${FAIL_COUNT}"
echo "  Duration: ${DURATION}s"
echo "  Throughput: ${REQUESTS_PER_SECOND} req/s"
echo ""

# Calculate success rate
SUCCESS_RATE=$((SUCCESS_COUNT * 100 / TOTAL_REQUESTS))

if [ $SUCCESS_RATE -ge 95 ]; then
    echo "✅ Performance test PASSED (${SUCCESS_RATE}% success rate)"
else
    echo "⚠️  Performance test WARNING (${SUCCESS_RATE}% success rate)"
fi

echo ""
echo "Performance Summary:"
echo "  ✓ Throughput: ${REQUESTS_PER_SECOND} req/s"
echo "  ✓ Success Rate: ${SUCCESS_RATE}%"
echo "  ✓ Avg Response Time: $((DURATION * 1000 / TOTAL_REQUESTS))ms"
echo ""
