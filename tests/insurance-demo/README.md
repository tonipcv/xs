# Insurance Demo Tests

This folder contains realistic end-to-end demo tests crafted for insurance stakeholders. The goal is to prove Xase answers the real scenarios they face, not just unit test code.

## Structure

```
/tests
  /insurance-demo
    /data
      seed-claims.ts        # generates realistic claims for a dedicated demo tenant
      scenarios.ts          # shared scenario helpers and constants
    /scripts
      run-audit-demo.ts     # simulates FCA audit of 50 random claims (last 90 days)
      run-litigation-demo.ts # (TODO) simulates litigation/contestability case
      run-tamper-demo.ts    # (TODO) simulates tamper/fraud detection
      run-full-demo.ts      # runs all available demos in sequence
    /reports
      (auto-generated outputs: manifests, summaries)
```

## How to Run

Prerequisites:
- Database up and accessible via DATABASE_URL
- Node.js + ts-node installed (npx is fine)
- Next.js server not required for these scripts (they use Prisma + internal libs)

Commands:

```bash
# 1) Seed realistic demo data (1000 claims spread across last 90 days)
npx ts-node tests/insurance-demo/data/seed-claims.ts

# 2) Run the FCA audit demo (selects 50 random decisions)
npx ts-node tests/insurance-demo/scripts/run-audit-demo.ts

# 3) Run the full demo suite (currently runs audit demo)
npx ts-node tests/insurance-demo/scripts/run-full-demo.ts
```

## Data Isolation

All test data is created under a dedicated tenant:
- name: tenant_demo_insurance
- email: demo-insurance@xase.local

Scripts only read/write records for this tenant to avoid mixing with real data.

## Notes

- Seed script creates DecisionRecord + InsuranceDecision with realistic distributions.
- Hash chaining is performed using the same crypto utilities as production to keep the ledger valid.
- Reports are written under tests/insurance-demo/reports/.
- Snapshot capture is optional in this initial version (payloads are stored for verification). Future iterations can enable snapshot storage.
