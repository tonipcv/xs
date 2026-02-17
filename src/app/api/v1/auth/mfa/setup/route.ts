/**
 * MFA SETUP ENDPOINT
 */

import { NextRequest, NextResponse } from 'next/server'
import { MFAManager } from '@/lib/xase/mfa'

export async function POST(req: NextRequest) {
  try {
    // TODO: Get authenticated user from session
    const userId = 'user_123' // Mock
    const tenantId = 'tenant_123' // Mock

    const setup = await MFAManager.setupMFA(userId, tenantId, 'Xase')

    return NextResponse.json({
      success: true,
      secret: setup.secret,
      qrCodeUrl: setup.qrCodeUrl,
      backupCodes: setup.backupCodes,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'MFA setup failed', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
