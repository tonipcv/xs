// Lightweight Sentry wrapper with safe no-ops if DSN is not configured
// In production, install @sentry/nextjs and initialize per docs.

export interface SentryContext {
  requestId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, any>;
}

let enabled = false;
try {
  enabled = !!process.env.SENTRY_DSN;
} catch {
  enabled = false;
}

async function loadSentry(): Promise<any | null> {
  if (!enabled) return null;
  try {
    // Use eval to prevent bundlers from resolving '@sentry/nextjs' at build time
    const dynamicImport = (0, eval)('import');
    const mod = await dynamicImport('@sentry/nextjs');
    return mod;
  } catch {
    try {
      const req = (0, eval)('require');
      return req('@sentry/nextjs');
    } catch {
      return null;
    }
  }
}

export async function captureException(err: unknown, ctx?: SentryContext) {
  try {
    const Sentry = await loadSentry();
    if (!Sentry) return;
    Sentry.captureException(err, {
      tags: ctx?.tags,
      extra: { requestId: ctx?.requestId, ...(ctx?.extra || {}) },
    });
  } catch {
    // no-op
  }
}

export async function captureMessage(message: string, ctx?: SentryContext) {
  try {
    const Sentry = await loadSentry();
    if (!Sentry) return;
    Sentry.captureMessage(message, {
      level: 'info',
      tags: ctx?.tags,
      extra: { requestId: ctx?.requestId, ...(ctx?.extra || {}) },
    } as any);
  } catch {
    // no-op
  }
}
