/**
 * PRICING SERVICE
 * Ensures billing uses negotiated/contract prices instead of defaults
 */

import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export interface PricingContext {
  offerId?: string
  policyId?: string
  leaseId?: string
  tenantId: string
}

export interface NegotiatedPricing {
  pricePerHour: number
  priceModel: string
  currency: string
  source: 'OFFER' | 'POLICY' | 'DEFAULT'
  offerId?: string
  auditTrail: {
    timestamp: Date
    source: string
    value: number
  }
}

const DEFAULT_PRICING = {
  pricePerHour: 0.10,
  priceModel: 'PAY_PER_HOUR',
  currency: 'USD',
}

/**
 * Get negotiated pricing for a given context
 * Priority: Offer > Policy > Default
 */
export async function getNegotiatedPricing(
  ctx: PricingContext
): Promise<NegotiatedPricing> {
  const now = new Date()

  // 1. Try to get pricing from offer (highest priority)
  if (ctx.offerId) {
    try {
      const offer = await prisma.accessOffer.findUnique({
        where: { id: ctx.offerId },
        select: {
          pricePerHour: true,
          priceModel: true,
          currency: true,
          status: true,
        },
      })

      if (offer && offer.status === 'ACTIVE') {
        return {
          pricePerHour: Number(offer.pricePerHour),
          priceModel: offer.priceModel,
          currency: offer.currency,
          source: 'OFFER',
          offerId: ctx.offerId,
          auditTrail: {
            timestamp: now,
            source: `offer:${ctx.offerId}`,
            value: Number(offer.pricePerHour),
          },
        }
      }
    } catch (error) {
      console.error('[Pricing] Error fetching offer pricing:', error)
    }
  }

  // 2. Try to get pricing from policy execution
  if (ctx.policyId) {
    try {
      const policy = await prisma.accessPolicy.findUnique({
        where: { policyId: ctx.policyId },
        include: {
          dataset: {
            select: {
              accessOffers: {
                where: { status: 'ACTIVE' },
                select: {
                  id: true,
                  pricePerHour: true,
                  priceModel: true,
                  currency: true,
                },
                take: 1,
              },
            },
          },
        },
      })

      if (policy?.dataset?.accessOffers?.[0]) {
        const offer = policy.dataset.accessOffers[0]
        return {
          pricePerHour: Number(offer.pricePerHour),
          priceModel: offer.priceModel,
          currency: offer.currency,
          source: 'POLICY',
          offerId: offer.id,
          auditTrail: {
            timestamp: now,
            source: `policy:${ctx.policyId}->offer:${offer.id}`,
            value: Number(offer.pricePerHour),
          },
        }
      }
    } catch (error) {
      console.error('[Pricing] Error fetching policy pricing:', error)
    }
  }

  // 3. Try to get pricing from lease
  if (ctx.leaseId) {
    try {
      const lease = await prisma.accessLease.findUnique({
        where: { leaseId: ctx.leaseId },
        include: {
          policy: {
            include: {
              dataset: {
                select: {
                  accessOffers: {
                    where: { status: 'ACTIVE' },
                    select: {
                      id: true,
                      pricePerHour: true,
                      priceModel: true,
                      currency: true,
                    },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      })

      if (lease?.policy?.dataset?.accessOffers?.[0]) {
        const offer = lease.policy.dataset.accessOffers[0]
        return {
          pricePerHour: Number(offer.pricePerHour),
          priceModel: offer.priceModel,
          currency: offer.currency,
          source: 'POLICY',
          offerId: offer.id,
          auditTrail: {
            timestamp: now,
            source: `lease:${ctx.leaseId}->policy:${lease.policy.policyId}->offer:${offer.id}`,
            value: Number(offer.pricePerHour),
          },
        }
      }
    } catch (error) {
      console.error('[Pricing] Error fetching lease pricing:', error)
    }
  }

  // 4. Fall back to default pricing
  console.warn(`[Pricing] Using default pricing for tenant ${ctx.tenantId}`)
  return {
    ...DEFAULT_PRICING,
    source: 'DEFAULT',
    auditTrail: {
      timestamp: now,
      source: 'default',
      value: DEFAULT_PRICING.pricePerHour,
    },
  }
}

/**
 * Calculate cost with negotiated pricing
 */
export async function calculateCostWithNegotiatedPricing(
  ctx: PricingContext,
  hours: number
): Promise<{
  cost: number
  pricing: NegotiatedPricing
}> {
  const pricing = await getNegotiatedPricing(ctx)
  const cost = hours * pricing.pricePerHour

  return { cost, pricing }
}

/**
 * Audit pricing decision - log to database for compliance
 */
export async function auditPricingDecision(
  ctx: PricingContext,
  pricing: NegotiatedPricing,
  amount: number
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        action: 'PRICING_APPLIED',
        resourceType: 'BILLING',
        resourceId: ctx.offerId || ctx.policyId || ctx.leaseId,
        metadata: JSON.stringify({
          source: pricing.source,
          pricePerHour: pricing.pricePerHour,
          priceModel: pricing.priceModel,
          currency: pricing.currency,
          amount,
          offerId: pricing.offerId,
          auditTrail: pricing.auditTrail,
        }),
        status: 'SUCCESS',
      },
    })
  } catch (error) {
    console.error('[Pricing] Failed to audit pricing decision:', error)
  }
}

/**
 * Validate pricing consistency - ensure no default pricing is used when offer exists
 */
export async function validatePricingConsistency(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  valid: boolean
  violations: Array<{
    executionId: string
    issue: string
    expectedPrice: number
    actualPrice: number
  }>
}> {
  const violations: Array<any> = []

  try {
    // Get all executions in period
    const executions = await prisma.policyExecution.findMany({
      where: {
        buyerTenantId: tenantId,
        startedAt: { gte: startDate, lte: endDate },
      },
      include: {
        offer: {
          select: {
            id: true,
            pricePerHour: true,
          },
        },
      },
    })

    for (const execution of executions) {
      const expectedPrice = Number(execution.offer.pricePerHour)
      
      // Check if execution used default pricing instead of offer pricing
      // This would be detected by checking credit ledger entries
      const ledgerEntries = await prisma.creditLedger.findMany({
        where: {
          tenantId,
          metadata: {
            path: ['executionId'],
            equals: execution.executionId,
          },
        },
      })

      for (const entry of ledgerEntries) {
        const metadata = entry.metadata as any
        if (metadata.pricePerHour && metadata.pricePerHour !== expectedPrice) {
          violations.push({
            executionId: execution.executionId,
            issue: 'Price mismatch between offer and billing',
            expectedPrice,
            actualPrice: metadata.pricePerHour,
          })
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    }
  } catch (error) {
    console.error('[Pricing] Error validating pricing consistency:', error)
    return {
      valid: false,
      violations: [],
    }
  }
}

/**
 * Get pricing summary for tenant
 */
export async function getPricingSummary(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  totalCost: number
  breakdown: {
    bySource: Record<string, { cost: number; count: number }>
    byOffer: Record<string, { cost: number; hours: number; pricePerHour: number }>
  }
}> {
  try {
    const executions = await prisma.policyExecution.findMany({
      where: {
        buyerTenantId: tenantId,
        startedAt: { gte: startDate, lte: endDate },
      },
      include: {
        offer: {
          select: {
            id: true,
            pricePerHour: true,
          },
        },
      },
    })

    let totalCost = 0
    const bySource: Record<string, { cost: number; count: number }> = {}
    const byOffer: Record<string, { cost: number; hours: number; pricePerHour: number }> = {}

    for (const execution of executions) {
      const hours = execution.hoursUsed
      const pricePerHour = Number(execution.offer.pricePerHour)
      const cost = hours * pricePerHour

      totalCost += cost

      // Track by source
      const source = 'OFFER' // We now always use offer pricing
      if (!bySource[source]) {
        bySource[source] = { cost: 0, count: 0 }
      }
      bySource[source].cost += cost
      bySource[source].count += 1

      // Track by offer
      const offerId = execution.offer.id
      if (!byOffer[offerId]) {
        byOffer[offerId] = { cost: 0, hours: 0, pricePerHour }
      }
      byOffer[offerId].cost += cost
      byOffer[offerId].hours += hours
    }

    return {
      totalCost,
      breakdown: {
        bySource,
        byOffer,
      },
    }
  } catch (error) {
    console.error('[Pricing] Error getting pricing summary:', error)
    return {
      totalCost: 0,
      breakdown: {
        bySource: {},
        byOffer: {},
      },
    }
  }
}
