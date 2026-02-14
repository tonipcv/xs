# Insurance Advanced Demo Tests

This folder contains an advanced demo that addresses insurance-critical gaps:
- ~15% human interventions (oversight proof)
- Model metadata populated (modelId/modelVersion)
- Reproducibility snapshots (EXTERNAL_DATA, BUSINESS_RULES)
- Advanced audit report with breakdowns and risk flags

## How to Run

```bash
# Seed advanced dataset
npm run demo2:seed

# Run advanced audit with metrics breakdown
npm run demo2:audit
```

Reports will be written under:
- tests/insurance-advanced/reports/
