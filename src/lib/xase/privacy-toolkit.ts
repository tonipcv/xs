/**
 * PRIVACY TOOLKIT
 * 
 * Implementa técnicas de privacidade:
 * - k-anonymity checker
 * - Differential privacy (Laplace mechanism)
 * - PII detection
 */

export interface KAnonymityResult {
  isAnonymous: boolean
  k: number
  quasiIdentifiers: string[]
  violations: Array<{
    combination: Record<string, any>
    count: number
  }>
}

export interface DifferentialPrivacyConfig {
  epsilon: number // Privacy budget (smaller = more private)
  sensitivity: number // Query sensitivity
  mechanism: 'laplace' | 'gaussian'
}

export interface PIIDetectionResult {
  hasPII: boolean
  detectedFields: Array<{
    field: string
    type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'ip_address' | 'name'
    confidence: number
    samples: string[]
  }>
}

/**
 * K-ANONYMITY CHECKER
 * 
 * Verifica se um dataset satisfaz k-anonymity para quasi-identifiers
 */
export class KAnonymityChecker {
  /**
   * Check if dataset satisfies k-anonymity
   * 
   * @param data Array of records
   * @param quasiIdentifiers Columns that are quasi-identifiers
   * @param k Minimum group size
   */
  static check(
    data: any[],
    quasiIdentifiers: string[],
    k: number
  ): KAnonymityResult {
    if (data.length === 0) {
      return {
        isAnonymous: true,
        k: 0,
        quasiIdentifiers,
        violations: [],
      }
    }

    // Group by quasi-identifier combinations
    const groups = new Map<string, any[]>()

    for (const row of data) {
      const key = this.getQuasiIdentifierKey(row, quasiIdentifiers)
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(row)
    }

    // Find violations (groups with size < k)
    const violations: Array<{ combination: Record<string, any>; count: number }> = []
    let minGroupSize = Infinity

    for (const [key, group] of groups.entries()) {
      const groupSize = group.length
      minGroupSize = Math.min(minGroupSize, groupSize)

      if (groupSize < k) {
        const combination = this.parseQuasiIdentifierKey(key, quasiIdentifiers)
        violations.push({ combination, count: groupSize })
      }
    }

    return {
      isAnonymous: violations.length === 0,
      k: minGroupSize === Infinity ? 0 : minGroupSize,
      quasiIdentifiers,
      violations,
    }
  }

  private static getQuasiIdentifierKey(row: any, quasiIdentifiers: string[]): string {
    const values = quasiIdentifiers.map(qi => String(row[qi] ?? 'NULL'))
    return values.join('|||')
  }

  private static parseQuasiIdentifierKey(
    key: string,
    quasiIdentifiers: string[]
  ): Record<string, any> {
    const values = key.split('|||')
    const combination: Record<string, any> = {}
    quasiIdentifiers.forEach((qi, i) => {
      combination[qi] = values[i] === 'NULL' ? null : values[i]
    })
    return combination
  }

  /**
   * Suggest generalization to achieve k-anonymity
   */
  static suggestGeneralization(
    data: any[],
    quasiIdentifiers: string[],
    k: number
  ): Record<string, string[]> {
    const suggestions: Record<string, string[]> = {}

    for (const qi of quasiIdentifiers) {
      const values = data.map(row => row[qi])
      const uniqueValues = new Set(values)

      if (uniqueValues.size > k) {
        suggestions[qi] = [
          `Generalize ${qi} (${uniqueValues.size} unique values)`,
          `Example: age 25 → age_group 20-30`,
          `Example: zipcode 94102 → zipcode 941**`,
        ]
      }
    }

    return suggestions
  }
}

/**
 * DIFFERENTIAL PRIVACY
 * 
 * Adiciona ruído calibrado para garantir differential privacy
 */
export class DifferentialPrivacy {
  /**
   * Add Laplace noise to a numeric value
   * 
   * @param value Original value
   * @param config Privacy configuration
   */
  static addLaplaceNoise(value: number, config: DifferentialPrivacyConfig): number {
    const scale = config.sensitivity / config.epsilon
    const noise = this.sampleLaplace(scale)
    return value + noise
  }

  /**
   * Add noise to query result (count, sum, avg)
   */
  static addNoiseToAggregate(
    result: number,
    queryType: 'count' | 'sum' | 'avg',
    config: DifferentialPrivacyConfig
  ): number {
    // Adjust sensitivity based on query type
    let sensitivity = config.sensitivity

    if (queryType === 'count') {
      sensitivity = 1 // Adding/removing one record changes count by 1
    } else if (queryType === 'avg') {
      sensitivity = config.sensitivity / result // Approximate
    }

    const adjustedConfig = { ...config, sensitivity }
    return this.addLaplaceNoise(result, adjustedConfig)
  }

  /**
   * Sample from Laplace distribution
   */
  private static sampleLaplace(scale: number): number {
    // Use inverse CDF method
    const u = Math.random() - 0.5
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u))
  }

  /**
   * Calculate privacy budget remaining
   */
  static calculateRemainingBudget(
    totalBudget: number,
    queriesExecuted: Array<{ epsilon: number }>
  ): number {
    const spent = queriesExecuted.reduce((sum, q) => sum + q.epsilon, 0)
    return Math.max(0, totalBudget - spent)
  }

  /**
   * Recommend epsilon for query
   */
  static recommendEpsilon(
    queryType: 'count' | 'sum' | 'avg',
    datasetSize: number
  ): number {
    // Smaller epsilon = more privacy, but more noise
    // Larger datasets can afford smaller epsilon

    if (datasetSize < 100) {
      return 1.0 // High noise for small datasets
    } else if (datasetSize < 1000) {
      return 0.5
    } else if (datasetSize < 10000) {
      return 0.1
    } else {
      return 0.01 // Low noise for large datasets
    }
  }
}

/**
 * PII DETECTOR
 * 
 * Detecta informações pessoais identificáveis (PII) em datasets
 */
export class PIIDetector {
  private static patterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    phone: /\b(\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/,
    credit_card: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
    ip_address: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  }

  private static nameIndicators = [
    'name', 'first_name', 'last_name', 'full_name',
    'firstname', 'lastname', 'fullname', 'username',
  ]

  /**
   * Detect PII in dataset
   */
  static detect(data: any[], sampleSize: number = 100): PIIDetectionResult {
    const detectedFields: PIIDetectionResult['detectedFields'] = []

    if (data.length === 0) {
      return { hasPII: false, detectedFields: [] }
    }

    // Sample data for performance
    const sample = data.slice(0, Math.min(sampleSize, data.length))
    const firstRow = sample[0]

    // Check each field
    for (const field of Object.keys(firstRow)) {
      const fieldLower = field.toLowerCase()

      // Check for name fields
      if (this.nameIndicators.some(indicator => fieldLower.includes(indicator))) {
        const samples = sample.map(row => String(row[field])).slice(0, 3)
        detectedFields.push({
          field,
          type: 'name',
          confidence: 0.8,
          samples,
        })
        continue
      }

      // Check for pattern matches
      for (const [type, pattern] of Object.entries(this.patterns)) {
        let matches = 0
        const samples: string[] = []

        for (const row of sample) {
          const value = String(row[field] ?? '')
          if (pattern.test(value)) {
            matches++
            if (samples.length < 3) {
              samples.push(value)
            }
          }
        }

        const confidence = matches / sample.length

        if (confidence > 0.5) {
          detectedFields.push({
            field,
            type: type.toLowerCase() as 'email' | 'phone' | 'ssn' | 'credit_card' | 'ip_address' | 'name',
            confidence,
            samples,
          })
          break // Don't check other patterns for this field
        }
      }
    }

    return {
      hasPII: detectedFields.length > 0,
      detectedFields,
    }
  }

  /**
   * Suggest anonymization strategies
   */
  static suggestAnonymization(
    detectionResult: PIIDetectionResult
  ): Record<string, string[]> {
    const suggestions: Record<string, string[]> = {}

    for (const detected of detectionResult.detectedFields) {
      const strategies: string[] = []

      switch (detected.type) {
        case 'email':
          strategies.push('Hash email addresses')
          strategies.push('Mask domain: user@*****.com')
          strategies.push('Remove entirely')
          break
        case 'phone':
          strategies.push('Mask digits: (XXX) XXX-1234')
          strategies.push('Remove entirely')
          break
        case 'ssn':
          strategies.push('Mask: XXX-XX-1234')
          strategies.push('Remove entirely (REQUIRED for GDPR/HIPAA)')
          break
        case 'credit_card':
          strategies.push('Mask: XXXX-XXXX-XXXX-1234')
          strategies.push('Remove entirely (REQUIRED for PCI-DSS)')
          break
        case 'ip_address':
          strategies.push('Mask last octet: 192.168.1.XXX')
          strategies.push('Hash IP addresses')
          break
        case 'name':
          strategies.push('Hash names')
          strategies.push('Use pseudonyms')
          strategies.push('Remove entirely')
          break
      }

      suggestions[detected.field] = strategies
    }

    return suggestions
  }
}

/**
 * PRIVACY ANALYZER
 * 
 * Analisa dataset e fornece relatório completo de privacidade
 */
export interface PrivacyAnalysisReport {
  kAnonymity: KAnonymityResult
  piiDetection: PIIDetectionResult
  recommendations: {
    critical: string[]
    important: string[]
    optional: string[]
  }
  privacyScore: number // 0-100
}

export class PrivacyAnalyzer {
  static analyze(
    data: any[],
    quasiIdentifiers: string[],
    k: number = 5
  ): PrivacyAnalysisReport {
    // Run k-anonymity check
    const kAnonymity = KAnonymityChecker.check(data, quasiIdentifiers, k)

    // Run PII detection
    const piiDetection = PIIDetector.detect(data)

    // Generate recommendations
    const recommendations = {
      critical: [] as string[],
      important: [] as string[],
      optional: [] as string[],
    }

    // Critical: PII detected
    if (piiDetection.hasPII) {
      for (const detected of piiDetection.detectedFields) {
        if (['ssn', 'credit_card'].includes(detected.type)) {
          recommendations.critical.push(
            `CRITICAL: Remove ${detected.field} (${detected.type}) - Required for compliance`
          )
        } else {
          recommendations.important.push(
            `Anonymize ${detected.field} (${detected.type}) - Confidence: ${(detected.confidence * 100).toFixed(0)}%`
          )
        }
      }
    }

    // Important: k-anonymity violations
    if (!kAnonymity.isAnonymous) {
      recommendations.important.push(
        `Dataset does not satisfy ${k}-anonymity (min group size: ${kAnonymity.k})`
      )
      recommendations.important.push(
        `Generalize quasi-identifiers: ${quasiIdentifiers.join(', ')}`
      )
    }

    // Optional: suggestions
    if (data.length < 1000) {
      recommendations.optional.push(
        'Small dataset (<1000 rows) - Consider adding synthetic data'
      )
    }

    // Calculate privacy score
    let score = 100

    // Deduct for PII
    score -= piiDetection.detectedFields.length * 15

    // Deduct for k-anonymity violations
    if (!kAnonymity.isAnonymous) {
      score -= Math.min(30, kAnonymity.violations.length * 5)
    }

    // Deduct for low k value
    if (kAnonymity.k < k) {
      score -= (k - kAnonymity.k) * 2
    }

    score = Math.max(0, Math.min(100, score))

    return {
      kAnonymity,
      piiDetection,
      recommendations,
      privacyScore: score,
    }
  }
}
