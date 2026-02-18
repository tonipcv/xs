/**
 * Background Job: Auto-renew leases before expiration
 * Runs every 5 minutes to check for leases expiring in 30min
 * Automatically extends lease if autoRenew=true and within budget
 */

import { prisma } from '@/lib/prisma'
import { sendLeaseExpiryAlert } from '@/lib/notifications/lease-alerts'

const RENEWAL_WINDOW_MINUTES = 30
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

interface RenewalResult {
  leaseId: string
  renewed: boolean
  reason?: string
  newExpiresAt?: Date
}

export async function checkAndRenewLeases(): Promise<RenewalResult[]> {
  const now = new Date()
  const renewalThreshold = new Date(now.getTime() + RENEWAL_WINDOW_MINUTES * 60 * 1000)

  // Find active leases with auto-renew enabled expiring in next 30min
  const leasesToRenew = await prisma.accessLease.findMany({
    where: {
      status: 'ACTIVE',
      autoRenew: true,
      expiresAt: {
        lte: renewalThreshold,
        gt: now
      },
      deletedAt: null
    },
    include: {
      executions: {
        select: {
          totalCost: true
        }
      }
    }
  })

  const results: RenewalResult[] = []

  for (const lease of leasesToRenew) {
    try {
      // Check if max renewals reached
      if (lease.renewalsCount >= lease.maxRenewals) {
        results.push({
          leaseId: lease.leaseId,
          renewed: false,
          reason: `Max renewals (${lease.maxRenewals}) reached`
        })
        
        // Send alert that lease will expire
        await sendLeaseExpiryAlert(lease.leaseId, 'MAX_RENEWALS_REACHED')
        continue
      }

      // Check budget limit
      if (lease.budgetLimit) {
        // Calculate total cost from executions
        const totalCost = lease.executions.reduce((sum: number, exec: any) => sum + Number(exec.totalCost), 0)
        
        if (totalCost >= Number(lease.budgetLimit)) {
          results.push({
            leaseId: lease.leaseId,
            renewed: false,
            reason: `Budget limit ($${lease.budgetLimit}) reached`
          })
          
          await sendLeaseExpiryAlert(lease.leaseId, 'BUDGET_EXCEEDED')
          continue
        }
      }

      // Renew lease by extending expiresAt by ttlSeconds
      const newExpiresAt = new Date(lease.expiresAt.getTime() + lease.ttlSeconds * 1000)

      await prisma.accessLease.update({
        where: { id: lease.id },
        data: {
          expiresAt: newExpiresAt,
          renewalsCount: lease.renewalsCount + 1,
          lastRenewedAt: now,
          alert30minSent: false, // Reset alert flags
          alert5minSent: false
        }
      })

      results.push({
        leaseId: lease.leaseId,
        renewed: true,
        newExpiresAt
      })

      console.log(`✓ Auto-renewed lease ${lease.leaseId} until ${newExpiresAt.toISOString()}`)

      // Send success notification
      await sendLeaseExpiryAlert(lease.leaseId, 'AUTO_RENEWED', { newExpiresAt })

    } catch (error) {
      console.error(`✗ Failed to renew lease ${lease.leaseId}:`, error)
      results.push({
        leaseId: lease.leaseId,
        renewed: false,
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return results
}

/**
 * Start the auto-renew background job
 * Call this from your server startup (e.g., in a Next.js API route or separate worker)
 */
export function startAutoRenewJob() {
  console.log('→ Starting lease auto-renew job (every 5 minutes)')
  
  // Run immediately on startup
  checkAndRenewLeases().catch(console.error)
  
  // Then run every 5 minutes
  setInterval(() => {
    checkAndRenewLeases().catch(console.error)
  }, CHECK_INTERVAL_MS)
}

/**
 * Manual renewal endpoint helper
 */
export async function manuallyExtendLease(
  leaseId: string,
  additionalSeconds: number
): Promise<{ success: boolean; newExpiresAt?: Date; error?: string }> {
  try {
    const lease = await prisma.accessLease.findUnique({
      where: { leaseId },
      include: {
        executions: {
          select: { totalCost: true }
        }
      }
    })

    if (!lease) {
      return { success: false, error: 'Lease not found' }
    }

    if (lease.status !== 'ACTIVE') {
      return { success: false, error: `Lease is ${lease.status}` }
    }

    // Check budget if set
    if (lease.budgetLimit) {
      const totalCost = lease.executions.reduce((sum: number, exec: any) => sum + Number(exec.totalCost), 0)
      if (totalCost >= Number(lease.budgetLimit)) {
        return { success: false, error: 'Budget limit exceeded' }
      }
    }

    // Extend lease
    const newExpiresAt = new Date(lease.expiresAt.getTime() + additionalSeconds * 1000)

    await prisma.accessLease.update({
      where: { id: lease.id },
      data: {
        expiresAt: newExpiresAt,
        lastRenewedAt: new Date(),
        alert30minSent: false,
        alert5minSent: false
      }
    })

    return { success: true, newExpiresAt }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
