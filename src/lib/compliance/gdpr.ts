// @ts-nocheck
/**
 * GDPR COMPLIANCE MODULE
 * 
 * Implements GDPR requirements:
 * - Data Subject Access Request (DSAR)
 * - Right to Erasure (Right to be Forgotten)
 * - Data Portability
 * - Consent Management
 * - Breach Notification
 */

import { prisma } from '@/lib/prisma'
import { getRedisClient } from '@/lib/redis'
import { ConsentManager } from '@/lib/xase/consent-manager'

export interface DSARRequest {
  userId?: string
  email?: string
  tenantId: string
  requestedBy: string
  requestDate: Date
}

export interface DSARResponse {
  requestId: string
  personalData: {
    datasets: any[]
    policies: any[]
    leases: any[]
    accessLogs: any[]
    auditLogs: any[]
  }
  metadata: {
    dataController: string
    processingPurposes: string[]
    retentionPeriod: string
    thirdPartySharing: string[]
  }
  generatedAt: Date
  expiresAt: Date
}

export interface ErasureRequest {
  userId?: string
  email?: string
  tenantId: string
  reason: string
  requestedBy: string
}

export interface PortabilityRequest {
  userId?: string
  email?: string
  tenantId: string
  format: 'json' | 'csv' | 'xml'
  requestedBy: string
}

export class GDPRCompliance {
  /**
   * Data Subject Access Request (DSAR)
   * Article 15 GDPR
   */
  static async processDSAR(request: DSARRequest): Promise<DSARResponse> {
    const { userId, email, tenantId, requestedBy } = request
    const requestId = `dsar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      // 1. Find all datasets associated with user
      const datasets = await prisma.dataset.findMany({
        where: {
          tenantId,
          OR: [
            { metadata: { path: ['userId'], equals: userId } },
            { metadata: { path: ['email'], equals: email } },
          ],
        },
        select: {
          datasetId: true,
          name: true,
          description: true,
          consentStatus: true,
          consentVersion: true,
          allowedPurposes: true,
          jurisdiction: true,
          retentionExpiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      // 2. Find all policies
      const policies = await prisma.voiceAccessPolicy.findMany({
        where: {
          OR: [
            { dataset: { tenantId } },
            { clientTenantId: tenantId },
          ],
        },
        select: {
          policyId: true,
          usagePurpose: true,
          maxHours: true,
          allowedEnvironment: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
      })

      // 3. Find all leases
      const leases = await prisma.voiceAccessLease.findMany({
        where: {
          OR: [
            { dataset: { tenantId } },
            { clientTenantId: tenantId },
          ],
        },
        select: {
          leaseId: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          revokedAt: true,
          revokedReason: true,
        },
      })

      // 4. Find access logs
      const accessLogs = await prisma.voiceAccessLog.findMany({
        where: {
          dataset: { tenantId },
        },
        select: {
          action: true,
          outcome: true,
          timestamp: true,
          ipAddress: true,
          filesAccessed: true,
          hoursAccessed: true,
        },
        orderBy: { timestamp: 'desc' },
        take: 1000, // Limit to last 1000 entries
      })

      // 5. Find audit logs
      const auditLogs = await prisma.auditLog.findMany({
        where: { tenantId },
        select: {
          action: true,
          resourceType: true,
          resourceId: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      })

      // 6. Log DSAR request
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'DSAR_REQUEST',
          resourceType: 'USER',
          resourceId: userId || email || 'unknown',
          metadata: JSON.stringify({ requestId, requestedBy }),
          status: 'SUCCESS',
        },
      })

      const response: DSARResponse = {
        requestId,
        personalData: {
          datasets,
          policies,
          leases,
          accessLogs,
          auditLogs,
        },
        metadata: {
          dataController: 'Xase Platform',
          processingPurposes: ['Voice data governance', 'AI model training', 'Quality assurance'],
          retentionPeriod: '7 years (regulatory requirement)',
          thirdPartySharing: ['AI Labs (with consent)', 'Cloud storage providers (AWS S3)'],
        },
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      }

      return response
    } catch (error: any) {
      console.error('[GDPR] DSAR processing error:', error)
      throw new Error(`DSAR processing failed: ${error.message}`)
    }
  }

  /**
   * Right to Erasure (Right to be Forgotten)
   * Article 17 GDPR
   */
  static async processErasure(request: ErasureRequest): Promise<{ success: boolean; deletedRecords: number }> {
    const { userId, email, tenantId, reason, requestedBy } = request
    let deletedRecords = 0

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Find datasets to delete
        const datasets = await tx.dataset.findMany({
          where: {
            tenantId,
            OR: [
              { metadata: { path: ['userId'], equals: userId } },
              { metadata: { path: ['email'], equals: email } },
            ],
          },
          select: { id: true, datasetId: true },
        })

        for (const dataset of datasets) {
          // Revoke consent first
          await ConsentManager.revokeConsent({
            datasetId: dataset.datasetId,
            tenantId,
            userId,
            reason: `Erasure request: ${reason}`,
            revokedBy: requestedBy,
          })

          // Delete related records (cascading)
          const deleted = await tx.dataset.delete({
            where: { id: dataset.id },
          })
          if (deleted) deletedRecords++
        }

        // 2. Anonymize audit logs (don't delete for compliance)
        await tx.auditLog.updateMany({
          where: {
            tenantId,
            resourceId: userId || email || '',
          },
          data: {
            metadata: JSON.stringify({ anonymized: true, reason: 'GDPR erasure' }),
          },
        })

        // 3. Log erasure request
        await tx.auditLog.create({
          data: {
            tenantId,
            action: 'ERASURE_REQUEST',
            resourceType: 'USER',
            resourceId: userId || email || 'unknown',
            metadata: JSON.stringify({ reason, requestedBy, deletedRecords }),
            status: 'SUCCESS',
          },
        })
      })

      return { success: true, deletedRecords }
    } catch (error: any) {
      console.error('[GDPR] Erasure processing error:', error)
      throw new Error(`Erasure processing failed: ${error.message}`)
    }
  }

  /**
   * Data Portability
   * Article 20 GDPR
   */
  static async processPortability(request: PortabilityRequest): Promise<{ data: any; format: string }> {
    const { userId, email, tenantId, format, requestedBy } = request

    try {
      // Get all personal data (similar to DSAR)
      const dsarResponse = await this.processDSAR({
        userId,
        email,
        tenantId,
        requestedBy,
        requestDate: new Date(),
      })

      // Format data based on request
      let formattedData: any

      switch (format) {
        case 'json':
          formattedData = JSON.stringify(dsarResponse.personalData, null, 2)
          break

        case 'csv':
          // Simple CSV conversion (in production, use proper CSV library)
          formattedData = this.convertToCSV(dsarResponse.personalData)
          break

        case 'xml':
          // Simple XML conversion (in production, use proper XML library)
          formattedData = this.convertToXML(dsarResponse.personalData)
          break

        default:
          formattedData = JSON.stringify(dsarResponse.personalData, null, 2)
      }

      // Log portability request
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'PORTABILITY_REQUEST',
          resourceType: 'USER',
          resourceId: userId || email || 'unknown',
          metadata: JSON.stringify({ format, requestedBy }),
          status: 'SUCCESS',
        },
      })

      return { data: formattedData, format }
    } catch (error: any) {
      console.error('[GDPR] Portability processing error:', error)
      throw new Error(`Portability processing failed: ${error.message}`)
    }
  }

  /**
   * Breach Notification Check
   * Article 33 GDPR - Must notify within 72 hours
   */
  static async checkBreachNotificationRequirement(incident: {
    type: string
    affectedRecords: number
    severity: 'low' | 'medium' | 'high' | 'critical'
    detectedAt: Date
  }): Promise<{ notificationRequired: boolean; deadline: Date; reason: string }> {
    const { type, affectedRecords, severity, detectedAt } = incident

    // GDPR requires notification within 72 hours if there's a risk to rights and freedoms
    const deadline = new Date(detectedAt.getTime() + 72 * 60 * 60 * 1000)

    let notificationRequired = false
    let reason = ''

    // Determine if notification is required
    if (severity === 'critical' || severity === 'high') {
      notificationRequired = true
      reason = 'High/critical severity breach affecting personal data'
    } else if (affectedRecords > 100) {
      notificationRequired = true
      reason = 'Large number of affected records (>100)'
    } else if (type.includes('unauthorized_access') || type.includes('data_leak')) {
      notificationRequired = true
      reason = 'Unauthorized access or data leak detected'
    }

    return { notificationRequired, deadline, reason }
  }

  /**
   * Consent Audit Trail
   * Article 7 GDPR - Demonstrate consent
   */
  static async getConsentAuditTrail(datasetId: string, tenantId: string): Promise<any[]> {
    const auditTrail = await prisma.auditLog.findMany({
      where: {
        tenantId,
        resourceId: datasetId,
        action: { in: ['CONSENT_GRANTED', 'CONSENT_REVOKED'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        action: true,
        metadata: true,
        createdAt: true,
        status: true,
      },
    })

    return auditTrail
  }

  // Helper methods
  private static convertToCSV(data: any): string {
    // Simple CSV conversion (production should use proper library)
    const rows: string[] = []
    
    // Datasets
    if (data.datasets && data.datasets.length > 0) {
      rows.push('=== DATASETS ===')
      rows.push(Object.keys(data.datasets[0]).join(','))
      data.datasets.forEach((d: any) => {
        rows.push(Object.values(d).join(','))
      })
      rows.push('')
    }

    return rows.join('\n')
  }

  private static convertToXML(data: any): string {
    // Simple XML conversion (production should use proper library)
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<personal_data>\n'
    
    if (data.datasets) {
      xml += '  <datasets>\n'
      data.datasets.forEach((d: any) => {
        xml += '    <dataset>\n'
        Object.entries(d).forEach(([key, value]) => {
          xml += `      <${key}>${value}</${key}>\n`
        })
        xml += '    </dataset>\n'
      })
      xml += '  </datasets>\n'
    }

    xml += '</personal_data>'
    return xml
  }
}
