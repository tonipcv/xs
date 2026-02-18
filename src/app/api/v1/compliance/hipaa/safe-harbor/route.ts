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
    const originalPayload = body?.payload ?? body?.data ?? body
    const config: SafeHarborConfig = {
      dateShiftDays: typeof body?.config?.dateShiftDays === 'number' ? body.config.dateShiftDays : undefined,
      redact: Array.isArray(body?.config?.redact) ? body.config.redact : undefined,
      // Extra fields may exist on body.config; we won't type them here to avoid coupling.
    }

    // Optional refinements: pre-filter URLs and allowlisted fragments before scanning
    const allowlist: string[] = Array.isArray(body?.config?.allowlist) ? body.config.allowlist : []
    const maxFindings: number | undefined = typeof body?.config?.maxFindings === 'number' ? body.config.maxFindings : undefined

    const text = typeof originalPayload === 'string' ? originalPayload : JSON.stringify(originalPayload || {})
    const urlRegex = /https?:\/\/[\w.\/?=#%:-]+/gi
    let filtered = text.replace(urlRegex, ' ')
    for (const pat of allowlist) {
      try {
        const r = new RegExp(pat, 'gi')
        filtered = filtered.replace(r, ' ')
      } catch {
        // ignore invalid regex entries
      }
    }
    // Use filtered string as payload to the detector
    const report = checkSafeHarbor(filtered, config)

    const findings = Array.isArray(report.findings) && typeof maxFindings === 'number'
      ? report.findings.slice(0, Math.max(1, maxFindings))
      : report.findings

    return NextResponse.json({
      tenantId: auth.tenantId,
      passed: findings.length === 0,
      totalFindings: findings.length,
      findings,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
