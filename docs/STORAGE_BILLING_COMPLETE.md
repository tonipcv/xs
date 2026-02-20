# Storage Billing System - Complete Implementation

## Overview

The Xase platform now includes a comprehensive storage billing system that tracks and charges for data storage alongside compute and data processing costs. This document provides a complete guide to the storage billing implementation.

## Architecture

### Components

1. **StorageService** (`src/lib/billing/storage-service.ts`)
   - Manages storage snapshots and tracking
   - Calculates GB-hours for billing periods
   - Provides storage metrics and summaries

2. **BillingService** (`src/lib/billing/billing-service.ts`)
   - Comprehensive billing with storage, compute, and data processing
   - Invoice generation with itemized charges
   - Monthly usage calculations and cost breakdowns

3. **MeteringService** (`src/lib/billing/metering-service.ts`)
   - Real-time usage tracking including storage metrics
   - Redis-based caching for fast access
   - Batch processing for database writes

4. **SidecarTelemetryService** (`src/lib/billing/sidecar-telemetry.ts`)
   - Processes telemetry from Xase Sidecar
   - Tracks storage usage during data processing sessions
   - Updates policy executions with storage metrics

### Database Schema

#### Storage Snapshots Table

```sql
CREATE TABLE xase_storage_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  dataset_id TEXT,
  lease_id TEXT,
  
  -- Storage metrics
  storage_bytes BIGINT NOT NULL DEFAULT 0,
  storage_gb DECIMAL(15, 4) NOT NULL DEFAULT 0,
  
  -- Snapshot metadata
  snapshot_type TEXT NOT NULL DEFAULT 'PERIODIC',
  snapshot_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Billing period tracking
  billing_period TEXT,
  hours_in_period DECIMAL(10, 2) DEFAULT 1.0,
  
  -- Calculated GB-hours (computed column)
  gb_hours DECIMAL(15, 4) GENERATED ALWAYS AS (storage_gb * hours_in_period) STORED,
  
  -- Metadata
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Policy Execution Extensions

```sql
ALTER TABLE xase_policy_executions 
  ADD COLUMN storage_gb_hours DECIMAL(15, 4) DEFAULT 0,
  ADD COLUMN peak_storage_gb DECIMAL(15, 4) DEFAULT 0,
  ADD COLUMN avg_storage_gb DECIMAL(15, 4) DEFAULT 0;
```

## Usage

### 1. Tracking Storage

#### Create Storage Snapshot

```typescript
import { StorageService } from '@/lib/billing/storage-service'

// Create a snapshot for a dataset
const snapshot = await StorageService.trackDatasetStorage(
  'tenant_123',
  'dataset_456',
  BigInt(10737418240) // 10 GB in bytes
)

console.log(`Created snapshot: ${snapshot.id}`)
console.log(`Storage: ${snapshot.storageGb} GB`)
console.log(`GB-hours: ${snapshot.gbHours}`)
```

#### Track Lease Storage

```typescript
// At lease start
const startSnapshot = await StorageService.trackLeaseStorageStart(
  'tenant_123',
  'lease_456',
  'dataset_789',
  BigInt(10737418240) // 10 GB
)

// At lease end (after 5 hours)
const endSnapshot = await StorageService.trackLeaseStorageEnd(
  'tenant_123',
  'lease_456',
  'dataset_789',
  BigInt(10737418240), // 10 GB
  5.0 // hours active
)

console.log(`Total GB-hours: ${endSnapshot.gbHours}`) // 50 GB-hours
```

### 2. Calculating Costs

#### Calculate Storage Cost

```typescript
import { StorageService } from '@/lib/billing/storage-service'

const gbHours = 730 // 1 GB for 1 month (730 hours)
const pricePerGbMonth = 0.023 // AWS S3 Standard pricing

const cost = StorageService.calculateStorageCost(gbHours, pricePerGbMonth)
console.log(`Storage cost: $${cost.toFixed(4)}`) // $0.0230
```

#### Calculate Total Cost with All Components

```typescript
import { BillingService } from '@/lib/billing/billing-service'

const cost = BillingService.calculateCost(
  BigInt(107374182400), // 100 GB processed
  10, // 10 compute hours
  730 // 730 GB-hours storage
)

console.log(`Total cost: $${cost.toFixed(2)}`)
// Breakdown:
// - Data Processing: 100 GB × $0.05 = $5.00
// - Compute: 10 hours × $0.10 = $1.00
// - Storage: 730 GB-hours × $0.000032 = $0.02
// - Total: $6.02
```

### 3. Monthly Usage and Invoicing

#### Get Monthly Usage

```typescript
import { BillingService } from '@/lib/billing/billing-service'

const month = new Date('2024-01-01')
const usage = await BillingService.getMonthlyUsage('tenant_123', month)

console.log('Usage:', {
  bytesProcessed: usage.usage.bytesProcessed,
  computeHours: usage.usage.computeHours,
  storageGbHours: usage.usage.storageGbHours,
})

console.log('Costs:', {
  dataProcessing: usage.costs.dataProcessing,
  compute: usage.costs.compute,
  storage: usage.costs.storage,
  total: usage.costs.total,
})
```

#### Generate Invoice

```typescript
const invoice = await BillingService.generateInvoice('tenant_123', month)

console.log(`Invoice ${invoice.id}`)
console.log(`Period: ${invoice.period}`)
console.log(`Amount: $${invoice.amount}`)
console.log(`Due: ${invoice.dueDate}`)

// Itemized charges
invoice.metadata.itemizedCharges.forEach(charge => {
  console.log(`${charge.description}: ${charge.quantity} × $${charge.unitPrice} = $${charge.total}`)
})
```

### 4. Sidecar Integration

#### Process Telemetry

```typescript
import { SidecarTelemetryService } from '@/lib/billing/sidecar-telemetry'

const telemetry = {
  sessionId: 'session_123',
  leaseId: 'lease_456',
  tenantId: 'tenant_789',
  datasetId: 'dataset_abc',
  bytesProcessed: BigInt(5368709120), // 5 GB
  recordsProcessed: 1000,
  startTime: new Date('2024-01-15T10:00:00Z'),
  endTime: new Date('2024-01-15T13:00:00Z'), // 3 hours
  computeSeconds: 10800,
  storageBytes: BigInt(10737418240), // 10 GB
  peakStorageBytes: BigInt(12884901888), // 12 GB peak
  policiesApplied: ['policy_1', 'policy_2'],
  watermarksApplied: 5,
}

const processed = await SidecarTelemetryService.processTelemetry(telemetry)

console.log('Processed:', {
  computeHours: processed.usage.computeHours,
  storageGbHours: processed.usage.storageGbHours,
  totalCost: processed.cost.total,
})
```

## API Endpoints

### Storage Metrics

#### GET `/api/v1/billing/storage`

Get storage metrics and summaries.

**Query Parameters:**
- `tenantId` (required): Tenant ID
- `action`: Action to perform
  - `current`: Get current storage metrics
  - `summary`: Get usage summary for period
  - `gb-hours`: Calculate GB-hours for period
  - `cost`: Calculate storage cost

**Examples:**

```bash
# Get current storage
curl "/api/v1/billing/storage?tenantId=tenant_123&action=current"

# Get usage summary
curl "/api/v1/billing/storage?tenantId=tenant_123&action=summary&start=2024-01-01&end=2024-01-31"

# Calculate GB-hours
curl "/api/v1/billing/storage?tenantId=tenant_123&action=gb-hours&start=2024-01-01&end=2024-01-31"
```

#### POST `/api/v1/billing/storage`

Create storage snapshots and track storage.

**Actions:**
- `create-snapshot`: Create a manual snapshot
- `track-dataset`: Track dataset storage
- `track-lease-start`: Track lease storage start
- `track-lease-end`: Track lease storage end
- `update-dataset-storage`: Update dataset storage size
- `create-periodic-snapshots`: Create periodic snapshots for all active leases

**Example:**

```bash
curl -X POST "/api/v1/billing/storage" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "track-dataset",
    "tenantId": "tenant_123",
    "datasetId": "dataset_456",
    "storageBytes": "10737418240"
  }'
```

### Billing Dashboard

#### GET `/api/v1/billing/dashboard`

Get comprehensive billing summary.

**Query Parameters:**
- `tenantId` (required): Tenant ID
- `action`: Action to perform
  - `summary`: Get comprehensive billing summary (default)
  - `current-month`: Get current month usage
  - `monthly-usage`: Get specific month usage
  - `invoices`: Get invoices
  - `balance`: Get current balance

**Example:**

```bash
# Get billing summary
curl "/api/v1/billing/dashboard?tenantId=tenant_123&action=summary"

# Get current month usage
curl "/api/v1/billing/dashboard?tenantId=tenant_123&action=current-month"

# Get specific month
curl "/api/v1/billing/dashboard?tenantId=tenant_123&action=monthly-usage&month=2024-01"
```

#### POST `/api/v1/billing/dashboard`

Generate invoices and record usage.

**Actions:**
- `generate-invoice`: Generate invoice for a month
- `record-usage`: Record usage from execution
- `calculate-cost`: Calculate cost for given metrics

**Example:**

```bash
curl -X POST "/api/v1/billing/dashboard" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "generate-invoice",
    "tenantId": "tenant_123",
    "month": "2024-01"
  }'
```

### Telemetry

#### POST `/api/v1/billing/telemetry`

Process sidecar telemetry.

**Example:**

```bash
curl -X POST "/api/v1/billing/telemetry" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "process",
    "telemetry": {
      "sessionId": "session_123",
      "leaseId": "lease_456",
      "tenantId": "tenant_789",
      "datasetId": "dataset_abc",
      "bytesProcessed": "5368709120",
      "startTime": "2024-01-15T10:00:00Z",
      "endTime": "2024-01-15T13:00:00Z",
      "storageBytes": "10737418240"
    }
  }'
```

## Pricing Model

### Default Rates

```typescript
const DEFAULT_RATES = {
  dataProcessingPerGb: 0.05,      // $0.05 per GB processed
  computePerHour: 0.10,           // $0.10 per compute hour
  storagePerGbMonth: 0.023,       // $0.023 per GB-month (AWS S3 Standard)
  storagePerGbHour: 0.000032,     // $0.000032 per GB-hour (~$0.023/730)
}
```

### Cost Calculation Examples

#### Example 1: Small Dataset, Short Duration
- Storage: 10 GB for 10 hours
- GB-hours: 100
- Cost: 100 × $0.000032 = **$0.0032**

#### Example 2: Medium Dataset, Full Month
- Storage: 50 GB for 730 hours (1 month)
- GB-hours: 36,500
- Cost: 36,500 × $0.000032 = **$1.168**

#### Example 3: Large Dataset, Full Month
- Storage: 1 TB (1,000 GB) for 730 hours
- GB-hours: 730,000
- Cost: 730,000 × $0.000032 = **$23.36**

#### Example 4: Complete Billing Cycle
- Data Processing: 100 GB × $0.05 = $5.00
- Compute: 10 hours × $0.10 = $1.00
- Storage: 730 GB-hours × $0.000032 = $0.02
- **Total: $6.02**

## Periodic Snapshots

The system automatically creates hourly snapshots for all active leases to track storage usage over time.

### Cron Job Setup

```typescript
// Create periodic snapshots every hour
import { StorageService } from '@/lib/billing/storage-service'
import { SidecarTelemetryService } from '@/lib/billing/sidecar-telemetry'

// Run every hour
setInterval(async () => {
  const count = await SidecarTelemetryService.createPeriodicSnapshots()
  console.log(`Created ${count} periodic storage snapshots`)
}, 60 * 60 * 1000) // 1 hour
```

## Frontend Integration

### Billing Dashboard Component

The `BillingDashboard` component provides a comprehensive view of billing metrics:

```tsx
import { BillingDashboard } from '@/components/xase/BillingDashboard'

export default function BillingPage() {
  return <BillingDashboard tenantId="tenant_123" />
}
```

**Features:**
- Current balance and upcoming invoice
- Storage usage with growth trends
- Compute hours tracking
- Cost breakdown by component (data, compute, storage)
- Storage by dataset visualization
- Month-over-month comparisons

## Testing

### Unit Tests

```bash
# Run storage service tests
npm test src/__tests__/lib/billing/storage-service.test.ts

# Run billing service tests
npm test src/__tests__/lib/billing/billing-service.test.ts
```

### Integration Tests

```bash
# Run complete billing flow tests
npm test src/__tests__/integration/billing-flow.test.ts
```

## Migration

To apply the storage billing migration:

```bash
node database/scripts/apply-storage-tracking-migration.js
```

This creates:
- `xase_storage_snapshots` table
- Storage fields in `xase_policy_executions`
- Views for monthly aggregation
- Helper functions for calculations

## Monitoring

### Key Metrics to Monitor

1. **Storage Growth Rate**
   - Track `totalStorageGb` over time
   - Alert on unexpected spikes

2. **GB-hours Accumulation**
   - Monitor `storageGbHours` per tenant
   - Identify high-usage tenants

3. **Cost Trends**
   - Track storage costs as % of total
   - Compare month-over-month

4. **Snapshot Creation**
   - Ensure periodic snapshots are running
   - Monitor snapshot count per hour

### Database Queries

```sql
-- Get top storage consumers
SELECT 
  tenant_id,
  SUM(gb_hours) as total_gb_hours,
  AVG(storage_gb) as avg_storage_gb,
  MAX(storage_gb) as peak_storage_gb
FROM xase_storage_snapshots
WHERE billing_period = '2024-01'
GROUP BY tenant_id
ORDER BY total_gb_hours DESC
LIMIT 10;

-- Get storage trends
SELECT 
  billing_period,
  SUM(gb_hours) as total_gb_hours,
  COUNT(DISTINCT tenant_id) as tenant_count
FROM xase_storage_snapshots
GROUP BY billing_period
ORDER BY billing_period DESC;
```

## Troubleshooting

### Issue: Storage costs are zero

**Cause:** Snapshots not being created or GB-hours calculation failing

**Solution:**
1. Check if periodic snapshots are running
2. Verify storage bytes are being tracked
3. Check database migration was applied

```bash
# Manually create snapshots
curl -X POST "/api/v1/billing/storage" \
  -H "Content-Type: application/json" \
  -d '{"action": "create-periodic-snapshots"}'
```

### Issue: Incorrect storage calculations

**Cause:** Snapshot timing or duration miscalculation

**Solution:**
1. Verify `hoursInPeriod` is correct
2. Check snapshot timestamps
3. Review GB-hours formula: `storage_gb * hours_in_period`

### Issue: Missing storage data in invoices

**Cause:** Storage summary not being fetched during invoice generation

**Solution:**
1. Check `StorageService.getUsageSummary()` is working
2. Verify breakdown includes storage metrics
3. Ensure itemized charges include storage line item

## Best Practices

1. **Create snapshots at consistent intervals** (hourly recommended)
2. **Track storage at lease boundaries** (start and end)
3. **Use idempotent snapshot creation** to avoid duplicates
4. **Monitor storage growth trends** to predict costs
5. **Set up alerts for unusual storage spikes**
6. **Archive old snapshots** after billing period closes
7. **Validate GB-hours calculations** against actual usage

## Future Enhancements

1. **Tiered Storage Pricing**
   - Different rates for hot/cold storage
   - Volume discounts

2. **Storage Forecasting**
   - Predict future storage costs
   - Capacity planning

3. **Storage Optimization Recommendations**
   - Identify unused datasets
   - Suggest archival candidates

4. **Real-time Cost Alerts**
   - Notify when storage costs exceed threshold
   - Budget tracking

5. **Storage Analytics**
   - Growth patterns by dataset type
   - Usage heatmaps

## Summary

The storage billing system is now fully implemented and integrated into the Xase platform. It provides:

✅ **Complete storage tracking** with GB-hours calculation  
✅ **Comprehensive billing** with storage, compute, and data processing  
✅ **Automated snapshot creation** for active leases  
✅ **Real-time metrics** via Redis caching  
✅ **Detailed invoicing** with itemized charges  
✅ **Frontend dashboard** with visualizations  
✅ **Full test coverage** with unit and integration tests  
✅ **API endpoints** for all operations  
✅ **Database migrations** and schema updates  

The system is production-ready and can be deployed immediately.
