import { NextResponse } from 'next/server';

const ORIGIN = process.env.SIDECAR_ORIGIN || process.env.NEXT_PUBLIC_SIDECAR_ORIGIN;

function parseMetrics(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const name = parts[0];
    const value = Number(parts[1]);
    if (!Number.isNaN(value)) out[name] = value;
  }
  return out;
}

async function fetchMetrics(base: string) {
  const res = await fetch(`${base}/metrics`, { cache: 'no-store' });
  const text = await res.text();
  return { status: res.status, text };
}

export async function GET(req: Request) {
  if (!ORIGIN) {
    return NextResponse.json({ error: 'Missing SIDECAR_ORIGIN or NEXT_PUBLIC_SIDECAR_ORIGIN' }, { status: 500 });
  }

  const url = new URL(req.url);
  const waitMs = Math.min(Math.max(Number(url.searchParams.get('waitMs') || 60000), 5000), 300000);

  const base = ORIGIN.replace(/\/$/, '');

  const before = await fetchMetrics(base);
  if (before.status !== 200) {
    return NextResponse.json({ error: 'Failed to fetch /metrics', status: before.status, body: before.text.slice(0, 2000) }, { status: 502 });
  }

  await new Promise((r) => setTimeout(r, waitMs));

  const after = await fetchMetrics(base);
  if (after.status !== 200) {
    return NextResponse.json({ error: 'Failed to fetch /metrics (after wait)', status: after.status, body: after.text.slice(0, 2000) }, { status: 502 });
  }

  const m1 = parseMetrics(before.text);
  const m2 = parseMetrics(after.text);

  const metricsToCheck = [
    'xase_prefetch_latency_seconds_count',
    'xase_data_provider_requests_total',
    'xase_bytes_processed_total',
    'xase_redactions_total',
    'xase_cache_entries',
    'xase_cache_size_bytes',
  ];

  const deltas = Object.fromEntries(metricsToCheck.map((k) => [k, (m2[k] || 0) - (m1[k] || 0)]));

  const pass = {
    prefetch: deltas.xase_prefetch_latency_seconds_count > 0,
    provider_requests: deltas.xase_data_provider_requests_total > 0,
    bytes_processed: deltas.xase_bytes_processed_total > 0,
    redactions: deltas.xase_redactions_total > 0,
    cache_entries: deltas.xase_cache_entries > 0 || deltas.xase_cache_size_bytes > 0,
  };

  return NextResponse.json({
    origin: base,
    waitMs,
    pass,
    deltas,
    before: {
      xase_prefetch_latency_seconds_count: m1.xase_prefetch_latency_seconds_count || 0,
      xase_data_provider_requests_total: m1.xase_data_provider_requests_total || 0,
      xase_bytes_processed_total: m1.xase_bytes_processed_total || 0,
      xase_redactions_total: m1.xase_redactions_total || 0,
      xase_cache_entries: m1.xase_cache_entries || 0,
      xase_cache_size_bytes: m1.xase_cache_size_bytes || 0,
    },
    after: {
      xase_prefetch_latency_seconds_count: m2.xase_prefetch_latency_seconds_count || 0,
      xase_data_provider_requests_total: m2.xase_data_provider_requests_total || 0,
      xase_bytes_processed_total: m2.xase_bytes_processed_total || 0,
      xase_redactions_total: m2.xase_redactions_total || 0,
      xase_cache_entries: m2.xase_cache_entries || 0,
      xase_cache_size_bytes: m2.xase_cache_size_bytes || 0,
    },
  });
}
