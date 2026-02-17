import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ organizationType: null }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        tenantId: true,
        tenant: {
          select: {
            organizationType: true,
          }
        }
      }
    })

    if (!user || !user.tenant) {
      return NextResponse.json({ organizationType: null })
    }

    return NextResponse.json({ 
      organizationType: user.tenant.organizationType 
    })
  } catch (error) {
    console.error('Error fetching organization type:', error)
    return NextResponse.json({ organizationType: null }, { status: 500 })
  }
}
