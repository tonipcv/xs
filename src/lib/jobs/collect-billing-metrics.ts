import { prisma } from '@/lib/prisma';

interface SidecarReadyResponse {
  ready: boolean;
  version: string;
  ingestion_mode: string;
  data_pipeline: string;
  features: {
    dicom_ocr: boolean;
    fhir_nlp: boolean;
    audio_redaction: boolean;
    prefetch: boolean;
  };
  billing_counters: {
    dicom_images: number;
    fhir_resources: number;
    audio_minutes: number;
    text_pages: number;
    bytes_total: number;
    redactions_total: number;
  };
}

interface TenantSidecarConfig {
  tenantId: string;
  sidecarUrl: string;
}

async function fetchSidecarMetrics(sidecarUrl: string): Promise<SidecarReadyResponse> {
  const response = await fetch(`${sidecarUrl}/ready`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!response.ok) {
    throw new Error(`Sidecar /ready returned ${response.status}`);
  }

  return response.json();
}

async function getTenantSidecarConfigs(): Promise<TenantSidecarConfig[]> {
  // In production, this would query a config table or env vars
  // For now, we'll use env var pattern: SIDECAR_URL_<tenant_id>
  const configs: TenantSidecarConfig[] = [];
  
  // Get all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  for (const tenant of tenants) {
    const envKey = `SIDECAR_URL_${tenant.id.toUpperCase()}`;
    const sidecarUrl = process.env[envKey];
    
    if (sidecarUrl) {
      configs.push({ tenantId: tenant.id, sidecarUrl });
    }
  }

  return configs;
}

export async function collectBillingMetrics() {
  const now = new Date();
  const period = now.toISOString().slice(0, 7); // YYYY-MM
  
  console.log(`[BillingJob] Starting billing metrics collection for period ${period}`);
  
  const configs = await getTenantSidecarConfigs();
  console.log(`[BillingJob] Found ${configs.length} tenant Sidecar(s) to collect from`);
  
  const results = {
    success: 0,
    failed: 0,
    errors: [] as { tenantId: string; error: string }[],
  };

  for (const config of configs) {
    try {
      console.log(`[BillingJob] Fetching metrics for tenant ${config.tenantId} from ${config.sidecarUrl}`);
      
      const metrics = await fetchSidecarMetrics(config.sidecarUrl);
      
      // Store snapshot in DB
      // Note: Run `npx tsx database/scripts/apply-billing-snapshot-migration.ts && npx prisma generate` to resolve lint error
      await prisma.billingSnapshot.create({
        data: {
          tenantId: config.tenantId,
          sidecarUrl: config.sidecarUrl,
          snapshotDate: now,
          period,
          
          // Billing counters
          dicomImages: metrics.billing_counters.dicom_images,
          fhirResources: metrics.billing_counters.fhir_resources,
          audioMinutes: metrics.billing_counters.audio_minutes,
          textPages: metrics.billing_counters.text_pages,
          bytesTotal: metrics.billing_counters.bytes_total,
          redactionsTotal: metrics.billing_counters.redactions_total,
          
          // Metadata
          sidecarVersion: metrics.version,
          ingestionMode: metrics.ingestion_mode,
          dataPipeline: metrics.data_pipeline,
          
          // Features
          featureDicomOcr: metrics.features.dicom_ocr,
          featureFhirNlp: metrics.features.fhir_nlp,
          featureAudioRedaction: metrics.features.audio_redaction,
          featurePrefetch: metrics.features.prefetch,
        },
      });
      
      console.log(`[BillingJob] ✓ Stored snapshot for tenant ${config.tenantId}`);
      results.success++;
    } catch (error: any) {
      console.error(`[BillingJob] ✗ Failed to collect metrics for tenant ${config.tenantId}:`, error.message);
      results.failed++;
      results.errors.push({
        tenantId: config.tenantId,
        error: error.message,
      });
    }
  }
  
  console.log(`[BillingJob] Completed: ${results.success} success, ${results.failed} failed`);
  
  return results;
}

// For manual execution or cron
if (require.main === module) {
  collectBillingMetrics()
    .then((results) => {
      console.log('Billing metrics collection completed:', results);
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Fatal error in billing metrics collection:', error);
      process.exit(1);
    });
}
