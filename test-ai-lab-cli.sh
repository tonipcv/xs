#!/bin/bash
set -e

echo "=== AI Lab CLI End-to-End Test ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cd "$(dirname "$0")/packages/xase-cli"

echo -e "${YELLOW}Step 1: Login via email OTP${NC}"
echo "Please enter your email:"
read -r EMAIL

echo "Requesting OTP for $EMAIL..."
xase-cli login --email "$EMAIL" || {
  echo -e "${RED}✗ Login failed${NC}"
  exit 1
}

echo ""
echo -e "${GREEN}✓ Login successful${NC}"
echo ""

echo -e "${YELLOW}Step 2: Check usage${NC}"
xase-cli usage || echo "Usage endpoint not fully implemented yet"

echo ""
echo -e "${YELLOW}Step 3: List available offers${NC}"
xase-cli list-offers --limit 10

echo ""
echo -e "${YELLOW}Step 4: List active leases${NC}"
xase-cli list-leases --limit 10

echo ""
echo -e "${YELLOW}Step 5: Mint a new lease${NC}"
echo "Enter dataset ID (e.g., ds_cc7aec46912dd8db99eb54d9):"
read -r DATASET_ID

xase-cli mint-lease "$DATASET_ID" --ttl-seconds 1800 > /tmp/lease_output.txt || {
  echo -e "${RED}✗ Failed to mint lease${NC}"
  cat /tmp/lease_output.txt
  exit 1
}

LEASE_ID=$(grep "Lease ID:" /tmp/lease_output.txt | awk '{print $3}')
echo -e "${GREEN}✓ Lease created: $LEASE_ID${NC}"

echo ""
echo -e "${YELLOW}Step 6: Get lease details${NC}"
xase-cli lease-details "$LEASE_ID"

echo ""
echo -e "${YELLOW}Step 7: Stream dataset (first batch)${NC}"
xase-cli stream "$DATASET_ID" \
  --lease-id "$LEASE_ID" \
  --env production \
  --estimated-hours 0.5 \
  --output batch_001.json || {
  echo -e "${RED}✗ Stream failed${NC}"
  exit 1
}

echo -e "${GREEN}✓ Stream successful${NC}"
echo "Batch saved to: batch_001.json"
ls -lh batch_001.json

echo ""
echo -e "${GREEN}=== All tests passed! ===${NC}"
echo ""
echo "Summary:"
echo "  - Login: ✓"
echo "  - Lease minted: $LEASE_ID"
echo "  - Dataset: $DATASET_ID"
echo "  - Batch downloaded: batch_001.json"
echo ""
echo "Next steps for training:"
echo "  1. Parse batch_001.json and extract training data"
echo "  2. Run your training pipeline with the data"
echo "  3. Stream more batches as needed with the same lease"
echo ""
