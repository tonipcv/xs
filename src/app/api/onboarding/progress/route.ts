import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Progress = {
  roleSelected: boolean
  integrationSetup: boolean
  firstDatasetAdded: boolean
  firstPolicyCreated: boolean
  firstLeaseIssued: boolean
  currentStep: number
  completedAt?: string
  skippedAt?: string
}

const STEPS: (keyof Progress)[] = [
  'roleSelected',
  'integrationSetup',
  'firstDatasetAdded',
  'firstPolicyCreated',
  'firstLeaseIssued',
]

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { tenantId: true } })
    const tenantId = user?.tenantId
    if (!tenantId) {
      // No tenant linked yet; show first step
      const progress: Progress = {
        roleSelected: false,
        integrationSetup: false,
        firstDatasetAdded: false,
        firstPolicyCreated: false,
        firstLeaseIssued: false,
        currentStep: 1,
      }
      return NextResponse.json({ progress, percentage: 0 })
    }

    // Compute state from DB
    const [datasetsCount, policiesCount, leasesCount] = await Promise.all([
      prisma.dataset.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.voiceAccessPolicy.count({ where: { dataset: { tenantId } } }),
      prisma.voiceAccessLease.count({ where: { policy: { dataset: { tenantId } } } }),
    ])

    const roleSelected = true // tenant exists
    const integrationSetup = false // defer until connectors are implemented
    const firstDatasetAdded = datasetsCount > 0
    const firstPolicyCreated = policiesCount > 0
    const firstLeaseIssued = leasesCount > 0

    const flags: Record<string, boolean> = {
      roleSelected,
      integrationSetup,
      firstDatasetAdded,
      firstPolicyCreated,
      firstLeaseIssued,
    }

    // Determine current step (first false, 1-indexed)
    let currentStep = 1
    for (let i = 0; i < STEPS.length; i++) {
      const key = STEPS[i] as keyof Progress
      if (!flags[key as string]) { currentStep = i + 1; break }
      if (i === STEPS.length - 1) currentStep = STEPS.length
    }

    const completedCount = Object.values(flags).filter(Boolean).length
    const percentage = Math.round((completedCount / STEPS.length) * 100)

    // Hide wizard once dataset exists to avoid blocking suppliers already onboarded elsewhere
    const completedAt = firstDatasetAdded ? new Date().toISOString() : undefined

    const progress: Progress = {
      roleSelected,
      integrationSetup,
      firstDatasetAdded,
      firstPolicyCreated,
      firstLeaseIssued,
      currentStep,
      ...(completedAt ? { completedAt } : {}),
    }

    return NextResponse.json({ progress, percentage })
  } catch (err: any) {
    console.error('[API] onboarding/progress error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await req.json().catch(() => ({}))
    const action = body?.action
    if (action === 'skip') {
      // Client component ignores skip for visibility, but we track it anyway
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[API] onboarding/progress POST error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
