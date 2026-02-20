/**
 * Storage Billing Demo Script
 * Demonstrates complete storage billing flow from tracking to invoicing
 */

import { StorageService } from '@/lib/billing/storage-service'
import { BillingService } from '@/lib/billing/billing-service'
import { SidecarTelemetryService } from '@/lib/billing/sidecar-telemetry'
import { MeteringService } from '@/lib/billing/metering-service'

async function demoStorageBilling() {
  console.log('🚀 Storage Billing System Demo\n')

  const tenantId = 'demo_tenant_001'
  const datasetId = 'demo_dataset_001'
  const leaseId = 'demo_lease_001'

  // ========================================
  // 1. Track Dataset Storage
  // ========================================
  console.log('📊 Step 1: Track Dataset Storage')
  console.log('─'.repeat(50))

  const datasetStorageBytes = BigInt(53687091200) // 50 GB
  const datasetSnapshot = await StorageService.trackDatasetStorage(
    tenantId,
    datasetId,
    datasetStorageBytes
  )

  console.log(`✓ Created dataset snapshot: ${datasetSnapshot.id}`)
  console.log(`  Storage: ${datasetSnapshot.storageGb} GB`)
  console.log(`  GB-hours: ${datasetSnapshot.gbHours}`)
  console.log()

  // ========================================
  // 2. Track Lease Storage (Start)
  // ========================================
  console.log('🔓 Step 2: Track Lease Storage Start')
  console.log('─'.repeat(50))

  const leaseStartSnapshot = await StorageService.trackLeaseStorageStart(
    tenantId,
    leaseId,
    datasetId,
    datasetStorageBytes
  )

  console.log(`✓ Lease started: ${leaseStartSnapshot.id}`)
  console.log(`  Storage at start: ${leaseStartSnapshot.storageGb} GB`)
  console.log(`  Timestamp: ${leaseStartSnapshot.snapshotTimestamp}`)
  console.log()

  // ========================================
  // 3. Simulate Data Processing Session
  // ========================================
  console.log('⚙️  Step 3: Process Sidecar Telemetry')
  console.log('─'.repeat(50))

  const telemetry = {
    sessionId: 'session_demo_001',
    leaseId,
    tenantId,
    datasetId,
    bytesProcessed: BigInt(10737418240), // 10 GB processed
    recordsProcessed: 5000,
    startTime: new Date('2024-01-15T10:00:00Z'),
    endTime: new Date('2024-01-15T15:00:00Z'), // 5 hours
    computeSeconds: 18000, // 5 hours
    storageBytes: datasetStorageBytes,
    peakStorageBytes: BigInt(64424509440), // 60 GB peak
    policiesApplied: ['watermark', 'anonymization'],
    watermarksApplied: 3,
  }

  const processedTelemetry = await SidecarTelemetryService.processTelemetry(telemetry)

  console.log(`✓ Processed session: ${processedTelemetry.sessionId}`)
  console.log(`  Bytes processed: ${Number(processedTelemetry.usage.bytesProcessed) / (1024**3)} GB`)
  console.log(`  Compute hours: ${processedTelemetry.usage.computeHours}`)
  console.log(`  Storage GB-hours: ${processedTelemetry.usage.storageGbHours.toFixed(2)}`)
  console.log(`  Cost breakdown:`)
  console.log(`    - Data processing: $${processedTelemetry.cost.dataProcessing.toFixed(4)}`)
  console.log(`    - Compute: $${processedTelemetry.cost.compute.toFixed(4)}`)
  console.log(`    - Storage: $${processedTelemetry.cost.storage.toFixed(4)}`)
  console.log(`    - Total: $${processedTelemetry.cost.total.toFixed(4)}`)
  console.log()

  // ========================================
  // 4. Track Lease Storage (End)
  // ========================================
  console.log('🔒 Step 4: Track Lease Storage End')
  console.log('─'.repeat(50))

  const leaseEndSnapshot = await StorageService.trackLeaseStorageEnd(
    tenantId,
    leaseId,
    datasetId,
    BigInt(64424509440), // 60 GB peak
    5.0 // 5 hours active
  )

  console.log(`✓ Lease ended: ${leaseEndSnapshot.id}`)
  console.log(`  Peak storage: ${leaseEndSnapshot.storageGb} GB`)
  console.log(`  Total GB-hours: ${leaseEndSnapshot.gbHours}`)
  console.log()

  // ========================================
  // 5. Calculate Storage GB-hours
  // ========================================
  console.log('📈 Step 5: Calculate Storage GB-hours')
  console.log('─'.repeat(50))

  const startDate = new Date('2024-01-01')
  const endDate = new Date('2024-01-31')

  const totalGbHours = await StorageService.calculateGbHours(
    tenantId,
    startDate,
    endDate
  )

  console.log(`✓ Total GB-hours for period: ${totalGbHours.toFixed(2)}`)
  console.log(`  Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`)
  console.log()

  // ========================================
  // 6. Get Storage Usage Summary
  // ========================================
  console.log('📊 Step 6: Get Storage Usage Summary')
  console.log('─'.repeat(50))

  const storageSummary = await StorageService.getUsageSummary(
    tenantId,
    startDate,
    endDate
  )

  console.log(`✓ Storage summary:`)
  console.log(`  Total GB-hours: ${storageSummary.totalGbHours.toFixed(2)}`)
  console.log(`  Average storage: ${storageSummary.avgStorageGb.toFixed(2)} GB`)
  console.log(`  Peak storage: ${storageSummary.peakStorageGb.toFixed(2)} GB`)
  console.log(`  Snapshots: ${storageSummary.snapshotCount}`)
  console.log()

  // ========================================
  // 7. Get Current Storage Metrics
  // ========================================
  console.log('💾 Step 7: Get Current Storage Metrics')
  console.log('─'.repeat(50))

  const currentStorage = await StorageService.getCurrentStorage(tenantId)

  console.log(`✓ Current storage:`)
  console.log(`  Total: ${currentStorage.totalStorageGb.toFixed(2)} GB`)
  console.log(`  Datasets: ${currentStorage.datasetCount}`)
  console.log(`  Last updated: ${currentStorage.lastUpdated.toLocaleString()}`)
  console.log()

  // ========================================
  // 8. Calculate Monthly Usage
  // ========================================
  console.log('📅 Step 8: Calculate Monthly Usage')
  console.log('─'.repeat(50))

  const month = new Date('2024-01-01')
  const monthlyUsage = await BillingService.getMonthlyUsage(tenantId, month)

  console.log(`✓ Monthly usage for ${monthlyUsage.period.start.toLocaleDateString()}:`)
  console.log(`  Usage:`)
  console.log(`    - Bytes processed: ${Number(monthlyUsage.usage.bytesProcessed) / (1024**3)} GB`)
  console.log(`    - Compute hours: ${monthlyUsage.usage.computeHours.toFixed(2)}`)
  console.log(`    - Storage GB-hours: ${monthlyUsage.usage.storageGbHours.toFixed(2)}`)
  console.log(`  Costs:`)
  console.log(`    - Data processing: $${monthlyUsage.costs.dataProcessing.toFixed(2)}`)
  console.log(`    - Compute: $${monthlyUsage.costs.compute.toFixed(2)}`)
  console.log(`    - Storage: $${monthlyUsage.costs.storage.toFixed(2)}`)
  console.log(`    - Total: $${monthlyUsage.costs.total.toFixed(2)}`)
  console.log()

  // ========================================
  // 9. Generate Invoice
  // ========================================
  console.log('🧾 Step 9: Generate Invoice')
  console.log('─'.repeat(50))

  const invoice = await BillingService.generateInvoice(tenantId, month)

  console.log(`✓ Invoice generated: ${invoice.id}`)
  console.log(`  Period: ${invoice.period}`)
  console.log(`  Amount: $${invoice.amount.toFixed(2)}`)
  console.log(`  Status: ${invoice.status}`)
  console.log(`  Due date: ${invoice.dueDate.toLocaleDateString()}`)
  console.log(`  Itemized charges:`)
  invoice.metadata.itemizedCharges.forEach(charge => {
    console.log(`    - ${charge.description}:`)
    console.log(`      ${charge.quantity.toFixed(2)} × $${charge.unitPrice} = $${charge.total.toFixed(4)}`)
  })
  console.log()

  // ========================================
  // 10. Get Billing Summary
  // ========================================
  console.log('📊 Step 10: Get Billing Summary')
  console.log('─'.repeat(50))

  const billingSummary = await BillingService.getBillingSummary(tenantId)

  console.log(`✓ Billing summary:`)
  console.log(`  Current balance: $${billingSummary.balance.toFixed(2)}`)
  console.log(`  Current month total: $${billingSummary.currentMonth.costs.total.toFixed(2)}`)
  console.log(`  Last month total: $${billingSummary.lastMonth.costs.total.toFixed(2)}`)
  console.log(`  Upcoming invoice: $${billingSummary.upcomingInvoice.amount.toFixed(2)}`)
  console.log(`  Trends:`)
  console.log(`    - Storage growth: ${billingSummary.trends.storageGrowth.toFixed(1)}%`)
  console.log(`    - Compute growth: ${billingSummary.trends.computeGrowth.toFixed(1)}%`)
  console.log(`    - Cost growth: ${billingSummary.trends.costGrowth.toFixed(1)}%`)
  console.log()

  // ========================================
  // 11. Calculate Storage Cost Examples
  // ========================================
  console.log('💰 Step 11: Storage Cost Examples')
  console.log('─'.repeat(50))

  const examples = [
    { name: 'Small dataset, 1 day', gbHours: 10 * 24, description: '10 GB for 24 hours' },
    { name: 'Medium dataset, 1 week', gbHours: 50 * 24 * 7, description: '50 GB for 1 week' },
    { name: 'Large dataset, 1 month', gbHours: 100 * 730, description: '100 GB for 1 month' },
    { name: 'Enterprise dataset, 1 month', gbHours: 1000 * 730, description: '1 TB for 1 month' },
  ]

  examples.forEach(example => {
    const cost = StorageService.calculateStorageCost(example.gbHours)
    console.log(`  ${example.name}:`)
    console.log(`    ${example.description}`)
    console.log(`    ${example.gbHours} GB-hours = $${cost.toFixed(4)}`)
  })
  console.log()

  // ========================================
  // Summary
  // ========================================
  console.log('✅ Demo Complete!')
  console.log('─'.repeat(50))
  console.log('Storage billing system is fully operational with:')
  console.log('  ✓ Storage snapshot tracking')
  console.log('  ✓ GB-hours calculation')
  console.log('  ✓ Sidecar telemetry integration')
  console.log('  ✓ Monthly usage aggregation')
  console.log('  ✓ Invoice generation with itemized charges')
  console.log('  ✓ Comprehensive billing dashboard')
  console.log()
}

// Run demo if executed directly
if (require.main === module) {
  demoStorageBilling()
    .then(() => {
      console.log('Demo completed successfully')
      process.exit(0)
    })
    .catch(error => {
      console.error('Demo failed:', error)
      process.exit(1)
    })
}

export { demoStorageBilling }
