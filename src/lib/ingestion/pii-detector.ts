/**
 * PII Detector and Masking Engine
 * Detects and masks personally identifiable information
 */

export interface PIIPattern {
  type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'ip_address' | 'name' | 'address' | 'custom'
  pattern: RegExp
  maskingStrategy: 'redact' | 'hash' | 'partial' | 'tokenize' | 'encrypt'
  confidence: number
}

export interface PIIDetectionResult {
  field: string
  type: string
  value: string
  maskedValue: string
  confidence: number
  position: { start: number; end: number }
}

export interface PIIScanResult {
  totalFields: number
  piiFieldsDetected: number
  detections: PIIDetectionResult[]
  summary: Record<string, number>
  riskScore: number
}

export interface MaskingOptions {
  strategy?: 'redact' | 'hash' | 'partial' | 'tokenize' | 'encrypt'
  preserveLength?: boolean
  customChar?: string
  partialReveal?: number
}

export class PIIDetector {
  private patterns: PIIPattern[] = [
    {
      type: 'email',
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      maskingStrategy: 'partial',
      confidence: 0.95,
    },
    {
      type: 'phone',
      pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      maskingStrategy: 'partial',
      confidence: 0.90,
    },
    {
      type: 'ssn',
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      maskingStrategy: 'redact',
      confidence: 0.98,
    },
    {
      type: 'credit_card',
      pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      maskingStrategy: 'partial',
      confidence: 0.85,
    },
    {
      type: 'ip_address',
      pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      maskingStrategy: 'hash',
      confidence: 0.80,
    },
  ]

  private namePatterns = [
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // First Last
    /\b[A-Z][a-z]+ [A-Z]\. [A-Z][a-z]+\b/g, // First M. Last
  ]

  addPattern(pattern: PIIPattern): void {
    this.patterns.push(pattern)
  }

  async scan(data: any[]): Promise<PIIScanResult> {
    const detections: PIIDetectionResult[] = []
    const summary: Record<string, number> = {}
    let totalFields = 0
    const piiFields = new Set<string>()

    for (const row of data) {
      for (const [field, value] of Object.entries(row)) {
        totalFields++

        if (typeof value !== 'string') continue

        for (const pattern of this.patterns) {
          const matches = value.matchAll(pattern.pattern)
          
          for (const match of matches) {
            if (!match.index) continue

            const maskedValue = this.mask(match[0], {
              strategy: pattern.maskingStrategy,
            })

            detections.push({
              field,
              type: pattern.type,
              value: match[0],
              maskedValue,
              confidence: pattern.confidence,
              position: {
                start: match.index,
                end: match.index + match[0].length,
              },
            })

            piiFields.add(field)
            summary[pattern.type] = (summary[pattern.type] || 0) + 1
          }
        }

        // Check for names
        for (const namePattern of this.namePatterns) {
          const matches = value.matchAll(namePattern)
          
          for (const match of matches) {
            if (!match.index) continue

            const maskedValue = this.mask(match[0], {
              strategy: 'partial',
              partialReveal: 1,
            })

            detections.push({
              field,
              type: 'name',
              value: match[0],
              maskedValue,
              confidence: 0.70,
              position: {
                start: match.index,
                end: match.index + match[0].length,
              },
            })

            piiFields.add(field)
            summary['name'] = (summary['name'] || 0) + 1
          }
        }
      }
    }

    const riskScore = this.calculateRiskScore(detections, totalFields)

    return {
      totalFields,
      piiFieldsDetected: piiFields.size,
      detections,
      summary,
      riskScore,
    }
  }

  async maskData(data: any[], options?: MaskingOptions): Promise<any[]> {
    const maskedData = []

    for (const row of data) {
      const maskedRow: any = {}

      for (const [field, value] of Object.entries(row)) {
        if (typeof value !== 'string') {
          maskedRow[field] = value
          continue
        }

        let maskedValue = value

        for (const pattern of this.patterns) {
          maskedValue = maskedValue.replace(pattern.pattern, (match) =>
            this.mask(match, options || { strategy: pattern.maskingStrategy })
          )
        }

        // Mask names
        for (const namePattern of this.namePatterns) {
          maskedValue = maskedValue.replace(namePattern, (match) =>
            this.mask(match, options || { strategy: 'partial', partialReveal: 1 })
          )
        }

        maskedRow[field] = maskedValue
      }

      maskedData.push(maskedRow)
    }

    return maskedData
  }

  mask(value: string, options: MaskingOptions = {}): string {
    const strategy = options.strategy || 'redact'
    const customChar = options.customChar || '*'
    const preserveLength = options.preserveLength !== false
    const partialReveal = options.partialReveal || 0

    switch (strategy) {
      case 'redact':
        return preserveLength ? customChar.repeat(value.length) : '[REDACTED]'

      case 'hash':
        return this.hashValue(value)

      case 'partial':
        if (value.length <= partialReveal * 2) {
          return customChar.repeat(value.length)
        }
        const reveal = Math.max(1, partialReveal)
        const start = value.substring(0, reveal)
        const end = value.substring(value.length - reveal)
        const middle = customChar.repeat(value.length - reveal * 2)
        return `${start}${middle}${end}`

      case 'tokenize':
        return this.tokenize(value)

      case 'encrypt':
        return this.encrypt(value)

      default:
        return '[MASKED]'
    }
  }

  private hashValue(value: string): string {
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return `[HASH:${Math.abs(hash).toString(16)}]`
  }

  private tokenize(value: string): string {
    return `[TOKEN:${Math.random().toString(36).substring(2, 15)}]`
  }

  private encrypt(value: string): string {
    // Simple XOR encryption for demonstration
    const key = 'xase-encryption-key'
    let encrypted = ''
    for (let i = 0; i < value.length; i++) {
      encrypted += String.fromCharCode(
        value.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      )
    }
    return `[ENC:${Buffer.from(encrypted).toString('base64')}]`
  }

  private calculateRiskScore(detections: PIIDetectionResult[], totalFields: number): number {
    if (totalFields === 0) return 0

    const weights = {
      ssn: 10,
      credit_card: 9,
      email: 5,
      phone: 5,
      name: 3,
      address: 7,
      ip_address: 2,
    }

    let totalRisk = 0
    detections.forEach(detection => {
      const weight = weights[detection.type as keyof typeof weights] || 1
      totalRisk += weight * detection.confidence
    })

    const riskScore = Math.min(100, (totalRisk / totalFields) * 10)
    return Math.round(riskScore)
  }

  async generateReport(scanResult: PIIScanResult): Promise<string> {
    const lines: string[] = []

    lines.push('=== PII Detection Report ===')
    lines.push(`Total Fields Scanned: ${scanResult.totalFields}`)
    lines.push(`PII Fields Detected: ${scanResult.piiFieldsDetected}`)
    lines.push(`Risk Score: ${scanResult.riskScore}/100`)
    lines.push('')

    lines.push('=== Detection Summary ===')
    Object.entries(scanResult.summary).forEach(([type, count]) => {
      lines.push(`${type}: ${count} occurrence(s)`)
    })
    lines.push('')

    if (scanResult.detections.length > 0) {
      lines.push('=== Top Detections ===')
      scanResult.detections
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10)
        .forEach((detection, i) => {
          lines.push(
            `${i + 1}. ${detection.type} in field "${detection.field}" (confidence: ${(detection.confidence * 100).toFixed(0)}%)`
          )
        })
    }

    lines.push('')
    lines.push('=== Recommendations ===')
    
    if (scanResult.riskScore > 70) {
      lines.push('⚠️  HIGH RISK: Immediate action required')
      lines.push('- Apply masking to all detected PII fields')
      lines.push('- Review data access policies')
      lines.push('- Enable audit logging for PII access')
    } else if (scanResult.riskScore > 40) {
      lines.push('⚠️  MEDIUM RISK: Action recommended')
      lines.push('- Consider masking sensitive fields')
      lines.push('- Review data retention policies')
    } else {
      lines.push('✓ LOW RISK: Continue monitoring')
      lines.push('- Maintain current security practices')
    }

    return lines.join('\n')
  }

  async validateMasking(original: any[], masked: any[]): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const errors: string[] = []
    const warnings: string[] = []

    if (original.length !== masked.length) {
      errors.push('Row count mismatch between original and masked data')
      return { valid: false, errors, warnings }
    }

    for (let i = 0; i < original.length; i++) {
      const origRow = original[i]
      const maskRow = masked[i]

      const origKeys = Object.keys(origRow)
      const maskKeys = Object.keys(maskRow)

      if (origKeys.length !== maskKeys.length) {
        warnings.push(`Row ${i}: Field count mismatch`)
      }

      for (const key of origKeys) {
        const origValue = origRow[key]
        const maskValue = maskRow[key]

        if (typeof origValue === 'string' && typeof maskValue === 'string') {
          // Check if PII was actually masked
          for (const pattern of this.patterns) {
            if (pattern.pattern.test(origValue) && origValue === maskValue) {
              errors.push(`Row ${i}, Field "${key}": PII not masked (${pattern.type})`)
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  getSupportedTypes(): string[] {
    return this.patterns.map(p => p.type)
  }

  getPatternForType(type: string): PIIPattern | undefined {
    return this.patterns.find(p => p.type === type)
  }
}

export class PIIMaskingPipeline {
  private detector: PIIDetector

  constructor() {
    this.detector = new PIIDetector()
  }

  async process(data: any[], options?: {
    scanOnly?: boolean
    maskingOptions?: MaskingOptions
    generateReport?: boolean
  }): Promise<{
    scanResult: PIIScanResult
    maskedData?: any[]
    report?: string
    validationResult?: { valid: boolean; errors: string[]; warnings: string[] }
  }> {
    const scanResult = await this.detector.scan(data)

    if (options?.scanOnly) {
      return {
        scanResult,
        report: options.generateReport ? await this.detector.generateReport(scanResult) : undefined,
      }
    }

    const maskedData = await this.detector.maskData(data, options?.maskingOptions)
    const validationResult = await this.detector.validateMasking(data, maskedData)

    return {
      scanResult,
      maskedData,
      report: options?.generateReport ? await this.detector.generateReport(scanResult) : undefined,
      validationResult,
    }
  }

  getDetector(): PIIDetector {
    return this.detector
  }
}
