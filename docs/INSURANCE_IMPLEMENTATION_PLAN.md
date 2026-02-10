# XASE Insurance Design Partner Implementation Plan
**Zero-Disruption Integration Strategy for UK/EU Insurance Companies**

---

## EXECUTIVE SUMMARY

**Goal:** Integrate Xase into insurance partner's existing operations with **zero disruption** to current workflows while providing immediate compliance value.

**Approach:** Shadow mode → Validation → Production cutover  
**Timeline:** 4-6 weeks from kickoff to production  
**Success Metric:** 100% decision coverage with <10ms latency overhead

---

## DESIGN PARTNER PROFILE

### Ideal First Partner

**Company Characteristics:**
- UK or EU-based insurance company
- 10,000+ automated decisions per month
- Claims automation or underwriting AI in production
- Regulatory pressure (FCA, BaFin, or EIOPA oversight)
- Technical team with API integration capability
- Compliance officer champion

**Use Cases (Priority Order):**
1. **Claims Automation** - Highest regulatory scrutiny
2. **Underwriting AI** - High-risk under EU AI Act
3. **Fraud Detection** - Explainability requirements
4. **Pricing Models** - Fairness concerns

**Decision Criteria:**
- ✅ Existing AI/ML in production
- ✅ Regulatory audit scheduled or ongoing
- ✅ Technical champion identified
- ✅ Budget allocated for compliance tooling
- ✅ Willingness to provide feedback

---

## PHASE 0: PRE-ENGAGEMENT (Week -2 to 0)

### Discovery & Scoping

**Objectives:**
- Understand current AI decision systems
- Identify integration points
- Define success criteria
- Establish communication channels

**Activities:**

#### 1. Technical Discovery Call (2 hours)
**Attendees:** CTO/VP Engineering, Lead ML Engineer, Compliance Officer

**Questions to Ask:**
```
Architecture:
- What ML frameworks do you use? (scikit-learn, TensorFlow, PyTorch, custom)
- Where do decisions happen? (API, batch, real-time)
- What's your current logging infrastructure?
- Do you store decision inputs/outputs?
- What's your deployment process?

Compliance:
- Have you been audited? By whom?
- What evidence do you provide to regulators?
- How do you track human interventions?
- Do you have model documentation?

Integration:
- What's your API authentication method?
- Do you have a staging environment?
- What's your change management process?
- What's your risk tolerance for new integrations?
```

#### 2. System Architecture Review
**Deliverable:** Integration architecture diagram

**Example Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│ Insurance Partner's Existing System                      │
│                                                           │
│  ┌──────────────┐      ┌──────────────┐                │
│  │ Claims API   │      │ Underwriting │                │
│  │              │      │ Service      │                │
│  └──────┬───────┘      └──────┬───────┘                │
│         │                     │                          │
│         │  Decision Flow      │                          │
│         ▼                     ▼                          │
│  ┌─────────────────────────────────┐                   │
│  │ ML Decision Engine              │                   │
│  │ (scikit-learn / TensorFlow)     │                   │
│  └─────────────┬───────────────────┘                   │
│                │                                         │
│                │ ◄─── INTEGRATION POINT                 │
│                │                                         │
└────────────────┼─────────────────────────────────────────┘
                 │
                 │ HTTPS POST (async, non-blocking)
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ XASE Evidence Infrastructure                             │
│                                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ POST /api/xase/v1/insurance/ingest               │  │
│  │ - Captures decision + context                     │  │
│  │ - Returns immediately (< 50ms)                    │  │
│  │ - Async processing in background                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Evidence Storage (S3/MinIO)                       │  │
│  │ - Immutable ledger                                │  │
│  │ - Cryptographic hashing                           │  │
│  │ - Snapshot storage                                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

#### 3. Integration Specification Document
**Deliverable:** Technical spec with code examples

**Contents:**
- API endpoints and authentication
- Data mapping (partner fields → Xase schema)
- Error handling and retry logic
- Performance SLAs
- Rollback procedures

---

## PHASE 1: SHADOW MODE (Weeks 1-2)

### Objective: Zero-Risk Evidence Capture

**Strategy:** Capture decisions without affecting production flow

### Implementation Steps

#### Step 1: API Key Provisioning (Day 1)
```bash
# Create tenant for partner
npm run xase:tenant "Partner Insurance Ltd" "tech@partner.com" "Partner Insurance Limited"

# Generate API key
curl -X POST http://xase.ai/api/xase/v1/api-keys \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "name": "Partner Production",
    "permissions": "ingest,verify,export",
    "rateLimit": 10000
  }'

# Provide to partner securely (1Password, Vault, etc.)
```

#### Step 2: SDK Integration (Days 2-3)

**Python Example** (for scikit-learn):
```python
# partner_ml_service.py
from xase import XaseClient
import os

# Initialize Xase client
xase = XaseClient(
    api_key=os.environ['XASE_API_KEY'],
    base_url='https://api.xase.ai',
    async_mode=True,  # Non-blocking
    retry_policy={'max_retries': 3, 'backoff': 'exponential'}
)

def process_claim(claim_data):
    """Existing claim processing function"""
    
    # 1. Existing ML prediction (unchanged)
    features = extract_features(claim_data)
    prediction = model.predict(features)
    decision = {
        'approved': bool(prediction[0]),
        'payout_amount': calculate_payout(claim_data, prediction),
        'confidence': float(model.predict_proba(features).max())
    }
    
    # 2. NEW: Capture evidence (async, non-blocking)
    try:
        xase.ingest_insurance_decision(
            input_data=features,
            output_data=decision,
            insurance_fields={
                'claim_number': claim_data['claim_number'],
                'claim_type': claim_data['claim_type'],
                'claim_amount': claim_data['amount'],
                'policy_number': claim_data['policy_number'],
                'decision_outcome': 'APPROVED' if decision['approved'] else 'REJECTED'
            },
            model_metadata={
                'model_id': 'claims_classifier_v2',
                'model_version': '2.1.0',
                'model_hash': get_model_hash()
            },
            snapshots={
                'external_data': get_external_data_snapshot(claim_data),
                'business_rules': get_business_rules_snapshot(),
                'environment': get_environment_snapshot()
            }
        )
    except Exception as e:
        # Log but don't fail the decision
        logger.warning(f"Xase ingest failed: {e}")
    
    # 3. Return decision (unchanged)
    return decision
```

**Key Principles:**
- ✅ Async/non-blocking (fire-and-forget)
- ✅ Try/catch to prevent failures
- ✅ No changes to decision logic
- ✅ Minimal performance impact (<10ms)

#### Step 3: Staging Environment Testing (Days 4-5)

**Test Plan:**
```bash
# 1. Smoke test (10 decisions)
python scripts/test_xase_integration.py --env staging --count 10

# 2. Load test (1000 decisions)
python scripts/test_xase_integration.py --env staging --count 1000 --concurrent 10

# 3. Verify evidence captured
curl https://api.xase.ai/api/xase/v1/records \
  -H "Authorization: Bearer PARTNER_API_KEY" \
  | jq '.records | length'
# Expected: 1010 records

# 4. Verify no production impact
# Check: API latency unchanged
# Check: Error rates unchanged
# Check: Decision accuracy unchanged
```

#### Step 4: Production Rollout (Days 6-10)

**Gradual Rollout Strategy:**

**Day 6: 1% of traffic**
```python
# Feature flag
XASE_ENABLED = os.environ.get('XASE_ENABLED', 'false') == 'true'
XASE_SAMPLE_RATE = float(os.environ.get('XASE_SAMPLE_RATE', '0.01'))

def process_claim(claim_data):
    decision = make_decision(claim_data)
    
    # Capture evidence for 1% of decisions
    if XASE_ENABLED and random.random() < XASE_SAMPLE_RATE:
        xase.ingest_insurance_decision(...)
    
    return decision
```

**Day 7: Monitor & validate**
- Check: Xase API latency < 50ms (p95)
- Check: No increase in partner API errors
- Check: Evidence captured correctly

**Day 8: 10% of traffic**
```bash
# Increase sample rate
export XASE_SAMPLE_RATE=0.10
```

**Day 9: 50% of traffic**
```bash
export XASE_SAMPLE_RATE=0.50
```

**Day 10: 100% of traffic**
```bash
export XASE_SAMPLE_RATE=1.0
```

---

## PHASE 2: VALIDATION (Weeks 3-4)

### Objective: Verify Evidence Quality

#### Week 3: Data Quality Audit

**Activities:**

1. **Completeness Check**
```sql
-- Check all required fields populated
SELECT 
  COUNT(*) as total_records,
  COUNT(claim_number) as has_claim_number,
  COUNT(policy_number) as has_policy_number,
  COUNT(external_data_snapshot_id) as has_external_data,
  COUNT(business_rules_snapshot_id) as has_business_rules
FROM xase_decision_records dr
LEFT JOIN xase_insurance_decisions id ON dr.id = id.record_id
WHERE dr.tenant_id = 'PARTNER_TENANT_ID'
  AND dr.timestamp > NOW() - INTERVAL '7 days';
```

2. **Hash Integrity Check**
```bash
# Verify chain integrity
node scripts/verify-chain.js --tenant PARTNER_TENANT_ID

# Verify snapshot hashes
node scripts/verify-snapshots.js --tenant PARTNER_TENANT_ID --sample 100
```

3. **Snapshot Quality Review**
```python
# Review sample snapshots
from xase import XaseClient

xase = XaseClient(api_key=PARTNER_API_KEY)

# Get recent records
records = xase.list_records(limit=10)

for record in records:
    # Retrieve snapshots
    external_data = xase.get_snapshot(record['external_data_snapshot_id'])
    business_rules = xase.get_snapshot(record['business_rules_snapshot_id'])
    
    # Validate completeness
    assert 'weather' in external_data  # Example field
    assert 'fraud_threshold' in business_rules
    
    print(f"✓ Record {record['transaction_id']} validated")
```

#### Week 4: Compliance Validation

**Activities:**

1. **Generate Test Compliance Report**
```bash
# Create evidence bundle for sample claims
curl -X POST https://api.xase.ai/api/xase/v1/bundles/create \
  -H "Authorization: Bearer PARTNER_API_KEY" \
  -d '{
    "dateFrom": "2026-01-01",
    "dateTo": "2026-01-31",
    "purpose": "COMPLIANCE_TEST",
    "legalFormat": "uk_insurance",
    "includesPdf": true
  }'

# Download and review
curl https://api.xase.ai/api/xase/bundles/BUNDLE_ID/download \
  -H "Authorization: Bearer PARTNER_API_KEY" \
  -o test-bundle.zip

# Extract and verify
unzip test-bundle.zip
node verify.js
```

2. **Compliance Officer Review**
- Present evidence bundle to compliance officer
- Walk through offline verification
- Demonstrate audit trail
- Show human intervention tracking

3. **Mock Regulatory Submission**
- Prepare evidence package as if for FCA audit
- Include: manifest, hashes, PDF report, verification script
- Review with legal counsel

---

## PHASE 3: HUMAN OVERSIGHT INTEGRATION (Week 5)

### Objective: Track Manual Reviews

#### Step 1: Identify Intervention Points

**Common Intervention Scenarios:**
- High-value claims (>£50k)
- Low-confidence decisions (<0.7)
- Fraud alerts
- Customer disputes
- Edge cases

#### Step 2: Integrate Intervention API

**Example: Claims Review Workflow**
```python
# claims_review_service.py
from xase import XaseClient

xase = XaseClient(api_key=PARTNER_API_KEY)

def handle_manual_review(claim_number, reviewer_email, decision, reason):
    """Called when human reviews a claim"""
    
    # 1. Find original decision
    record = xase.find_record_by_claim(claim_number)
    
    # 2. Record intervention
    xase.add_intervention(
        transaction_id=record['transaction_id'],
        action='OVERRIDE' if decision != record['output']['decision'] else 'APPROVED',
        reason=reason,
        notes=f"Reviewed by {reviewer_email}",
        new_outcome={'decision': decision} if decision != record['output']['decision'] else None
    )
    
    # 3. Update internal system
    update_claim_status(claim_number, decision)
```

#### Step 3: UI Integration (Optional)

**Option A: Xase UI** (Recommended for MVP)
- Partner's reviewers access Xase dashboard
- View pending reviews
- Add interventions directly

**Option B: Partner UI Integration**
- Embed Xase intervention widget
- Use Xase API from partner's review tool

---

## PHASE 4: PRODUCTION CUTOVER (Week 6)

### Objective: Full Production Deployment

#### Cutover Checklist

**Pre-Cutover (Day -1):**
- [ ] 100% traffic in shadow mode for 7+ days
- [ ] Zero production incidents related to Xase
- [ ] Evidence quality validated
- [ ] Compliance officer sign-off
- [ ] Rollback plan documented
- [ ] Support team trained

**Cutover Day:**
- [ ] Remove feature flags (always enabled)
- [ ] Enable human intervention tracking
- [ ] Configure alerts (Slack/email)
- [ ] Monitor for 24 hours

**Post-Cutover (Day +1 to +7):**
- [ ] Daily evidence quality checks
- [ ] Weekly compliance report review
- [ ] Gather feedback from reviewers
- [ ] Optimize performance if needed

---

## OPERATIONAL PROCEDURES

### Daily Operations

**For Partner's Team:**

1. **Morning Check** (5 minutes)
```bash
# Check yesterday's evidence capture
curl https://api.xase.ai/api/xase/v1/stats \
  -H "Authorization: Bearer PARTNER_API_KEY" \
  | jq '{decisions: .total_decisions, interventions: .human_interventions}'
```

2. **Weekly Compliance Report** (30 minutes)
```bash
# Generate weekly bundle
curl -X POST https://api.xase.ai/api/xase/v1/bundles/create \
  -H "Authorization: Bearer PARTNER_API_KEY" \
  -d '{
    "dateFrom": "2026-01-01",
    "dateTo": "2026-01-07",
    "purpose": "WEEKLY_COMPLIANCE",
    "legalFormat": "uk_insurance"
  }'

# Review in Xase dashboard
open https://dashboard.xase.ai/bundles
```

3. **Monthly Audit Prep** (2 hours)
- Generate monthly evidence bundle
- Review human intervention logs
- Check drift detection alerts
- Prepare summary for compliance officer

---

### Incident Response

**Scenario 1: Xase API Down**
```python
# Automatic fallback (already in code)
try:
    xase.ingest_insurance_decision(...)
except Exception as e:
    logger.error(f"Xase unavailable: {e}")
    # Decision continues normally
    # Evidence gap logged for later backfill
```

**Scenario 2: Evidence Gap Detected**
```bash
# Backfill missing evidence
python scripts/backfill_evidence.py \
  --start-date 2026-01-05 \
  --end-date 2026-01-06 \
  --source partner_db
```

**Scenario 3: Regulatory Audit Request**
```bash
# Generate audit package (< 5 minutes)
curl -X POST https://api.xase.ai/api/xase/v1/bundles/create \
  -H "Authorization: Bearer PARTNER_API_KEY" \
  -d '{
    "dateFrom": "2025-01-01",
    "dateTo": "2025-12-31",
    "purpose": "REGULATORY_AUDIT",
    "legalFormat": "uk_insurance",
    "includesPdf": true
  }'

# Download and submit to regulator
```

---

## SUCCESS METRICS

### Technical Metrics

**Week 1-2 (Shadow Mode):**
- ✅ 100% decision coverage
- ✅ <10ms latency overhead (p95)
- ✅ Zero production incidents
- ✅ <0.1% ingest failures

**Week 3-4 (Validation):**
- ✅ 100% chain integrity
- ✅ 100% snapshot completeness
- ✅ Zero hash mismatches
- ✅ Compliance officer approval

**Week 5-6 (Production):**
- ✅ 100% human interventions tracked
- ✅ <5 minute evidence bundle generation
- ✅ Regulatory audit-ready

### Business Metrics

**Immediate Value (Month 1):**
- Regulatory audit preparation time: 80% reduction
- Evidence completeness: 100% (vs. ~40% manual)
- Compliance officer confidence: High

**Long-Term Value (Month 3+):**
- Regulatory audit pass rate: 100%
- Audit preparation cost: 90% reduction
- Time to respond to regulator: <1 hour (vs. days)
- Risk of non-compliance fines: Eliminated

---

## SUPPORT & ESCALATION

### Support Tiers

**Tier 1: Self-Service** (Partner's team)
- Documentation: https://docs.xase.ai
- Dashboard: https://dashboard.xase.ai
- API reference: https://api.xase.ai/docs

**Tier 2: Email Support** (Xase team)
- Email: support@xase.ai
- SLA: 4 hours response time
- Coverage: 9am-6pm UK time, Mon-Fri

**Tier 3: Slack Channel** (Design partners only)
- Private Slack channel
- Direct access to engineering team
- Real-time support during integration

**Tier 4: Emergency Escalation**
- Phone: +44 XXX XXX XXXX
- 24/7 for production incidents
- CTO direct line

---

## PRICING & COMMERCIAL TERMS

### Design Partner Pricing

**Free Tier (First 6 Months):**
- Unlimited decisions
- Unlimited evidence bundles
- Full feature access
- Priority support
- Early access to new features

**Commitment:**
- Provide feedback (monthly calls)
- Case study participation
- Reference for future customers
- Logo usage permission

**Post-Design Partner Pricing:**
- Volume-based: £0.01-0.05 per decision
- Annual contract: 20% discount
- Enterprise SLA: +£5k/month

---

## RISK MITIGATION

### Technical Risks

| Risk | Mitigation | Rollback |
|------|-----------|----------|
| Xase API latency | Async mode, 50ms SLA | Remove integration |
| Xase API downtime | Try/catch, graceful degradation | Continue without evidence |
| Data privacy concerns | Tenant isolation, encryption | Hash-only mode |
| Integration bugs | Staging testing, gradual rollout | Feature flag disable |

### Business Risks

| Risk | Mitigation | Contingency |
|------|-----------|-------------|
| Regulatory rejection | Pre-validate with legal counsel | Alternative evidence format |
| Partner resistance | Executive sponsorship, ROI demo | Pilot with single use case |
| Competitive leak | NDA, private deployment | On-premise option |
| Scope creep | Fixed integration spec | Change order process |

---

## TIMELINE SUMMARY

```
Week -2: Discovery & Scoping
Week -1: Integration Specification
Week 1:  Shadow Mode (1% → 10%)
Week 2:  Shadow Mode (50% → 100%)
Week 3:  Data Quality Validation
Week 4:  Compliance Validation
Week 5:  Human Oversight Integration
Week 6:  Production Cutover
Week 7+: Ongoing Operations
```

**Total Time:** 6-8 weeks from kickoff to full production

---

## NEXT STEPS

1. **Identify Design Partner Candidates**
   - Target: 3-5 UK/EU insurance companies
   - Criteria: See "Design Partner Profile" above

2. **Schedule Discovery Calls**
   - Use discovery questions from Phase 0
   - Qualify technical and business fit

3. **Prepare Integration Materials**
   - SDK documentation
   - Code examples
   - Integration spec template

4. **Execute First Integration**
   - Follow this plan step-by-step
   - Document lessons learned
   - Iterate for next partner

---

## APPENDIX: CODE EXAMPLES

### A. Complete Python Integration

```python
# xase_integration.py
import os
import logging
from typing import Dict, Any, Optional
from xase import XaseClient, XaseError

logger = logging.getLogger(__name__)

class XaseIntegration:
    """Wrapper for Xase evidence capture"""
    
    def __init__(self):
        self.client = XaseClient(
            api_key=os.environ['XASE_API_KEY'],
            base_url=os.environ.get('XASE_BASE_URL', 'https://api.xase.ai'),
            async_mode=True,
            timeout=5.0,
            retry_policy={'max_retries': 3, 'backoff': 'exponential'}
        )
        self.enabled = os.environ.get('XASE_ENABLED', 'true') == 'true'
        self.sample_rate = float(os.environ.get('XASE_SAMPLE_RATE', '1.0'))
    
    def capture_decision(
        self,
        claim_data: Dict[str, Any],
        features: Dict[str, Any],
        decision: Dict[str, Any],
        model_metadata: Dict[str, str]
    ) -> Optional[str]:
        """Capture insurance decision evidence"""
        
        if not self.enabled:
            return None
        
        if random.random() > self.sample_rate:
            return None
        
        try:
            result = self.client.ingest_insurance_decision(
                input_data=features,
                output_data=decision,
                insurance_fields={
                    'claim_number': claim_data['claim_number'],
                    'claim_type': claim_data['claim_type'],
                    'claim_amount': claim_data['amount'],
                    'policy_number': claim_data['policy_number'],
                    'decision_outcome': 'APPROVED' if decision['approved'] else 'REJECTED',
                    'decision_impact_consumer_impact': self._assess_impact(decision)
                },
                model_metadata=model_metadata,
                snapshots={
                    'external_data': self._capture_external_data(claim_data),
                    'business_rules': self._capture_business_rules(),
                    'environment': self._capture_environment()
                }
            )
            
            logger.info(f"Evidence captured: {result['transaction_id']}")
            return result['transaction_id']
            
        except XaseError as e:
            logger.warning(f"Xase capture failed: {e}")
            # Don't fail the decision
            return None
    
    def _assess_impact(self, decision: Dict[str, Any]) -> str:
        """Assess consumer impact of decision"""
        amount = decision.get('payout_amount', 0)
        if amount > 50000:
            return 'HIGH'
        elif amount > 10000:
            return 'MEDIUM'
        else:
            return 'LOW'
    
    def _capture_external_data(self, claim_data: Dict[str, Any]) -> Dict[str, Any]:
        """Capture external data snapshot"""
        return {
            'weather_api': get_weather_data(claim_data['location']),
            'fraud_db': check_fraud_database(claim_data['policy_holder']),
            'credit_bureau': get_credit_score(claim_data['policy_holder'])
        }
    
    def _capture_business_rules(self) -> Dict[str, Any]:
        """Capture business rules snapshot"""
        return {
            'fraud_threshold': 0.8,
            'max_payout_ratio': 0.9,
            'manual_review_threshold': 50000,
            'rules_version': '2.1.0'
        }
    
    def _capture_environment(self) -> Dict[str, Any]:
        """Capture environment snapshot"""
        return {
            'app_version': os.environ.get('APP_VERSION', 'unknown'),
            'python_version': sys.version,
            'model_server': os.environ.get('MODEL_SERVER', 'unknown'),
            'deployment_id': os.environ.get('DEPLOYMENT_ID', 'unknown')
        }

# Usage in existing code
xase = XaseIntegration()

def process_claim(claim_data):
    features = extract_features(claim_data)
    decision = model.predict(features)
    
    # Capture evidence (async, non-blocking)
    xase.capture_decision(
        claim_data=claim_data,
        features=features,
        decision=decision,
        model_metadata={
            'model_id': 'claims_classifier_v2',
            'model_version': '2.1.0',
            'model_hash': get_model_hash()
        }
    )
    
    return decision
```

---

**END OF IMPLEMENTATION PLAN**

For questions or support during integration, contact:
- Email: support@xase.ai
- Slack: #design-partners (private channel)
- Phone: +44 XXX XXX XXXX (emergency only)
