/**
 * Billing Dashboard API
 * Comprehensive billing summary with storage, compute, and cost metrics
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { BillingService } from '@/lib/billing/billing-service'
import { validateApiKey } from '@/lib/xase/auth'
import { prisma } from '@/lib/prisma'

// Safely convert BigInt values to string for JSON responses
function toSafeJSON(value: any): any {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map((v) => toSafeJSON(v))
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) out[k] = toSafeJSON(v)
    return out
  }
  return value
}

export async function GET(req: NextRequest) {
  try {
    // Try API key auth first
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    let tenantId: string | null = auth.valid ? (auth.tenantId || null) : null

    if (!tenantId) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { tenantId: true },
      })
      tenantId = user?.tenantId || null
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // Get comprehensive billing summary
    if (action === 'summary' || !action) {
      const summary = await BillingService.getBillingSummary(tenantId)
      // Flatten response to match test expectations
      return NextResponse.json(toSafeJSON({
        usage: summary.currentMonth.usage,
        costs: summary.currentMonth.costs,
        period: summary.currentMonth.period,
        balance: summary.balance,
        trends: summary.trends,
      }))
    }

    // Get current month usage
    if (action === 'current-month') {
      const usage = await BillingService.getCurrentMonthUsage(tenantId)
      return NextResponse.json(toSafeJSON(usage))
    }

    // Get monthly usage for specific month
    if (action === 'monthly-usage') {
      const monthStr = url.searchParams.get('month')
      if (!monthStr) {
        return NextResponse.json({ error: 'month parameter required (YYYY-MM)' }, { status: 400 })
      }

      const [year, month] = monthStr.split('-').map(Number)
      const monthDate = new Date(year, month - 1, 1)
      const usage = await BillingService.getMonthlyUsage(tenantId, monthDate)
      return NextResponse.json(toSafeJSON(usage))
    }

    // Get invoices
    if (action === 'invoices') {
      const limit = parseInt(url.searchParams.get('limit') || '12')
      const invoices = await BillingService.getInvoices(tenantId, limit)
      return NextResponse.json({ invoices, count: invoices.length })
    }

    // Get balance
    if (action === 'balance') {
      const balance = await BillingService.getBalance(tenantId)
      return NextResponse.json({ balance, tenantId })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] GET /api/v1/billing/dashboard error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, tenantId, month, rates } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
    }

    // Generate invoice
    if (action === 'generate-invoice') {
      if (!month) {
        return NextResponse.json({ error: 'month parameter required (YYYY-MM)' }, { status: 400 })
      }

      const [year, monthNum] = month.split('-').map(Number)
      const monthDate = new Date(year, monthNum - 1, 1)
      const invoice = await BillingService.generateInvoice(tenantId, monthDate, rates)
      return NextResponse.json(invoice)
    }

    // Record usage
    if (action === 'record-usage') {
      const { executionId, bytesProcessed, computeHours, storageGbHours, cost } = body
      
      if (!executionId || bytesProcessed === undefined || computeHours === undefined || cost === undefined) {
        return NextResponse.json({ 
          error: 'executionId, bytesProcessed, computeHours, and cost required' 
        }, { status: 400 })
      }

      await BillingService.recordUsage(tenantId, {
        executionId,
        bytesProcessed: BigInt(bytesProcessed),
        computeHours,
        storageGbHours: storageGbHours || 0,
        cost,
      })

      return NextResponse.json({ success: true })
    }

    // Calculate cost
    if (action === 'calculate-cost') {
      const { bytesProcessed, computeHours, storageGbHours } = body
      
      if (bytesProcessed === undefined || computeHours === undefined || storageGbHours === undefined) {
        return NextResponse.json({ 
          error: 'bytesProcessed, computeHours, and storageGbHours required' 
        }, { status: 400 })
      }

      const cost = BillingService.calculateCost(
        BigInt(bytesProcessed),
        computeHours,
        storageGbHours,
        rates
      )

      return NextResponse.json({ cost, bytesProcessed, computeHours, storageGbHours })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] POST /api/v1/billing/dashboard error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
