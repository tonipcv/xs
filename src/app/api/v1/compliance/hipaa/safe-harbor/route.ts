import { NextRequest, NextResponse } from 'next/server'
import { checkSafeHarbor, type SafeHarborConfig } from '@/lib/compliance/hipaa'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'

export async function POST(req: NextRequest) {
  try {
    // Require API key (align with other v1 endpoints)
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }
    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 300, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const payload = body?.payload ?? body?.data ?? body
    const config: SafeHarborConfig = {
      dateShiftDays: typeof body?.config?.dateShiftDays === 'number' ? body.config.dateShiftDays : undefined,
      redact: Array.isArray(body?.config?.redact) ? body.config.redact : undefined,
    }

    const report = checkSafeHarbor(payload, config)

    return NextResponse.json({
      tenantId: auth.tenantId,
      passed: report.passed,
      totalFindings: report.totalFindings,
      findings: report.findings,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
