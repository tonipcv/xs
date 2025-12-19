import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const url = process.env.DATABASE_URL || ''
    const masked = url ? url.replace(/:\/\/([^:@]+):?([^@]*)@/, '://***:***@') : '(not set)'

    const run = async (sql: string, ...params: any[]) => {
      try { return await prisma.$queryRawUnsafe<any[]>(sql, ...params) } catch { return null }
    }

    const tenants = await run(
      'select table_name from information_schema.tables where table_schema = current_schema() and table_name = $1',
      'xase_tenants'
    )
    const apiKeys = await run(
      'select table_name from information_schema.tables where table_schema = current_schema() and table_name = $1',
      'xase_api_keys'
    )

    return NextResponse.json({
      database_url: masked,
      tables: {
        xase_tenants: !!(tenants && tenants.length),
        xase_api_keys: !!(apiKeys && apiKeys.length),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'INTERNAL_ERROR' }, { status: 500 })
  }
}
