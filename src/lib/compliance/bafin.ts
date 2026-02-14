// @ts-nocheck
/**
 * BAFIN COMPLIANCE MODULE (Bundesanstalt für Finanzdienstleistungsaufsicht - Germany)
 * 
 * Implements BaFin requirements for AI/ML in financial services:
 * - MaRisk (Minimum Requirements for Risk Management)
 * - BAIT (Supervisory Requirements for IT in Financial Institutions)
 * - AI Risk Assessment
 * - Operational Resilience
 * - Data Quality Standards
 */

import { prisma } from '@/lib/prisma'

export interface MaRiskAssessment {
  systemId: string
  riskCategory: 'low' | 'medium' | 'high' | 'very_high'
  assessmentDate: Date
  controls: {
    changeManagement: boolean
    accessControl: boolean
    dataBackup: boolean
    incidentResponse: boolean
    businessContinuity: boolean
  }
  compliant: boolean
  gaps: string[]
}

export interface BAITCompliance {
  systemId: string
  requirements: {
    informationSecurity: boolean
    dataProtection: boolean
    systemAvailability: boolean
    changeManagement: boolean
    outsourcingControl: boolean
  }
  overallCompliance: boolean
  criticalIssues: string[]
}

export interface AIRiskClassification {
  modelId: string
  riskClass: 'minimal' | 'limited' | 'high' | 'unacceptable'
  reasoning: string[]
  mitigationRequired: boolean
  humanOversightRequired: boolean
}

// @ts-nocheck
export class BaFinCompliance {
  /**
   * MaRisk Assessment
   * BaFin MaRisk requires comprehensive risk management
   */
  static async assessMaRisk(params: {
    systemId: string
    tenantId: string
    hasChangeManagement: boolean
    hasAccessControl: boolean
    hasDataBackup: boolean
    hasIncidentResponse: boolean
    hasBusinessContinuity: boolean
    criticalityLevel: 'low' | 'medium' | 'high' | 'very_high'
  }): Promise<MaRiskAssessment> {
    const {
      systemId,
      tenantId,
      hasChangeManagement,
      hasAccessControl,
      hasDataBackup,
      hasIncidentResponse,
      hasBusinessContinuity,
      criticalityLevel,
    } = params

    const controls = {
      changeManagement: hasChangeManagement,
      accessControl: hasAccessControl,
      dataBackup: hasDataBackup,
      incidentResponse: hasIncidentResponse,
      businessContinuity: hasBusinessContinuity,
    }

    const gaps: string[] = []
    if (!hasChangeManagement) gaps.push('Change management process missing')
    if (!hasAccessControl) gaps.push('Access control insufficient')
    if (!hasDataBackup) gaps.push('Data backup strategy not implemented')
    if (!hasIncidentResponse) gaps.push('Incident response plan missing')
    if (!hasBusinessContinuity) gaps.push('Business continuity plan missing')

    // For high/very_high criticality, all controls must be in place
    const compliant = criticalityLevel === 'low' || criticalityLevel === 'medium'
      ? gaps.length <= 1
      : gaps.length === 0

    // Log assessment
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'BAFIN_MARISK_ASSESSMENT',
        resourceType: 'SYSTEM',
        resourceId: systemId,
        metadata: JSON.stringify({
          riskCategory: criticalityLevel,
          compliant,
          gaps: gaps.length,
        }),
        status: compliant ? 'SUCCESS' : 'FAILURE',
      },
    })

    return {
      systemId,
      riskCategory: criticalityLevel,
      assessmentDate: new Date(),
      controls,
      compliant,
      gaps,
    }
  }

  /**
   * BAIT Compliance Check
   * BaFin BAIT sets requirements for IT systems
   */
  static async checkBAIT(params: {
    systemId: string
    tenantId: string
    hasEncryption: boolean
    hasAccessLogs: boolean
    uptimePercentage: number
    hasVersionControl: boolean
    hasVendorManagement: boolean
  }): Promise<BAITCompliance> {
    const {
      systemId,
      tenantId,
      hasEncryption,
      hasAccessLogs,
      uptimePercentage,
      hasVersionControl,
      hasVendorManagement,
    } = params

    const criticalIssues: string[] = []

    // Information Security
    const informationSecurity = hasEncryption && hasAccessLogs
    if (!informationSecurity) {
      criticalIssues.push('Information security controls incomplete (encryption/logging)')
    }

    // Data Protection (GDPR alignment)
    const dataProtection = hasEncryption
    if (!dataProtection) {
      criticalIssues.push('Data protection insufficient - encryption required')
    }

    // System Availability (BAIT requires 99.5% for critical systems)
    const systemAvailability = uptimePercentage >= 99.5
    if (!systemAvailability) {
      criticalIssues.push(`System availability ${uptimePercentage}% below BAIT requirement (99.5%)`)
    }

    // Change Management
    const changeManagement = hasVersionControl
    if (!changeManagement) {
      criticalIssues.push('Version control missing - required for change management')
    }

    // Outsourcing Control
    const outsourcingControl = hasVendorManagement
    if (!outsourcingControl) {
      criticalIssues.push('Vendor management missing - required for outsourcing control')
    }

    const requirements = {
      informationSecurity,
      dataProtection,
      systemAvailability,
      changeManagement,
      outsourcingControl,
    }

    const overallCompliance = criticalIssues.length === 0

    // Log check
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'BAFIN_BAIT_CHECK',
        resourceType: 'SYSTEM',
        resourceId: systemId,
        metadata: JSON.stringify({
          overallCompliance,
          criticalIssues: criticalIssues.length,
        }),
        status: overallCompliance ? 'SUCCESS' : 'FAILURE',
      },
    })

    return {
      systemId,
      requirements,
      overallCompliance,
      criticalIssues,
    }
  }

  /**
   * AI Risk Classification
   * BaFin follows EU AI Act risk-based approach
   */
  static async classifyAIRisk(params: {
    modelId: string
    tenantId: string
    usageContext: string
    affectsFinancialDecisions: boolean
    affectsCreditworthiness: boolean
    hasHumanOversight: boolean
    dataQuality: 'poor' | 'fair' | 'good' | 'excellent'
  }): Promise<AIRiskClassification> {
    const {
      modelId,
      tenantId,
      usageContext,
      affectsFinancialDecisions,
      affectsCreditworthiness,
      hasHumanOversight,
      dataQuality,
    } = params

    const reasoning: string[] = []
    let riskClass: 'minimal' | 'limited' | 'high' | 'unacceptable' = 'minimal'
    let mitigationRequired = false
    let humanOversightRequired = false

    // Unacceptable risk
    if (usageContext.includes('social_scoring') || usageContext.includes('manipulation')) {
      riskClass = 'unacceptable'
      reasoning.push('Social scoring or manipulation detected - prohibited under EU AI Act')
      return { modelId, riskClass, reasoning, mitigationRequired: true, humanOversightRequired: true }
    }

    // High risk
    if (affectsCreditworthiness || affectsFinancialDecisions) {
      riskClass = 'high'
      reasoning.push('Affects creditworthiness or financial decisions - high risk classification')
      mitigationRequired = true
      humanOversightRequired = true
    }

    // Upgrade to high risk if data quality is poor
    if (dataQuality === 'poor' && riskClass !== 'unacceptable') {
      riskClass = 'high'
      reasoning.push('Poor data quality elevates risk classification')
      mitigationRequired = true
    }

    // Downgrade if human oversight exists
    if (hasHumanOversight && riskClass === 'high') {
      reasoning.push('Human oversight in place - partial risk mitigation')
    } else if (!hasHumanOversight && riskClass === 'high') {
      reasoning.push('No human oversight - requires immediate implementation')
    }

    // Limited risk
    if (riskClass === 'minimal' && usageContext.includes('customer_interaction')) {
      riskClass = 'limited'
      reasoning.push('Customer interaction requires transparency obligations')
    }

    // Log classification
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'BAFIN_AI_RISK_CLASSIFICATION',
        resourceType: 'MODEL',
        resourceId: modelId,
        metadata: JSON.stringify({
          riskClass,
          mitigationRequired,
          humanOversightRequired,
        }),
        status: 'SUCCESS',
      },
    })

    return {
      modelId,
      riskClass,
      reasoning,
      mitigationRequired,
      humanOversightRequired,
    }
  }

  /**
   * Data Quality Assessment
   * BaFin requires high data quality for AI/ML models
   */
  static async assessDataQuality(params: {
    datasetId: string
    tenantId: string
    completeness: number // 0-100%
    accuracy: number // 0-100%
    consistency: number // 0-100%
    timeliness: number // days since last update
  }): Promise<{
    quality: 'poor' | 'fair' | 'good' | 'excellent'
    score: number
    issues: string[]
    recommendations: string[]
  }> {
    const { datasetId, tenantId, completeness, accuracy, consistency, timeliness } = params
    const issues: string[] = []
    const recommendations: string[] = []

    // Calculate overall score
    const score = (completeness * 0.3 + accuracy * 0.4 + consistency * 0.2 + Math.max(0, 100 - timeliness) * 0.1)

    // Assess completeness
    if (completeness < 90) {
      issues.push(`Data completeness ${completeness}% below target (90%)`)
      recommendations.push('Implement data validation at ingestion')
    }

    // Assess accuracy
    if (accuracy < 95) {
      issues.push(`Data accuracy ${accuracy}% below target (95%)`)
      recommendations.push('Implement automated accuracy checks')
    }

    // Assess consistency
    if (consistency < 95) {
      issues.push(`Data consistency ${consistency}% below target (95%)`)
      recommendations.push('Standardize data formats and validation rules')
    }

    // Assess timeliness
    if (timeliness > 30) {
      issues.push(`Data not updated in ${timeliness} days`)
      recommendations.push('Implement automated data refresh process')
    }

    // Determine quality level
    let quality: 'poor' | 'fair' | 'good' | 'excellent'
    if (score >= 95) quality = 'excellent'
    else if (score >= 85) quality = 'good'
    else if (score >= 70) quality = 'fair'
    else quality = 'poor'

    // Log assessment
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'BAFIN_DATA_QUALITY_ASSESSMENT',
        resourceType: 'DATASET',
        resourceId: datasetId,
        metadata: JSON.stringify({
          quality,
          score: score.toFixed(1),
          issues: issues.length,
        }),
        status: quality === 'poor' ? 'FAILURE' : 'SUCCESS',
      },
    })

    return { quality, score, issues, recommendations }
  }

  /**
   * Operational Resilience Check
   * BaFin requires operational resilience for critical systems
   */
  static async checkOperationalResilience(params: {
    systemId: string
    tenantId: string
    hasDisasterRecovery: boolean
    recoveryTimeObjective: number // hours
    recoveryPointObjective: number // hours
    lastTestedDate: Date
    hasRedundancy: boolean
  }): Promise<{ resilient: boolean; issues: string[]; rto: number; rpo: number }> {
    const {
      systemId,
      tenantId,
      hasDisasterRecovery,
      recoveryTimeObjective,
      recoveryPointObjective,
      lastTestedDate,
      hasRedundancy,
    } = params

    const issues: string[] = []

    if (!hasDisasterRecovery) {
      issues.push('No disaster recovery plan - critical for operational resilience')
    }

    if (recoveryTimeObjective > 4) {
      issues.push(`RTO ${recoveryTimeObjective}h exceeds BaFin target (4h for critical systems)`)
    }

    if (recoveryPointObjective > 1) {
      issues.push(`RPO ${recoveryPointObjective}h exceeds BaFin target (1h for critical systems)`)
    }

    const daysSinceTest = (Date.now() - lastTestedDate.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceTest > 180) {
      issues.push('DR plan not tested in 180+ days - BaFin requires semi-annual testing')
    }

    if (!hasRedundancy) {
      issues.push('No system redundancy - single point of failure exists')
    }

    const resilient = issues.length === 0

    // Log check
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'BAFIN_OPERATIONAL_RESILIENCE_CHECK',
        resourceType: 'SYSTEM',
        resourceId: systemId,
        metadata: JSON.stringify({
          resilient,
          issues: issues.length,
          rto: recoveryTimeObjective,
          rpo: recoveryPointObjective,
        }),
        status: resilient ? 'SUCCESS' : 'FAILURE',
      },
    })

    return {
      resilient,
      issues,
      rto: recoveryTimeObjective,
      rpo: recoveryPointObjective,
    }
  }
}
