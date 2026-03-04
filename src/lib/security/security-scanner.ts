/**
 * SECURITY SCANNER
 * Scan for security vulnerabilities and issues
 */

import { prisma } from '@/lib/prisma'

export interface SecurityIssue {
  id: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  category: string
  title: string
  description: string
  recommendation: string
  affectedResource?: string
  detectedAt: Date
}

export interface SecurityScanResult {
  scanId: string
  startedAt: Date
  completedAt: Date
  issues: SecurityIssue[]
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
}

export class SecurityScanner {
  /**
   * Run full security scan
   */
  static async scan(tenantId: string): Promise<SecurityScanResult> {
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const startedAt = new Date()
    const issues: SecurityIssue[] = []

    // Run all checks
    issues.push(...await this.checkWeakPasswords(tenantId))
    issues.push(...await this.checkUnencryptedData(tenantId))
    issues.push(...await this.checkExpiredCredentials(tenantId))
    issues.push(...await this.checkMissingConsent(tenantId))
    issues.push(...await this.checkDataRetention(tenantId))
    issues.push(...await this.checkAccessControls(tenantId))

    const summary = {
      total: issues.length,
      critical: issues.filter(i => i.severity === 'CRITICAL').length,
      high: issues.filter(i => i.severity === 'HIGH').length,
      medium: issues.filter(i => i.severity === 'MEDIUM').length,
      low: issues.filter(i => i.severity === 'LOW').length,
    }

    return {
      scanId,
      startedAt,
      completedAt: new Date(),
      issues,
      summary,
    }
  }

  /**
   * Check for weak passwords
   */
  private static async checkWeakPasswords(tenantId: string): Promise<SecurityIssue[]> {
    // Placeholder - would check actual password policies
    return []
  }

  /**
   * Check for unencrypted sensitive data
   */
  private static async checkUnencryptedData(tenantId: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = []

    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: { id: true, name: true, encryptionStatus: true },
    })

    for (const dataset of datasets) {
      if (dataset.encryptionStatus !== 'ENCRYPTED') {
        issues.push({
          id: `unencrypted_${dataset.id}`,
          severity: 'HIGH',
          category: 'ENCRYPTION',
          title: 'Unencrypted Dataset',
          description: `Dataset "${dataset.name}" is not encrypted`,
          recommendation: 'Enable encryption for sensitive datasets',
          affectedResource: dataset.id,
          detectedAt: new Date(),
        })
      }
    }

    return issues
  }

  /**
   * Check for expired credentials
   */
  private static async checkExpiredCredentials(tenantId: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = []

    const apiKeys = await prisma.apiKey.findMany({
      where: {
        tenantId,
        expiresAt: { lt: new Date() },
        revokedAt: null,
      },
    })

    for (const key of apiKeys) {
      issues.push({
        id: `expired_key_${key.id}`,
        severity: 'MEDIUM',
        category: 'CREDENTIALS',
        title: 'Expired API Key',
        description: 'API key has expired but not revoked',
        recommendation: 'Revoke expired API keys',
        affectedResource: key.id,
        detectedAt: new Date(),
      })
    }

    return issues
  }

  /**
   * Check for missing consent
   */
  private static async checkMissingConsent(tenantId: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = []

    // Check datasets without consent records
    const datasetsWithoutConsent = await prisma.dataset.findMany({
      where: {
        tenantId,
        consentRecords: { none: {} },
      },
      take: 10,
    })

    if (datasetsWithoutConsent.length > 0) {
      issues.push({
        id: 'missing_consent',
        severity: 'HIGH',
        category: 'COMPLIANCE',
        title: 'Missing Consent Records',
        description: `${datasetsWithoutConsent.length} datasets have no consent records`,
        recommendation: 'Ensure all datasets have proper consent documentation',
        detectedAt: new Date(),
      })
    }

    return issues
  }

  /**
   * Check data retention compliance
   */
  private static async checkDataRetention(tenantId: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = []

    // Check for very old audit logs
    const oldLogs = await prisma.auditLog.count({
      where: {
        tenantId,
        timestamp: { lt: new Date(Date.now() - 365 * 86400000) },
      },
    })

    if (oldLogs > 1000) {
      issues.push({
        id: 'old_audit_logs',
        severity: 'MEDIUM',
        category: 'DATA_RETENTION',
        title: 'Old Audit Logs',
        description: `${oldLogs} audit logs older than 1 year`,
        recommendation: 'Review and archive old audit logs',
        detectedAt: new Date(),
      })
    }

    return issues
  }

  /**
   * Check access controls
   */
  private static async checkAccessControls(tenantId: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = []

    // Check for overly permissive policies
    const openPolicies = await prisma.accessPolicy.count({
      where: {
        clientTenantId: tenantId,
        allowedPurposes: { has: 'ANY' },
      },
    })

    if (openPolicies > 0) {
      issues.push({
        id: 'permissive_policies',
        severity: 'MEDIUM',
        category: 'ACCESS_CONTROL',
        title: 'Overly Permissive Policies',
        description: `${openPolicies} policies allow ANY purpose`,
        recommendation: 'Restrict policies to specific purposes',
        detectedAt: new Date(),
      })
    }

    return issues
  }

  /**
   * Get security score
   */
  static calculateSecurityScore(result: SecurityScanResult): number {
    const weights = {
      CRITICAL: 10,
      HIGH: 5,
      MEDIUM: 2,
      LOW: 1,
    }

    const totalDeductions = 
      result.summary.critical * weights.CRITICAL +
      result.summary.high * weights.HIGH +
      result.summary.medium * weights.MEDIUM +
      result.summary.low * weights.LOW

    const maxScore = 100
    const score = Math.max(0, maxScore - totalDeductions)

    return score
  }

  /**
   * Get recommendations
   */
  static getRecommendations(result: SecurityScanResult): string[] {
    const recommendations = new Set<string>()

    for (const issue of result.issues) {
      recommendations.add(issue.recommendation)
    }

    return Array.from(recommendations)
  }

  /**
   * Export scan report
   */
  static exportReport(result: SecurityScanResult): string {
    const lines = [
      `Security Scan Report`,
      `Scan ID: ${result.scanId}`,
      `Completed: ${result.completedAt.toISOString()}`,
      ``,
      `Summary:`,
      `- Total Issues: ${result.summary.total}`,
      `- Critical: ${result.summary.critical}`,
      `- High: ${result.summary.high}`,
      `- Medium: ${result.summary.medium}`,
      `- Low: ${result.summary.low}`,
      ``,
      `Security Score: ${this.calculateSecurityScore(result)}/100`,
      ``,
      `Issues:`,
    ]

    for (const issue of result.issues) {
      lines.push(``)
      lines.push(`[${issue.severity}] ${issue.title}`)
      lines.push(`Category: ${issue.category}`)
      lines.push(`Description: ${issue.description}`)
      lines.push(`Recommendation: ${issue.recommendation}`)
      if (issue.affectedResource) {
        lines.push(`Affected: ${issue.affectedResource}`)
      }
    }

    return lines.join('\n')
  }
}
