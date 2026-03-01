/**
 * Liveness Probe for Kubernetes
 * Indicates if the application is alive
 */

import { NextResponse } from 'next/server';
import { checkLiveness } from '@/lib/health/health-checks';

export async function GET() {
  const alive = await checkLiveness();

  if (alive) {
    return NextResponse.json({ status: 'alive' }, { status: 200 });
  } else {
    return NextResponse.json({ status: 'dead' }, { status: 503 });
  }
}
