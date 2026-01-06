# XASE Comprehensive Testing Guide
**How to Verify Every Layer of the Evidence Infrastructure**

---

## TESTING PHILOSOPHY

**Goal:** Prove to regulators, auditors, and courts that the system is trustworthy.

**Principles:**
1. **Evidence-First:** Test what matters for legal proceedings
2. **Deterministic:** Same input → same output, always
3. **Independent:** Third-party verifiable
4. **Documented:** Every test has a compliance rationale

---

## PART 1: EVIDENCE CAPTURE TESTING

### 1.1 Basic Ingest Test

**What:** Verify decision is captured with correct hashes  
**Why:** Core functionality for all compliance claims

```bash
# Test: POST /api/xase/v1/records
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"age": 35, "income": 50000, "credit_score": 720},
    "output": {"decision": "APPROVED", "amount": 10000},
    "context": {"channel": "web", "timestamp": "2026-01-05T10:00:00Z"},
    "policyId": "credit_policy",
    "policyVersion": "v1.0",
    "decisionType": "CLAIM",
    "confidence": 0.95,
    "storePayload": true
  }'

# Expected Response:
{
  "success": true,
  "transaction_id": "txn_abc123...",
  "receipt_url": "http://localhost:3000/xase/receipt/txn_abc123...",
  "timestamp": "2026-01-05T10:00:00.000Z",
  "record_hash": "sha256:def456...",
  "chain_position": "chained"
}
```

**Verification:**
```bash
# 1. Check record exists in database
psql $DATABASE_URL -c "SELECT transaction_id, input_hash, output_hash, record_hash FROM xase_decision_records WHERE transaction_id = 'txn_abc123...';"

# 2. Verify hashes are correct
node scripts/verify-hashes.js txn_abc123...

# 3. Check audit log
psql $DATABASE_URL -c "SELECT action, resource_id, status FROM xase_audit_logs WHERE resource_id = 'txn_abc123...' ORDER BY timestamp DESC LIMIT 5;"
```

---

### 1.2 Idempotency Test

**What:** Verify duplicate requests return same result  
**Why:** Prevents duplicate evidence in ledger

```bash
# Test: Send same request twice with Idempotency-Key
IDEMPOTENCY_KEY="test-$(uuidgen)"

# First request
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": {"test": 1}, "output": {"result": "ok"}}'

# Second request (should return cached response)
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": {"test": 1}, "output": {"result": "ok"}}'

# Expected: Second response has header "X-Idempotency-Replay: true"
```

**Verification:**
```bash
# Only one record should exist
psql $DATABASE_URL -c "SELECT COUNT(*) FROM xase_decision_records WHERE transaction_id = '$IDEMPOTENCY_KEY';"
# Expected: 1
```

---

### 1.3 Insurance Ingest Test

**What:** Verify insurance-specific fields captured  
**Why:** Insurance vertical requires claim/policy metadata

```bash
# Test: POST /api/xase/v1/insurance/ingest
curl -X POST http://localhost:3000/api/xase/v1/insurance/ingest \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"claim_amount": 5000, "policy_type": "AUTO"},
    "output": {"decision": "APPROVED", "payout": 4500},
    "decisionType": "CLAIM",
    "insurance": {
      "claimNumber": "CLM-2026-001",
      "claimType": "AUTO",
      "claimAmount": 5000,
      "policyNumber": "POL-123456",
      "decisionOutcome": "APPROVED",
      "decisionImpactConsumerImpact": "HIGH"
    },
    "snapshots": {
      "externalData": {"weather": "rainy", "location": "London"},
      "businessRules": {"max_payout": 0.9, "fraud_threshold": 0.8}
    }
  }'
```

**Verification:**
```bash
# Check insurance decision exists
psql $DATABASE_URL -c "SELECT claim_number, claim_type, decision_outcome FROM xase_insurance_decisions WHERE claim_number = 'CLM-2026-001';"

# Check snapshots created
psql $DATABASE_URL -c "SELECT type, payload_hash FROM xase_evidence_snapshots WHERE tenant_id = 'YOUR_TENANT_ID' ORDER BY captured_at DESC LIMIT 2;"
```

---

## PART 2: IMMUTABILITY TESTING

### 2.1 Chain Integrity Test

**What:** Verify hash chain is unbroken  
**Why:** Core legal claim of immutability

```bash
# Test: Create 3 records and verify chain
for i in {1..3}; do
  curl -X POST http://localhost:3000/api/xase/v1/records \
    -H "Authorization: Bearer xase_pk_YOUR_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"input\": {\"test\": $i}, \"output\": {\"result\": $i}}"
  sleep 1
done

# Verify chain
node scripts/verify-chain.js
```

**Verification Script** (`scripts/verify-chain.js`):
```javascript
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function verifyChain() {
  const records = await prisma.decisionRecord.findMany({
    orderBy: { timestamp: 'asc' },
    take: 100,
  });

  console.log(`Verifying chain of ${records.length} records...`);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const prev = i > 0 ? records[i - 1] : null;

    // Verify previousHash matches
    if (prev && record.previousHash !== prev.recordHash) {
      console.error(`❌ Chain broken at record ${i}: previousHash mismatch`);
      return false;
    }

    // Verify recordHash is correct
    const combinedData = `${record.inputHash}${record.outputHash}${record.contextHash || ''}`;
    const expectedHash = chainHash(record.previousHash, combinedData);
    
    if (record.recordHash !== expectedHash) {
      console.error(`❌ Invalid recordHash at record ${i}`);
      return false;
    }

    console.log(`✓ Record ${i} valid`);
  }

  console.log('✅ Chain integrity verified');
  return true;
}

function chainHash(previousHash, currentData) {
  const data = previousHash ? `${previousHash}${currentData}` : currentData;
  return crypto.createHash('sha256').update(data).digest('hex');
}

verifyChain().then(() => process.exit(0)).catch(console.error);
```

---

### 2.2 Tamper Detection Test

**What:** Verify system detects modified records  
**Why:** Prove tamper-evident claims

```bash
# Test: Manually modify a record and verify detection
TRANSACTION_ID="txn_test123"

# 1. Create record
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -H "Idempotency-Key: $TRANSACTION_ID" \
  -d '{"input": {"test": 1}, "output": {"result": "ok"}}'

# 2. Manually tamper with database (simulate attack)
psql $DATABASE_URL -c "UPDATE xase_decision_records SET output_payload = '{\"result\": \"TAMPERED\"}' WHERE transaction_id = '$TRANSACTION_ID';"

# 3. Verify tampering detected
curl http://localhost:3000/api/xase/v1/verify/$TRANSACTION_ID \
  -H "Authorization: Bearer xase_pk_YOUR_KEY"

# Expected: "is_valid": false, "verification": {"output_hash": false}
```

---

### 2.3 KMS Signature Test

**What:** Verify cryptographic signatures  
**Why:** Legal non-repudiation

```bash
# Test: Create bundle and verify signature
TRANSACTION_ID="txn_test456"

# 1. Create record
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -H "Idempotency-Key: $TRANSACTION_ID" \
  -d '{"input": {"test": 1}, "output": {"result": "ok"}}'

# 2. Create bundle (triggers KMS signing)
curl -X POST http://localhost:3000/api/xase/v1/bundles/create \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -d '{"transactionIds": ["'$TRANSACTION_ID'"], "purpose": "TEST"}'

# 3. Download bundle and verify signature
# (See offline verification script in bundle)
```

---

## PART 3: REPRODUCIBILITY TESTING

### 3.1 Snapshot Storage Test

**What:** Verify snapshots stored and retrievable  
**Why:** Reproducibility requires complete context

```bash
# Test: Create record with snapshots
curl -X POST http://localhost:3000/api/xase/v1/insurance/ingest \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -d '{
    "input": {"test": 1},
    "output": {"result": "ok"},
    "snapshots": {
      "externalData": {"api": "weather", "response": {"temp": 20}},
      "businessRules": {"rule1": "value > 10"},
      "environment": {"version": "1.0.0", "config": {"debug": false}},
      "featureVector": [0.1, 0.2, 0.3]
    }
  }'

# Verify snapshots created
psql $DATABASE_URL -c "SELECT type, payload_hash, payload_size FROM xase_evidence_snapshots ORDER BY captured_at DESC LIMIT 4;"
```

**Verification:**
```bash
# Retrieve snapshot and verify hash
node scripts/verify-snapshot.js <snapshot_id>
```

---

### 3.2 Snapshot Deduplication Test

**What:** Verify identical snapshots reuse storage  
**Why:** Cost optimization without compromising integrity

```bash
# Test: Create two records with identical external data
SNAPSHOT_DATA='{"api": "weather", "response": {"temp": 20}}'

# First record
curl -X POST http://localhost:3000/api/xase/v1/insurance/ingest \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -d "{\"input\": {\"test\": 1}, \"output\": {\"result\": \"ok\"}, \"snapshots\": {\"externalData\": $SNAPSHOT_DATA}}"

# Second record (should reuse snapshot)
curl -X POST http://localhost:3000/api/xase/v1/insurance/ingest \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -d "{\"input\": {\"test\": 2}, \"output\": {\"result\": \"ok\"}, \"snapshots\": {\"externalData\": $SNAPSHOT_DATA}}"

# Verify only one snapshot created
psql $DATABASE_URL -c "SELECT COUNT(DISTINCT id) FROM xase_evidence_snapshots WHERE type = 'EXTERNAL_DATA' AND payload_hash = (SELECT payload_hash FROM xase_evidence_snapshots WHERE type = 'EXTERNAL_DATA' ORDER BY captured_at DESC LIMIT 1);"
# Expected: 1
```

---

## PART 4: HUMAN OVERSIGHT TESTING

### 4.1 Intervention Capture Test

**What:** Verify human interventions recorded  
**Why:** EU AI Act Article 14 compliance

```bash
# Test: Add human intervention
TRANSACTION_ID="txn_test789"

# 1. Create decision
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -H "Idempotency-Key: $TRANSACTION_ID" \
  -d '{"input": {"test": 1}, "output": {"result": "ok"}}'

# 2. Add intervention (via UI or API)
curl -X POST http://localhost:3000/api/records/$TRANSACTION_ID/intervene \
  -H "Cookie: next-auth.session-token=YOUR_SESSION" \
  -d '{
    "action": "OVERRIDE",
    "reason": "Manual review required due to edge case",
    "notes": "Customer called to dispute",
    "newOutcome": {"result": "MANUAL_REVIEW"}
  }'

# Verify intervention recorded
psql $DATABASE_URL -c "SELECT action, actor_email, reason, timestamp FROM xase_human_interventions WHERE record_id = (SELECT id FROM xase_decision_records WHERE transaction_id = '$TRANSACTION_ID');"
```

---

### 4.2 Derived Fields Test

**What:** Verify finalDecisionSource updated  
**Why:** Compliance reporting requires accurate attribution

```bash
# After intervention, check derived fields
psql $DATABASE_URL -c "SELECT has_human_intervention, final_decision_source FROM xase_decision_records WHERE transaction_id = '$TRANSACTION_ID';"
# Expected: has_human_intervention = true, final_decision_source = 'HUMAN_OVERRIDE'
```

---

## PART 5: AUDIT TRAIL TESTING

### 5.1 Audit Log Completeness Test

**What:** Verify all actions logged  
**Why:** Chain of custody for legal proceedings

```bash
# Test: Perform various actions and verify logging
TRANSACTION_ID="txn_audit_test"

# 1. Create record
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -H "Idempotency-Key: $TRANSACTION_ID" \
  -d '{"input": {"test": 1}, "output": {"result": "ok"}}'

# 2. Verify record
curl http://localhost:3000/api/xase/v1/verify/$TRANSACTION_ID \
  -H "Authorization: Bearer xase_pk_YOUR_KEY"

# 3. Create bundle
curl -X POST http://localhost:3000/api/xase/v1/bundles/create \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -d '{"transactionIds": ["'$TRANSACTION_ID'"]}'

# 4. Check audit log
psql $DATABASE_URL -c "SELECT action, resource_type, status, timestamp FROM xase_audit_logs WHERE resource_id = '$TRANSACTION_ID' OR metadata LIKE '%$TRANSACTION_ID%' ORDER BY timestamp;"
# Expected: RECORD_INGESTED, RECORD_VERIFIED, BUNDLE_CREATED
```

---

### 5.2 Audit Log Immutability Test

**What:** Verify audit logs cannot be modified  
**Why:** Legal requirement for tamper-proof audit trail

```bash
# Test: Try to modify audit log (should fail)
psql $DATABASE_URL -c "UPDATE xase_audit_logs SET status = 'TAMPERED' WHERE action = 'RECORD_INGESTED' LIMIT 1;"
# Expected: ERROR: permission denied (if trigger configured)
# OR: Manual verification that no UPDATE/DELETE allowed
```

---

## PART 6: BUNDLE EXPORT TESTING

### 6.1 Bundle Creation Test

**What:** Verify complete evidence package  
**Why:** Regulatory submission requires all artifacts

```bash
# Test: Create bundle with all artifacts
curl -X POST http://localhost:3000/api/xase/v1/bundles/create \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -d '{
    "transactionIds": ["txn_1", "txn_2", "txn_3"],
    "purpose": "REGULATORY_SUBMISSION",
    "legalFormat": "uk_eidas",
    "includesPdf": true
  }'

# Expected Response:
{
  "bundleId": "bundle_abc123",
  "status": "PROCESSING",
  "recordCount": 3
}

# Wait for processing
sleep 5

# Download bundle
curl http://localhost:3000/api/xase/bundles/bundle_abc123/download \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -o evidence-bundle.zip
```

**Verification:**
```bash
# Extract and verify bundle contents
unzip evidence-bundle.zip -d bundle-test/
cd bundle-test/

# Check required files
ls -la
# Expected: manifest.json, verify.js, payloads/, report.pdf

# Run offline verification
node verify.js
# Expected: ✅ Proof is VALID
```

---

### 6.2 Offline Verification Test

**What:** Verify bundle verifiable without Xase system  
**Why:** Legal requirement for independent verification

```bash
# Test: Verify bundle on air-gapped machine
# 1. Copy bundle to isolated environment
scp evidence-bundle.zip isolated-machine:/tmp/

# 2. On isolated machine (no internet)
ssh isolated-machine
cd /tmp
unzip evidence-bundle.zip
node verify.js

# Expected: All checks pass without network access
```

---

## PART 7: PERFORMANCE TESTING

### 7.1 Ingest Throughput Test

**What:** Verify system handles production load  
**Why:** SLA requirements for insurance partners

```bash
# Test: 1000 requests in 60 seconds
npm install -g autocannon

autocannon -c 10 -d 60 \
  -m POST \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -b '{"input": {"test": 1}, "output": {"result": "ok"}}' \
  http://localhost:3000/api/xase/v1/records

# Target: > 100 req/sec, p95 < 500ms
```

---

### 7.2 Verification Performance Test

**What:** Verify verification completes quickly  
**Why:** Auditor experience

```bash
# Test: Verify 100 records
time for i in {1..100}; do
  curl -s http://localhost:3000/api/xase/v1/verify/txn_$i \
    -H "Authorization: Bearer xase_pk_YOUR_KEY" > /dev/null
done

# Target: < 5 seconds total (50ms per record)
```

---

## PART 8: INTEGRATION TESTING

### 8.1 End-to-End Insurance Flow

**What:** Complete insurance claim workflow  
**Why:** Design partner validation

```bash
# Test: Full claim lifecycle
CLAIM_NUMBER="CLM-TEST-001"

# 1. Ingest claim decision
curl -X POST http://localhost:3000/api/xase/v1/insurance/ingest \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -d '{
    "input": {"claim_amount": 5000, "policy_type": "AUTO"},
    "output": {"decision": "APPROVED", "payout": 4500},
    "decisionType": "CLAIM",
    "insurance": {
      "claimNumber": "'$CLAIM_NUMBER'",
      "claimType": "AUTO",
      "claimAmount": 5000,
      "policyNumber": "POL-123456",
      "decisionOutcome": "APPROVED"
    }
  }'

# 2. Human review (override)
TRANSACTION_ID=$(psql $DATABASE_URL -t -c "SELECT transaction_id FROM xase_decision_records WHERE EXISTS (SELECT 1 FROM xase_insurance_decisions WHERE claim_number = '$CLAIM_NUMBER' AND record_id = xase_decision_records.id);")

curl -X POST http://localhost:3000/api/records/$TRANSACTION_ID/intervene \
  -H "Cookie: next-auth.session-token=YOUR_SESSION" \
  -d '{
    "action": "OVERRIDE",
    "reason": "Fraud detected in manual review",
    "newOutcome": {"decision": "REJECTED"}
  }'

# 3. Create compliance bundle
curl -X POST http://localhost:3000/api/xase/v1/bundles/create \
  -H "Authorization: Bearer xase_pk_YOUR_KEY" \
  -d '{
    "transactionIds": ["'$TRANSACTION_ID'"],
    "purpose": "REGULATORY_SUBMISSION",
    "legalFormat": "uk_insurance"
  }'

# 4. Verify complete audit trail
psql $DATABASE_URL -c "SELECT action, timestamp FROM xase_audit_logs WHERE resource_id = '$TRANSACTION_ID' OR metadata LIKE '%$TRANSACTION_ID%' ORDER BY timestamp;"
```

---

## PART 9: SECURITY TESTING

### 9.1 API Key Security Test

**What:** Verify API keys properly secured  
**Why:** Prevent unauthorized evidence creation

```bash
# Test: Invalid API key rejected
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "Authorization: Bearer invalid_key" \
  -d '{"input": {}, "output": {}}'
# Expected: 401 Unauthorized

# Test: Rate limiting enforced
for i in {1..1001}; do
  curl -s http://localhost:3000/api/xase/v1/records \
    -H "Authorization: Bearer xase_pk_YOUR_KEY" \
    -d '{"input": {}, "output": {}}' > /dev/null
done
# Expected: 429 Rate Limit Exceeded after 1000 requests
```

---

### 9.2 Tenant Isolation Test

**What:** Verify tenants cannot access each other's data  
**Why:** Multi-tenant security

```bash
# Test: Tenant A cannot access Tenant B's records
# 1. Create record as Tenant A
TENANT_A_KEY="xase_pk_tenant_a_key"
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "Authorization: Bearer $TENANT_A_KEY" \
  -H "Idempotency-Key: tenant-a-record" \
  -d '{"input": {"secret": "tenant_a"}, "output": {"result": "ok"}}'

# 2. Try to access as Tenant B
TENANT_B_KEY="xase_pk_tenant_b_key"
curl http://localhost:3000/api/xase/v1/verify/tenant-a-record \
  -H "Authorization: Bearer $TENANT_B_KEY"
# Expected: 404 Not Found
```

---

## PART 10: COMPLIANCE TESTING

### 10.1 EU AI Act Checklist

**Test:** Verify all Article 12 requirements met

```bash
# Run compliance checklist
node scripts/compliance-check.js

# Expected output:
# ✅ Record-keeping: Complete audit trail
# ✅ Traceability: Hash chain intact
# ✅ Auditability: Offline verification available
# ✅ Explicability: Explanation captured
# ✅ Human oversight: Intervention tracking
# ✅ Post-market monitoring: Drift detection configured
```

---

### 10.2 GDPR Article 22 Test

**What:** Verify right to explanation  
**Why:** GDPR compliance for automated decisions

```bash
# Test: Retrieve explanation for decision
TRANSACTION_ID="txn_gdpr_test"

curl http://localhost:3000/api/xase/v1/records/$TRANSACTION_ID \
  -H "Authorization: Bearer xase_pk_YOUR_KEY"

# Expected: Response includes "explanationJson" field with SHAP values
```

---

## TESTING CHECKLIST

### Pre-Production Checklist

- [ ] All evidence capture tests pass
- [ ] Chain integrity verified (100+ records)
- [ ] Tamper detection working
- [ ] KMS signatures valid
- [ ] Snapshots stored and retrievable
- [ ] Human interventions tracked
- [ ] Audit log complete and immutable
- [ ] Bundles export correctly
- [ ] Offline verification works
- [ ] Performance targets met
- [ ] Security tests pass
- [ ] Tenant isolation verified
- [ ] EU AI Act compliance confirmed
- [ ] GDPR Article 22 compliance confirmed

### Design Partner Checklist

- [ ] End-to-end insurance flow tested
- [ ] SDK integration tested
- [ ] Documentation complete
- [ ] Training materials ready
- [ ] Support process defined
- [ ] SLA commitments documented
- [ ] Escalation path defined
- [ ] Compliance certification ready

---

## AUTOMATED TESTING

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Xase Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run test:evidence-chain
      - run: npm run test:snapshots
      - run: npm run test:interventions
      - run: npm run test:bundles
      - run: npm run test:security
      - run: npm run test:compliance
```

---

## NEXT: See `INSURANCE_IMPLEMENTATION_PLAN.md` for design partner rollout
