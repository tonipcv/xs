import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface SidecarMetrics {
  ready?: boolean;
  version?: string | null;
  ingestion_mode?: string | null;
  data_pipeline?: string | null;
  features?: {
    dicom_ocr?: boolean;
    fhir_nlp?: boolean;
    audio_redaction?: boolean;
    prefetch?: boolean;
  } | null;
  billing_counters?: {
    dicom_images?: number;
    fhir_resources?: number;
    audio_minutes?: number;
    text_pages?: number;
    bytes_total?: number;
    redactions_total?: number;
  } | null;
}

interface BillingReport {
  tenant_id: string;
  period: string;
  sidecar_url: string;
  metrics: SidecarMetrics;
  billing_summary: {
    dicom_images: number;
    fhir_resources: number;
    audio_minutes: number;
    text_pages: number;
    gb_processed: number;
    redactions: number;
  };
  pricing?: {
    dicom_per_1k_images: number;
    fhir_per_1k_resources: number;
    audio_per_100_minutes: number;
    text_per_1k_pages: number;
    base_monthly: number;
  };
  estimated_charges?: {
    dicom: number;
    fhir: number;
    audio: number;
    text: number;
    base: number;
    total: number;
  };
}

async function fetchSidecarMetrics(sidecarUrl: string): Promise<SidecarMetrics> {
  const response = await fetch(`${sidecarUrl}/ready`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Sidecar /ready returned ${response.status}`);
  }

  return response.json();
}

// GET /api/billing-report?tenant_id=X&month=2026-02
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id');
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const format = searchParams.get('format') || 'json'; // json|csv

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Lookup Sidecar URL from tenant config (assuming stored in DB or env)
    // For now, use env var pattern: SIDECAR_URL_<tenant_id>
    const sidecarUrl = process.env[`SIDECAR_URL_${tenantId.toUpperCase()}`] || process.env.NEXT_PUBLIC_SIDECAR_ORIGIN;

    if (!sidecarUrl) {
      return NextResponse.json({ error: 'Sidecar URL not configured for tenant' }, { status: 404 });
    }

    // Fetch current metrics from Sidecar
    const metricsRaw = await fetchSidecarMetrics(sidecarUrl);

    // Safe defaults when /ready does not include enriched payload yet
    const counters = {
      dicom_images: Number(metricsRaw?.billing_counters?.dicom_images ?? 0),
      fhir_resources: Number(metricsRaw?.billing_counters?.fhir_resources ?? 0),
      audio_minutes: Number(metricsRaw?.billing_counters?.audio_minutes ?? 0),
      text_pages: Number(metricsRaw?.billing_counters?.text_pages ?? 0),
      bytes_total: Number(metricsRaw?.billing_counters?.bytes_total ?? 0),
      redactions_total: Number(metricsRaw?.billing_counters?.redactions_total ?? 0),
    };

    const features = {
      dicom_ocr: Boolean(metricsRaw?.features?.dicom_ocr ?? false),
      fhir_nlp: Boolean(metricsRaw?.features?.fhir_nlp ?? false),
      audio_redaction: Boolean(metricsRaw?.features?.audio_redaction ?? false),
      prefetch: Boolean(metricsRaw?.features?.prefetch ?? false),
    };

    const metrics: SidecarMetrics = {
      ready: Boolean(metricsRaw?.ready ?? true),
      version: metricsRaw?.version ?? null,
      ingestion_mode: metricsRaw?.ingestion_mode ?? null,
      data_pipeline: metricsRaw?.data_pipeline ?? null,
      features,
      billing_counters: counters,
    };

    // Build billing summary
    const billingSummary = {
      dicom_images: counters.dicom_images,
      fhir_resources: counters.fhir_resources,
      audio_minutes: counters.audio_minutes,
      text_pages: counters.text_pages,
      gb_processed: counters.bytes_total / 1e9,
      redactions: counters.redactions_total,
    };

    // Pricing table (can be fetched from DB per tenant/contract)
    const pricing = {
      dicom_per_1k_images: 50, // R$ 50 per 1k images
      fhir_per_1k_resources: 20, // R$ 20 per 1k resources
      audio_per_100_minutes: 80, // R$ 80 per 100 minutes
      text_per_1k_pages: 15, // R$ 15 per 1k pages
      base_monthly: 15000, // R$ 15k base subscription
    };

    // Calculate estimated charges
    const estimatedCharges = {
      dicom: (billingSummary.dicom_images / 1000) * pricing.dicom_per_1k_images,
      fhir: (billingSummary.fhir_resources / 1000) * pricing.fhir_per_1k_resources,
      audio: (billingSummary.audio_minutes / 100) * pricing.audio_per_100_minutes,
      text: (billingSummary.text_pages / 1000) * pricing.text_per_1k_pages,
      base: pricing.base_monthly,
      total: 0,
    };
    estimatedCharges.total =
      estimatedCharges.dicom +
      estimatedCharges.fhir +
      estimatedCharges.audio +
      estimatedCharges.text +
      estimatedCharges.base;

    const report: BillingReport = {
      tenant_id: tenantId,
      period: month,
      sidecar_url: sidecarUrl,
      metrics,
      billing_summary: billingSummary,
      pricing,
      estimated_charges: estimatedCharges,
    };

    // Return JSON or CSV
    if (format === 'csv') {
      const csv = [
        'Metric,Value',
        `Tenant,${tenantId}`,
        `Period,${month}`,
        `DICOM Images,${billingSummary.dicom_images}`,
        `FHIR Resources,${billingSummary.fhir_resources}`,
        `Audio Minutes,${billingSummary.audio_minutes}`,
        `Text Pages,${billingSummary.text_pages}`,
        `GB Processed,${billingSummary.gb_processed.toFixed(2)}`,
        `Redactions,${billingSummary.redactions}`,
        '',
        'Charges,Amount (R$)',
        `DICOM,${estimatedCharges.dicom.toFixed(2)}`,
        `FHIR,${estimatedCharges.fhir.toFixed(2)}`,
        `Audio,${estimatedCharges.audio.toFixed(2)}`,
        `Text,${estimatedCharges.text.toFixed(2)}`,
        `Base Subscription,${estimatedCharges.base.toFixed(2)}`,
        `Total,${estimatedCharges.total.toFixed(2)}`,
      ].join('\n');

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="billing-${tenantId}-${month}.csv"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      {
        error: 'Failed to generate billing report',
        ...(isDev ? { debug: String(error?.message ?? error) } : {}),
      },
      { status: 500 }
    );
  }
}
