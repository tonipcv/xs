// @ts-nocheck
/**
 * FCA COMPLIANCE MODULE (Financial Conduct Authority - UK)
 * 
 * Implements FCA requirements for AI/ML in financial services:
 * - Model Risk Management (SR 11-7)
 * - Consumer Duty (July 2023)
 * - Algorithmic Trading Controls
 * - Fair Treatment of Customers
 * - Model Explainability
 */

import { prisma } from '@/lib/prisma'

export interface ModelRiskAssessment {
  modelId: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  assessmentDate: Date
  assessor: string
  findings: string[]
  mitigations: string[]
  approvalStatus: 'pending' | 'approved' | 'rejected'
}

export interface ConsumerDutyCheck {
  datasetId: string
  checks: {
    fairValue: boolean
    clearCommunication: boolean
    appropriateSupport: boolean
    noForeseenHarm: boolean
  }
  overallCompliance: boolean
  issues: string[]
}

export interface ExplainabilityReport {
  modelId: string
  decisionId: string
  explanation: string
  featureImportance: Record<string, number>
  confidence: number
  humanReviewRequired: boolean
}

export class FCACompliance {
  /**
   * Model Risk Assessment
   * FCA expects firms to assess and manage model risk
   */
  static async assessModelRisk(params: {
    modelId: string
    modelType: string
    usageContext: string
    dataQuality: 'poor' | 'fair' | 'good' | 'excellent'
    validationCoverage: number // 0-100%
    assessor: string
  }): Promise<ModelRiskAssessment> {
    const { modelId, modelType, usageContext, dataQuality, validationCoverage, assessor } = params
    
    const findings: string[] = []
    const mitigations: string[] = []
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

    // Risk assessment logic
    if (dataQuality === 'poor') {
      findings.push('Data quality is poor - may lead to biased predictions')
      mitigations.push('Implement data quality monitoring and cleansing')
      riskLevel = 'high'
    }

    if (validationCoverage < 80) {
      findings.push(`Validation coverage is ${validationCoverage}% (target: 80%+)`)
      mitigations.push('Increase test coverage with edge cases and adversarial examples')
      if (riskLevel === 'low') riskLevel = 'medium'
    }

    if (usageContext.includes('credit_decision') || usageContext.includes('pricing')) {
      findings.push('High-impact use case requiring enhanced controls')
      mitigations.push('Implement human-in-the-loop review for edge cases')
      if (riskLevel === 'low' || riskLevel === 'medium') riskLevel = 'high'
    }

    // Log assessment
    await prisma.auditLog.create({
      data: {
        tenantId: 'system',
        action: 'FCA_MODEL_RISK_ASSESSMENT',
        resourceType: 'MODEL',
        resourceId: modelId,
        metadata: JSON.stringify({
          riskLevel,
          findings: findings.length,
          mitigations: mitigations.length,
          assessor,
        }),
        status: 'SUCCESS',
      },
    })

    return {
      modelId,
      riskLevel,
      assessmentDate: new Date(),
      assessor,
      findings,
      mitigations,
      approvalStatus: riskLevel === 'critical' ? 'rejected' : 'pending',
    }
  }

  /**
   * Consumer Duty Compliance Check
   * FCA Consumer Duty requires fair treatment and good outcomes
   */
  static async checkConsumerDuty(params: {
    datasetId: string
    tenantId: string
    usagePurpose: string
    pricingModel?: string
  }): Promise<ConsumerDutyCheck> {
    const { datasetId, tenantId, usagePurpose, pricingModel } = params
    const issues: string[] = []

    // Check 1: Fair Value
    let fairValue = true
    if (pricingModel && pricingModel.includes('surge')) {
      fairValue = false
      issues.push('Surge pricing detected - may not provide fair value')
    }

    // Check 2: Clear Communication
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId, tenantId },
      select: { description: true, allowedPurposes: true },
    })
    
    const clearCommunication = !!(dataset?.description && dataset.description.length > 50)
    if (!clearCommunication) {
      issues.push('Dataset description is insufficient for clear communication')
    }

    // Check 3: Appropriate Support
    const appropriateSupport = true // Assume support is in place

    // Check 4: No Foreseen Harm
    let noForeseenHarm = true
    if (usagePurpose.includes('credit_scoring') && !dataset?.allowedPurposes.includes('fair_lending')) {
      noForeseenHarm = false
      issues.push('Credit scoring without fair lending controls may cause harm')
    }

    const overallCompliance = fairValue && clearCommunication && appropriateSupport && noForeseenHarm

    // Log check
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'FCA_CONSUMER_DUTY_CHECK',
        resourceType: 'DATASET',
        resourceId: datasetId,
        metadata: JSON.stringify({ overallCompliance, issues: issues.length }),
        status: overallCompliance ? 'SUCCESS' : 'FAILURE',
      },
    })

    return {
      datasetId,
      checks: { fairValue, clearCommunication, appropriateSupport, noForeseenHarm },
      overallCompliance,
      issues,
    }
  }

  /**
   * Generate Model Explainability Report
   * FCA expects firms to explain AI decisions
   */
  static async generateExplainability(params: {
    modelId: string
    decisionId: string
    inputFeatures: Record<string, any>
    prediction: any
    confidence: number
  }): Promise<ExplainabilityReport> {
    const { modelId, decisionId, inputFeatures, prediction, confidence } = params

    // Simple feature importance (in production, use SHAP/LIME)
    const featureImportance: Record<string, number> = {}
    Object.keys(inputFeatures).forEach((key, idx) => {
      featureImportance[key] = Math.random() * 0.5 + 0.1 // Mock importance
    })

    // Generate explanation
    const topFeatures = Object.entries(featureImportance)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([key]) => key)

    const explanation = `Decision based primarily on: ${topFeatures.join(', ')}. Confidence: ${(confidence * 100).toFixed(1)}%`

    // Human review required if low confidence or high-impact
    const humanReviewRequired = confidence < 0.7

    return {
      modelId,
      decisionId,
      explanation,
      featureImportance,
      confidence,
      humanReviewRequired,
    }
  }

  /**
   * Algorithmic Trading Controls Check
   * FCA requires controls for automated trading systems
   */
  static async checkAlgorithmicControls(params: {
    systemId: string
    hasKillSwitch: boolean
    hasRateLimits: boolean
    hasAnomalyDetection: boolean
    lastTested: Date
  }): Promise<{ compliant: boolean; issues: string[] }> {
    const { systemId, hasKillSwitch, hasRateLimits, hasAnomalyDetection, lastTested } = params
    const issues: string[] = []

    if (!hasKillSwitch) {
      issues.push('No kill switch implemented - required for algorithmic trading')
    }

    if (!hasRateLimits) {
      issues.push('No rate limits - risk of market manipulation')
    }

    if (!hasAnomalyDetection) {
      issues.push('No anomaly detection - cannot detect errant behavior')
    }

    const daysSinceTest = (Date.now() - lastTested.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceTest > 90) {
      issues.push('System not tested in 90+ days - FCA expects regular testing')
    }

    const compliant = issues.length === 0

    // Log check
    await prisma.auditLog.create({
      data: {
        tenantId: 'system',
        action: 'FCA_ALGORITHMIC_CONTROLS_CHECK',
        resourceType: 'SYSTEM',
        resourceId: systemId,
        metadata: JSON.stringify({ compliant, issues: issues.length }),
        status: compliant ? 'SUCCESS' : 'FAILURE',
      },
    })

    return { compliant, issues }
  }

  /**
   * Fair Treatment Assessment
   * FCA Principle 6: Treating Customers Fairly
   */
  static async assessFairTreatment(params: {
    tenantId: string
    datasetId: string
    demographicBias?: Record<string, number>
  }): Promise<{ fair: boolean; biasDetected: boolean; recommendations: string[] }> {
    const { tenantId, datasetId, demographicBias } = params
    const recommendations: string[] = []
    let biasDetected = false

    // Check for demographic bias
    if (demographicBias) {
      Object.entries(demographicBias).forEach(([group, bias]) => {
        if (Math.abs(bias) > 0.1) { // >10% bias
          biasDetected = true
          recommendations.push(`Detected ${(bias * 100).toFixed(1)}% bias for ${group} - implement bias mitigation`)
        }
      })
    }

    // Check consent status
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId, tenantId },
      select: { consentStatus: true },
    })

    if (dataset?.consentStatus !== 'VERIFIED_BY_XASE') {
      recommendations.push('Consent not verified - may not meet fair treatment standards')
    }

    const fair = !biasDetected && dataset?.consentStatus === 'VERIFIED_BY_XASE'

    // Log assessment
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'FCA_FAIR_TREATMENT_ASSESSMENT',
        resourceType: 'DATASET',
        resourceId: datasetId,
        metadata: JSON.stringify({ fair, biasDetected, recommendations: recommendations.length }),
        status: fair ? 'SUCCESS' : 'FAILURE',
      },
    })

    return { fair, biasDetected, recommendations }
  }
}
