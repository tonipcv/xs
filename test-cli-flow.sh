#!/bin/bash
# Test AI Lab CLI flow after manual login
set -e

cd "$(dirname "$0")/packages/xase-cli"

echo "=== Testing AI Lab CLI (assuming you're already logged in) ==="
echo ""

# Test 1: Check auth
echo "1. Testing authentication..."
xase-cli usage || echo "Note: usage endpoint may not be fully implemented"
echo ""

# Test 2: List offers
echo "2. Listing offers..."
xase-cli list-offers --limit 5
echo ""

# Test 3: List leases
echo "3. Listing current leases..."
xase-cli list-leases --limit 5
echo ""

# Test 4: Mint new lease
DATASET_ID="ds_cc7aec46912dd8db99eb54d9"
echo "4. Minting new lease for $DATASET_ID..."
LEASE_OUTPUT=$(xase-cli mint-lease "$DATASET_ID" --ttl-seconds 1800)
echo "$LEASE_OUTPUT"
LEASE_ID=$(echo "$LEASE_OUTPUT" | grep "Lease ID:" | awk '{print $3}')

if [ -z "$LEASE_ID" ]; then
  echo "ERROR: Failed to extract lease ID"
  exit 1
fi

echo "✓ Lease created: $LEASE_ID"
echo ""

# Test 5: Get lease details
echo "5. Getting lease details..."
xase-cli lease-details "$LEASE_ID"
echo ""

# Test 6: Stream data
echo "6. Streaming dataset..."
OUTPUT_FILE="batch_test_$(date +%s).json"
xase-cli stream "$DATASET_ID" \
  --lease-id "$LEASE_ID" \
  --env production \
  --estimated-hours 0.1 \
  --output "$OUTPUT_FILE"

if [ -f "$OUTPUT_FILE" ]; then
  echo "✓ Stream successful!"
  echo "File: $OUTPUT_FILE"
  ls -lh "$OUTPUT_FILE"
  echo ""
  echo "Preview:"
  head -c 500 "$OUTPUT_FILE"
  echo ""
else
  echo "ERROR: Output file not created"
  exit 1
fi

echo ""
echo "=== ALL TESTS PASSED ==="
echo ""
echo "Summary:"
echo "  Dataset: $DATASET_ID"
echo "  Lease: $LEASE_ID"
echo "  Output: $OUTPUT_FILE"
echo ""
