import { randomUUID } from 'crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  tenantId?: string | null;
  userId?: string | null;
  [key: string]: any;
}

function log(level: LogLevel, message: string, ctx?: LogContext, err?: unknown) {
  const payload: any = {
    ts: new Date().toISOString(),
    level,
    message,
    ...ctx,
  };
  if (err) {
    payload.error = {
      message: (err as any)?.message || String(err),
      stack: (err as any)?.stack,
      name: (err as any)?.name,
    };
  }
  // Structured JSON log
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext, err?: unknown) => log('error', msg, ctx, err),
};

export function ensureRequestId(existing?: string | null): string {
  return existing || randomUUID();
}
