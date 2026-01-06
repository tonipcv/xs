# Xase Insurance Demo Run Report (2026-01-05)

## Overview
- Purpose: Run end-to-end insurance demos (Seed, Audit, Litigation, Tamper) directly via Node.
- Tenant: tenant_demo_insurance (demo-insurance@xase.local)
- Outcome: All demos executed successfully; reports generated.

## Environment
- Project: xase-dashboard
- Node: v20.x
- Prisma Client: 6.4.1
- Runner: tsx (npm scripts)
- Database: DATABASE_URL configured (Postgres)

## Timeline of Actions
1) Install and setup
- Commands:
  - npm install
  - npm run xase:setup (applied SQL migrations + prisma generate)

2) Seed demo data (1000 claims)
- Command: npm run demo:seed
- Output (excerpt):
  - "✅ Prisma conectado ao banco de dados"
  - "[seed] Using tenant cmk1cm1un0000i19k9vbsd8w7 (demo-insurance@xase.local)"
  - Progress: 100/1000 … 1000/1000
  - "[seed] Done."
- Notes: Hash chain preserved; created DecisionRecord + InsuranceDecision per claim.

3) Audit demo (FCA-style random 50 claims)
- Command: npm run demo:audit
- Duration: ~4-5s
- Reports:
  - tests/insurance-demo/reports/audit-2026-01-05T16-16-39-555Z.json
  - tests/insurance-demo/reports/audit-2026-01-05T16-16-39-555Z.md
  - tests/insurance-demo/reports/audit-2026-01-05T16-19-07-781Z.json
  - tests/insurance-demo/reports/audit-2026-01-05T16-19-07-781Z.md
- Contents: 50 selected decisions with transactionId, hashes, outcome, confidence, interventions count.

4) Litigation/Contest demo (side-by-side)
- Command: npm run demo:litigation
- Reports:
  - tests/insurance-demo/reports/litigation-2026-01-05T16-21-25-189Z.json
  - tests/insurance-demo/reports/litigation-2026-01-05T16-21-25-189Z.md
- Description: Finds a denied claim and a similar approved claim (same type, ~±20% amount).
- Example (from JSON excerpt):
  - Denied: AUTO £259,056 (REJECTED)
  - Approved: AUTO £228,933 (APPROVED)
- Hints: Placeholder counterfactual guidance; model metadata included when present.

5) Tamper detection demo
- Command: npm run demo:tamper
- First attempt: P1001 (DB connectivity) — transient; resolved on rerun.
- Second attempt: Success; reports generated.
- Reports:
  - tests/insurance-demo/reports/tamper-2026-01-05T16-22-23-586Z.json
  - tests/insurance-demo/reports/tamper-2026-01-05T16-22-23-586Z.md
- Description: Recomputes input/output/context hashes; simulates output change in-memory; shows mismatch vs stored recordHash.

## Commands Summary
```bash
# Setup
npm install
npm run xase:setup

# Seed data
npm run demo:seed

# Demos
npm run demo:audit
npm run demo:litigation
npm run demo:tamper
npm run demo:full  # runs audit demo
```

## Key Results
- Seed: 1000 claims across last 90 days with realistic distributions.
- Audit: <5 minutes objective; generated in ~4–5 seconds for 50-claim sample.
- Litigation: Produced comparable pairs (REJECTED vs APPROVED) with similarity criteria.
- Tamper: Verified hash mismatch detection on altered payloads.

## Artifacts Analysis

### Audit Report (audit-2026-01-05T16-19-07-781Z.json)
- Tenant: cmk1cm1un0000i19k9vbsd8w7 (demo-insurance@xase.local)
- Period: 2025-10-07T16:19:05.606Z → 2026-01-05T16:19:07.781Z
- Totals:
  - records_available: 1000
  - records_selected: 50
  - with_intervention: 0
- Sample items (decisionType=CLAIM):
  - txn_f8c53545… (AUTO £500000) → APPROVED, confidence=0.9763, impact=HIGH
  - txn_08ae9245… (AUTO £995) → REJECTED, confidence=0.6303, impact=LOW
  - txn_34c2a1ba… (LIABILITY £500000) → REJECTED, confidence=0.7599, impact=HIGH
  - txn_51fa3a98… (LIFE £55889) → APPROVED, confidence=0.9861, impact=HIGH
  - txn_076ecb57… (AUTO £393589) → APPROVED, confidence=0.8688, impact=HIGH
- Integrity fields present per item:
  - recordHash, previousHash, finalDecisionSource, hasHumanIntervention

### Litigation Report (litigation-2026-01-05T16-21-25-189Z.json)
- Denied claim:
  - Tx: txn_14c8ad7d0befe06c286bdcac27eca186
  - Type/Amount: AUTO £259,056
  - Outcome: REJECTED
  - Confidence: 0.6534
- Approved similar claim:
  - Tx: txn_b3f69abe088276744c26d5fd8c3496f8
  - Type/Amount: AUTO £228,933 (~−11.6%)
  - Outcome: APPROVED
  - Confidence: 0.9581
- Similarity criteria: claimType match + amount within 20%
- Counterfactual hint: adjust thresholds/rule factors (placeholder)

### Tamper Report (tamper-2026-01-05T16-22-23-586Z.json)
- Transaction: txn_a97ad4ac0bb7cb5a56bf4b36d0eccf35
- Correct recomputation:
  - inputHash: sha256:231bd201…
  - outputHash: sha256:382ceecc…
  - contextHash: sha256:32252ef3…
  - recordHash: e11cf7be…
  - matchesStored: true
- Simulated tamper (output +1):
  - tamperedOutputHash: sha256:8324dbc3…
  - tamperedRecordHash: 21d2ac71…
  - matchesStored: false
- Conclusion: Tamper detected via record hash mismatch

## Key Metrics Snapshot
- Decision coverage in sample: 50/50 (100%)
- Human interventions in sample: 0/50 (0%)
- Confidence range observed (sample excerpts): ~0.53 to ~0.99
- Financial impact categories observed: LOW/MEDIUM/HIGH across claim types
- Execution times observed:
  - Audit generation: ~4–5s (50 records)
  - Litigation pairing: instantaneous (single pair)
  - Tamper check: instantaneous (single record)

## Artifacts (Latest)
- Audit: tests/insurance-demo/reports/audit-2026-01-05T16-19-07-781Z.(json|md)
- Litigation: tests/insurance-demo/reports/litigation-2026-01-05T16-21-25-189Z.(json|md)
- Tamper: tests/insurance-demo/reports/tamper-2026-01-05T16-22-23-586Z.(json|md)

## Notes and Next Enhancements
- Add bundle export + offline verify into the audit script for one-click audit packages.
- Add CLI flags: --days, --count, --type to customize demos.
- Optionally capture snapshot payloads (externalData, businessRules, environment) during seed to exercise full reproducibility.

## Ownership
- Prepared by: Cascade Assistant (pair-programming with user)
- Date: 2026-01-05
