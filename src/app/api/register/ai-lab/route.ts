import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, email, password, organizationName } = body as {
      name?: string
      email?: string
      password?: string
      organizationName?: string
    }

    if (!name || !email || !password || !organizationName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // TODO: Implement actual user + organization creation logic (tenant, role CLIENT/AI LAB, hashing, etc.)
    // For now, respond success so the UI can proceed to /login
    return NextResponse.json({
      ok: true,
      message: 'AI Lab registered successfully',
      organizationType: 'CLIENT',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Registration failed' }, { status: 500 })
  }
}
