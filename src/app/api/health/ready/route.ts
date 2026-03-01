/**
 * Readiness Probe for Kubernetes
 * Indicates if the application is ready to serve traffic
 */

import { NextResponse } from 'next/server';
import { checkReadiness } from '@/lib/health/health-checks';

export async function GET() {
  const ready = await checkReadiness();

  if (ready) {
    return NextResponse.json({ status: 'ready' }, { status: 200 });
  } else {
    return NextResponse.json({ status: 'not ready' }, { status: 503 });
  }
}
