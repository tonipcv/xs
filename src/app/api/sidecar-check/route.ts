import { NextResponse } from 'next/server';

const ORIGIN = process.env.SIDECAR_ORIGIN || process.env.NEXT_PUBLIC_SIDECAR_ORIGIN;

async function fetchWithTimeout(url: string, ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    const text = await res.text();
    return { status: res.status, body: text };
  } catch (e: any) {
    return { status: 'ERR', body: String(e?.message || e) } as const;
  } finally {
    clearTimeout(id);
  }
}

export async function GET() {
  if (!ORIGIN) {
    return NextResponse.json({ error: 'Missing SIDECAR_ORIGIN or NEXT_PUBLIC_SIDECAR_ORIGIN' }, { status: 500 });
  }

  const base = ORIGIN.replace(/\/$/, '');

  const [ready, health, metrics] = await Promise.all([
    fetchWithTimeout(`${base}/ready`, 8000),
    fetchWithTimeout(`${base}/health`, 8000),
    fetchWithTimeout(`${base}/metrics`, 8000),
  ]);

  const metricsPreview = typeof metrics.body === 'string'
    ? metrics.body.split('\n').slice(0, 20).join('\n')
    : metrics.body;

  return NextResponse.json({
    origin: base,
    ready: { status: ready.status, body: ready.body },
    health: { status: health.status, body: health.body },
    metrics: { status: metrics.status, preview: metricsPreview },
  });
}
