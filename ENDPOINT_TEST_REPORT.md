# XASE Endpoint Test Report

**Generated:** 2026-02-17T14:43:36.044Z

## Summary

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Passed | 59 | 72.8% |
| ❌ Missing | 3 | 3.7% |
| ⚠️ Failed | 0 | 0.0% |
| ⏭️ Skipped | 19 | 23.5% |
| **Total** | **81** | **100%** |

## Coverage by Flow

### Flow 1: Registration and Authentication

**Coverage:** 8/9 (88.9%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/register` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/auth/register` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/login` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/auth/[...nextauth]` | ⏭️ SKIP | NextAuth internal |
| GET | `/profile` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/auth/2fa/setup` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/auth/2fa/verify` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/auth/forgot-password` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/auth/reset-password` | ✅ PASS | Endpoint exists (file check only) |

### Flow 2: AI Holder - Dataset Management

**Coverage:** 3/10 (30.0%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/xase/ai-holder/datasets` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/ai-holder/datasets/new` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/datasets` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/ai-holder/datasets/[id]` | ⏭️ SKIP | Missing required data: datasetId |
| GET | `/xase/ai-holder/datasets/[id]/upload` | ⏭️ SKIP | Missing required data: datasetId |
| POST | `/api/v1/datasets/[id]/upload` | ⏭️ SKIP | Missing required data: datasetId |
| POST | `/api/v1/datasets/[id]/process` | ⏭️ SKIP | Missing required data: datasetId |
| POST | `/api/v1/datasets/[id]/publish` | ⏭️ SKIP | Missing required data: datasetId |
| GET | `/xase/ai-holder/datasets/[id]/stream` | ⏭️ SKIP | Missing required data: datasetId |
| GET | `/xase/ai-holder/datasets/[id]/lab` | ⏭️ SKIP | Missing required data: datasetId |

### Flow 3: AI Holder - Policy + Offer

**Coverage:** 6/9 (66.7%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/xase/ai-holder/policies` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/ai-holder/policies/new` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/policies` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/policies/validate` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/ai-holder/policies/[id]/rewrite-rules` | ⏭️ SKIP | Missing required data: policyId |
| PUT | `/api/v1/policies/[id]/rewrite-rules` | ⏭️ SKIP | Missing required data: policyId |
| GET | `/xase/ai-holder/offers/new` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/datasets/[id]/access-offers` | ⏭️ SKIP | Missing required data: datasetId |
| GET | `/api/v1/access-offers` | ✅ PASS | Endpoint exists (file check only) |

### Flow 4: AI Lab - Lease + Training

**Coverage:** 6/10 (60.0%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/xase/ai-lab` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/ai-lab/marketplace` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/governed-access` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/governed-access/[offerId]` | ⏭️ SKIP | Missing required data: offerId |
| POST | `/api/v1/access-offers/[offerId]/execute` | ⏭️ SKIP | Missing required data: offerId |
| GET | `/xase/training/leases/[leaseId]` | ⏭️ SKIP | Missing required data: leaseId |
| POST | `/api/v1/leases/[leaseId]/extend` | ⏭️ SKIP | Missing required data: leaseId |
| POST | `/api/v1/sidecar/auth` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/ai-lab/usage` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/ai-lab/billing` | ✅ PASS | Endpoint exists (file check only) |

### Flow 5: Sidecar Integration

**Coverage:** 4/4 (100.0%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| POST | `/api/v1/sidecar/auth` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/sidecar/telemetry` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/api/v1/sidecar/kill-switch` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/sidecar/kill-switch` | ✅ PASS | Endpoint exists (file check only) |

### Flow 6: Evidence + Compliance

**Coverage:** 3/8 (37.5%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| POST | `/api/v1/executions/[id]/evidence` | ⏭️ SKIP | Missing required data: executionId |
| GET | `/xase/bundles` | ❌ MISSING | Endpoint file not found in codebase |
| GET | `/xase/bundles/[id]` | ⏭️ SKIP | Missing required data: bundleId |
| GET | `/api/xase/bundles/[id]/pdf` | ⏭️ SKIP | Missing required data: bundleId |
| GET | `/xase/bundles/[id]/pdf/preview` | ⏭️ SKIP | Missing required data: bundleId |
| POST | `/api/v1/watermark/detect` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/watermark/forensics` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/api/v1/audit/query` | ✅ PASS | Endpoint exists (file check only) |

### Flow 7: Consent Management

**Coverage:** 5/5 (100.0%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/xase/consent` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/consent/grant` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/api/v1/consent/status` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/api/v1/consent/preferences` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/consent/revoke` | ✅ PASS | Endpoint exists (file check only) |

### Flow 8: GDPR/Compliance

**Coverage:** 6/6 (100.0%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| POST | `/api/v1/compliance/gdpr/dsar` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/compliance/gdpr/erasure` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/compliance/gdpr/portability` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/compliance/bafin/ai-risk` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/compliance/fca/consumer-duty` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/compliance` | ✅ PASS | Endpoint exists (file check only) |

### Flow 9: Security/Access Control

**Coverage:** 5/7 (71.4%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/xase/security/rbac` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/rbac/roles` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/v1/break-glass/activate` | ❌ MISSING | Endpoint file not found in codebase |
| POST | `/api/v1/jit-access/request` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/api-keys` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/xase/api-keys` | ✅ PASS | Endpoint exists (file check only) |
| DELETE | `/api/xase/api-keys/[id]` | ❌ MISSING | Endpoint file not found in codebase |

### Flow 10: Billing + Ledger

**Coverage:** 6/6 (100.0%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/xase/usage-billing` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/api/v1/billing/usage` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/api/v1/ledger` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/api/webhook` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/api/user/premium-status` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/ai-holder/ledger` | ✅ PASS | Endpoint exists (file check only) |

### Flow 12: Voice Module

**Coverage:** 7/7 (100.0%)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/xase/voice` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/voice/datasets/new` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/voice/policies` | ✅ PASS | Endpoint exists (file check only) |
| POST | `/xase/voice/offers/new` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/voice/leases` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/voice/access-logs` | ✅ PASS | Endpoint exists (file check only) |
| GET | `/xase/voice/evidence/print` | ✅ PASS | Endpoint exists (file check only) |

## Missing Endpoints (Action Required)

The following 3 endpoints are referenced in the test flows but do not exist in the codebase:

| Method | Endpoint | Flow |
|--------|----------|------|
| GET | `/xase/bundles` | Flow 6: Evidence + Compliance |
| POST | `/api/v1/break-glass/activate` | Flow 9: Security/Access Control |
| DELETE | `/api/xase/api-keys/[id]` | Flow 9: Security/Access Control |

## Recommendations

1. **Implement missing endpoints** - 3 endpoints need to be created
2. **Add integration tests** - Current tests only check file existence
3. **Test with real HTTP requests** - Verify endpoints return correct status codes
4. **Add authentication flow** - Test protected endpoints with valid sessions
5. **Create test data** - Set up fixtures for testing data-dependent endpoints

