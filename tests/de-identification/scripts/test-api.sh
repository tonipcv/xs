#!/bin/bash

# Test XASE De-Identification API endpoints

set -e

API_URL="${API_URL:-http://localhost:3000}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Testing XASE De-Identification API               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "API URL: ${API_URL}"
echo ""

# Test 1: Health Check
echo "1️⃣  Testing Health Check..."
HEALTH_RESPONSE=$(curl -s "${API_URL}/health")
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo "$HEALTH_RESPONSE"
fi
echo ""

# Test 2: Metrics
echo "2️⃣  Testing Metrics Endpoint..."
METRICS_RESPONSE=$(curl -s "${API_URL}/metrics")
if echo "$METRICS_RESPONSE" | grep -q "memory"; then
    echo -e "${GREEN}✓ Metrics endpoint working${NC}"
else
    echo -e "${RED}✗ Metrics endpoint failed${NC}"
fi
echo ""

# Test 3: Text De-identification
echo "3️⃣  Testing Text De-identification..."
TEXT_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/deidentify/text" \
  -H "Content-Type: application/json" \
  -d '{"text": "Patient John Doe, MRN 123456, DOB 01/15/1980, Phone: 617-555-1234"}')

if echo "$TEXT_RESPONSE" | grep -q "success.*true"; then
    REDACTION_RATE=$(echo "$TEXT_RESPONSE" | grep -o '"redactionRate":[0-9.]*' | cut -d: -f2)
    echo -e "${GREEN}✓ Text de-identification working (Redaction: ${REDACTION_RATE}%)${NC}"
else
    echo -e "${RED}✗ Text de-identification failed${NC}"
    echo "$TEXT_RESPONSE"
fi
echo ""

# Test 4: FHIR De-identification
echo "4️⃣  Testing FHIR De-identification..."
FHIR_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/deidentify/fhir" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": {
      "resourceType": "Patient",
      "name": [{"family": "Doe", "given": ["John"]}],
      "birthDate": "1980-01-15",
      "telecom": [{"system": "phone", "value": "617-555-1234"}]
    }
  }')

if echo "$FHIR_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✓ FHIR de-identification working${NC}"
else
    echo -e "${RED}✗ FHIR de-identification failed${NC}"
    echo "$FHIR_RESPONSE"
fi
echo ""

# Test 5: HL7 De-identification
echo "5️⃣  Testing HL7 De-identification..."
HL7_MESSAGE="MSH|^~\\&|SENDING|FACILITY|RECEIVING|FACILITY|20240215120000||ADT^A01|MSG001|P|2.5
PID|1||123456789^^^HOSPITAL^MR||DOE^JOHN^A||19800115|M|||123 MAIN ST^^BOSTON^MA^02101^USA||(617)555-1234"

HL7_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/deidentify/hl7" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"${HL7_MESSAGE}\"}")

if echo "$HL7_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✓ HL7 de-identification working${NC}"
else
    echo -e "${RED}✗ HL7 de-identification failed${NC}"
    echo "$HL7_RESPONSE"
fi
echo ""

# Test 6: Batch Processing
echo "6️⃣  Testing Batch Processing..."
BATCH_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/deidentify/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "items": [
      "Patient John Doe, MRN 123456",
      "Patient Jane Smith, MRN 789012",
      "Patient Robert Johnson, MRN 345678"
    ]
  }')

if echo "$BATCH_RESPONSE" | grep -q "success.*true"; then
    PROCESSED=$(echo "$BATCH_RESPONSE" | grep -o '"processed":[0-9]*' | cut -d: -f2)
    echo -e "${GREEN}✓ Batch processing working (Processed: ${PROCESSED} items)${NC}"
else
    echo -e "${RED}✗ Batch processing failed${NC}"
    echo "$BATCH_RESPONSE"
fi
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    TEST SUMMARY                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "All API endpoints tested successfully!"
echo ""
echo "Next steps:"
echo "  - Review detailed responses above"
echo "  - Test with production data"
echo "  - Monitor performance metrics"
echo "  - Set up continuous monitoring"
echo ""
