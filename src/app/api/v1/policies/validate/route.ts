import { NextRequest, NextResponse } from 'next/server'
import { validatePolicy } from '@/lib/xase/policy-validator'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    let yamlSource = ''

    if (contentType.includes('text/plain') || contentType.includes('application/yaml') || contentType.includes('text/yaml')) {
      yamlSource = await req.text()
    } else {
      const body = await req.json().catch(() => ({} as any))
      yamlSource = typeof body.yaml === 'string' ? body.yaml : ''
    }

    if (!yamlSource || yamlSource.trim().length === 0) {
      return NextResponse.json({ error: 'Missing YAML policy in body' }, { status: 400 })
    }

    const result = validatePolicy(yamlSource)
    if (!result.valid) {
      return NextResponse.json({ valid: false, errors: result.errors }, { status: 422 })
    }

    return NextResponse.json({
      valid: true,
      policy: result.policy,
      plan: result.plan,
    })
  } catch (err: any) {
    console.error('[PolicyValidate] Error:', err)
    return NextResponse.json({ error: 'Internal error', details: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST a YAML policy in body (text/plain or { yaml: string }) to validate and get a rewrite plan.',
    example: {
      yaml: `version: "0.1"
policy_id: "pol_healthcare_training"
dataset:
  id: "ds_healthcare_calls"
principals:
  allow: ["tenant_stanford_ai"]
purposes: ["speech_recognition_training"]
rules:
  columns:
    deny: ["patient_ssn", "patient_dob"]
  rows:
    allow:
      - field: "consent_status"
        op: "="
        value: "VERIFIED_BY_XASE"`
    }
  })
}
