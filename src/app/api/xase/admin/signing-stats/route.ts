import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSigningStats } from '@/lib/xase/signing-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/xase/admin/signing-stats
 * 
 * Retorna estatísticas de uso do signing service
 * - Rate limit por tenant
 * - Contadores
 * - Próximo reset
 */
export async function GET(request: NextRequest) {
  try {
    // Auth: apenas admin/owner
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // TODO: verificar se usuário é admin/owner do tenant
    // Por ora, qualquer usuário logado pode ver stats

    const stats = getSigningStats()

    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[SigningStats] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
