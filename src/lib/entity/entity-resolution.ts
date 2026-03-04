/**
 * ENTITY RESOLUTION
 * Deterministic tokenization and matching for patient/entity linking
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export interface EntityIdentifiers {
  firstName?: string
  lastName?: string
  dateOfBirth?: Date | string
  ssn?: string
  email?: string
  phone?: string
  medicalRecordNumber?: string
  customId?: string
}

export interface TokenizationResult {
  entityToken: string
  identifierTokens: Record<string, string>
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  matchingStrategy: string
}

export interface EntityMatch {
  entityToken: string
  matchScore: number
  matchedFields: string[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

/**
 * Entity Resolution Service
 */
export class EntityResolution {
  private static readonly SECRET_KEY = process.env.ENTITY_RESOLUTION_SECRET || 'default-secret-key-change-in-production'
  
  /**
   * Generate deterministic token for entity
   */
  static tokenizeEntity(identifiers: EntityIdentifiers): TokenizationResult {
    const identifierTokens: Record<string, string> = {}
    const matchingFields: string[] = []

    // Tokenize each identifier
    if (identifiers.ssn) {
      identifierTokens.ssn = this.generateToken(this.normalize(identifiers.ssn))
      matchingFields.push('ssn')
    }

    if (identifiers.email) {
      identifierTokens.email = this.generateToken(this.normalize(identifiers.email))
      matchingFields.push('email')
    }

    if (identifiers.phone) {
      identifierTokens.phone = this.generateToken(this.normalizePhone(identifiers.phone))
      matchingFields.push('phone')
    }

    if (identifiers.medicalRecordNumber) {
      identifierTokens.mrn = this.generateToken(this.normalize(identifiers.medicalRecordNumber))
      matchingFields.push('mrn')
    }

    if (identifiers.firstName && identifiers.lastName && identifiers.dateOfBirth) {
      const dob = typeof identifiers.dateOfBirth === 'string' 
        ? identifiers.dateOfBirth 
        : identifiers.dateOfBirth.toISOString().split('T')[0]
      
      const namedobComposite = this.normalize(
        `${identifiers.firstName}|${identifiers.lastName}|${dob}`
      )
      identifierTokens.namedob = this.generateToken(namedobComposite)
      matchingFields.push('namedob')
    }

    // Generate composite entity token
    const entityToken = this.generateCompositeToken(identifierTokens)

    // Determine confidence based on available identifiers
    const confidence = this.determineConfidence(matchingFields)

    return {
      entityToken,
      identifierTokens,
      confidence,
      matchingStrategy: matchingFields.join(','),
    }
  }

  /**
   * Generate HMAC-based deterministic token
   */
  private static generateToken(input: string): string {
    return crypto
      .createHmac('sha256', this.SECRET_KEY)
      .update(input)
      .digest('hex')
  }

  /**
   * Generate composite token from multiple identifier tokens
   */
  private static generateCompositeToken(tokens: Record<string, string>): string {
    // Sort keys for deterministic ordering
    const sortedKeys = Object.keys(tokens).sort()
    const composite = sortedKeys.map(key => tokens[key]).join('|')
    return this.generateToken(composite)
  }

  /**
   * Normalize string for consistent tokenization
   */
  private static normalize(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '')
  }

  /**
   * Normalize phone number to E.164 format
   */
  private static normalizePhone(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '')
    
    // Add country code if missing (assume US)
    if (digits.length === 10) {
      return `1${digits}`
    }
    
    return digits
  }

  /**
   * Determine confidence level based on available identifiers
   */
  private static determineConfidence(matchingFields: string[]): 'HIGH' | 'MEDIUM' | 'LOW' {
    // High confidence: SSN or MRN
    if (matchingFields.includes('ssn') || matchingFields.includes('mrn')) {
      return 'HIGH'
    }

    // Medium confidence: Name+DOB + (Email or Phone)
    if (matchingFields.includes('namedob') && 
        (matchingFields.includes('email') || matchingFields.includes('phone'))) {
      return 'MEDIUM'
    }

    // Low confidence: anything else
    return 'LOW'
  }

  /**
   * Find matching entities
   */
  static async findMatches(
    identifiers: EntityIdentifiers,
    tenantId: string
  ): Promise<EntityMatch[]> {
    const tokenization = this.tokenizeEntity(identifiers)
    const matches: EntityMatch[] = []

    // In production, would query entity token database
    // For now, return the generated token as a match
    matches.push({
      entityToken: tokenization.entityToken,
      matchScore: 1.0,
      matchedFields: Object.keys(tokenization.identifierTokens),
      confidence: tokenization.confidence,
    })

    return matches
  }

  /**
   * Link records using entity tokens
   */
  static async linkRecords(
    records: Array<{ id: string; identifiers: EntityIdentifiers }>,
    tenantId: string
  ): Promise<Map<string, string[]>> {
    const entityGroups = new Map<string, string[]>()

    for (const record of records) {
      const tokenization = this.tokenizeEntity(record.identifiers)
      const entityToken = tokenization.entityToken

      if (!entityGroups.has(entityToken)) {
        entityGroups.set(entityToken, [])
      }

      entityGroups.get(entityToken)!.push(record.id)
    }

    return entityGroups
  }

  /**
   * Validate entity identifiers
   */
  static validateIdentifiers(identifiers: EntityIdentifiers): {
    valid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    // Check if at least one identifier is provided
    const hasIdentifier = Object.values(identifiers).some(v => v !== undefined && v !== null)
    if (!hasIdentifier) {
      errors.push('At least one identifier must be provided')
    }

    // Validate SSN format (if provided)
    if (identifiers.ssn) {
      const ssnDigits = identifiers.ssn.replace(/\D/g, '')
      if (ssnDigits.length !== 9) {
        errors.push('SSN must be 9 digits')
      }
    }

    // Validate email format (if provided)
    if (identifiers.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(identifiers.email)) {
        errors.push('Invalid email format')
      }
    }

    // Validate phone format (if provided)
    if (identifiers.phone) {
      const phoneDigits = identifiers.phone.replace(/\D/g, '')
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        errors.push('Phone number must be 10-15 digits')
      }
    }

    // Warn if only low-confidence identifiers
    const hasHighConfidence = identifiers.ssn || identifiers.medicalRecordNumber
    const hasMediumConfidence = 
      identifiers.firstName && identifiers.lastName && identifiers.dateOfBirth &&
      (identifiers.email || identifiers.phone)
    
    if (!hasHighConfidence && !hasMediumConfidence) {
      warnings.push('Low confidence identifiers - consider adding SSN or MRN')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Generate privacy-preserving entity summary
   */
  static generateEntitySummary(identifiers: EntityIdentifiers): {
    hasSSN: boolean
    hasEmail: boolean
    hasPhone: boolean
    hasMRN: boolean
    hasNameDOB: boolean
    identifierCount: number
  } {
    return {
      hasSSN: !!identifiers.ssn,
      hasEmail: !!identifiers.email,
      hasPhone: !!identifiers.phone,
      hasMRN: !!identifiers.medicalRecordNumber,
      hasNameDOB: !!(identifiers.firstName && identifiers.lastName && identifiers.dateOfBirth),
      identifierCount: Object.values(identifiers).filter(v => v !== undefined && v !== null).length,
    }
  }

  /**
   * Batch tokenize multiple entities
   */
  static batchTokenize(
    entities: EntityIdentifiers[]
  ): TokenizationResult[] {
    return entities.map(identifiers => this.tokenizeEntity(identifiers))
  }

  /**
   * Calculate match score between two entities
   */
  static calculateMatchScore(
    entity1: EntityIdentifiers,
    entity2: EntityIdentifiers
  ): number {
    const tokens1 = this.tokenizeEntity(entity1)
    const tokens2 = this.tokenizeEntity(entity2)

    let matchingFields = 0
    let totalFields = 0

    for (const field in tokens1.identifierTokens) {
      totalFields++
      if (tokens2.identifierTokens[field] === tokens1.identifierTokens[field]) {
        matchingFields++
      }
    }

    for (const field in tokens2.identifierTokens) {
      if (!tokens1.identifierTokens[field]) {
        totalFields++
      }
    }

    return totalFields > 0 ? matchingFields / totalFields : 0
  }

  /**
   * Deduplicate entities based on tokens
   */
  static deduplicateEntities(
    entities: Array<{ id: string; identifiers: EntityIdentifiers }>
  ): Array<{
    primaryId: string
    duplicateIds: string[]
    entityToken: string
    confidence: string
  }> {
    const groups = new Map<string, string[]>()

    for (const entity of entities) {
      const tokenization = this.tokenizeEntity(entity.identifiers)
      const token = tokenization.entityToken

      if (!groups.has(token)) {
        groups.set(token, [])
      }
      groups.get(token)!.push(entity.id)
    }

    const results: Array<any> = []
    for (const [token, ids] of groups.entries()) {
      if (ids.length > 1) {
        results.push({
          primaryId: ids[0],
          duplicateIds: ids.slice(1),
          entityToken: token,
          confidence: 'HIGH',
        })
      }
    }

    return results
  }

  /**
   * Anonymize identifiers while preserving linkability
   */
  static anonymize(identifiers: EntityIdentifiers): {
    anonymizedId: string
    canLink: boolean
    preservedFields: string[]
  } {
    const tokenization = this.tokenizeEntity(identifiers)
    
    return {
      anonymizedId: tokenization.entityToken.substring(0, 16),
      canLink: true,
      preservedFields: Object.keys(tokenization.identifierTokens),
    }
  }

  /**
   * Audit entity resolution operation
   */
  static async auditResolution(
    tenantId: string,
    operation: string,
    identifierCount: number,
    matchCount: number
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'ENTITY_RESOLUTION',
          resourceType: 'ENTITY',
          resourceId: `resolution_${Date.now()}`,
          metadata: JSON.stringify({
            operation,
            identifierCount,
            matchCount,
            timestamp: new Date().toISOString(),
          }),
          status: 'SUCCESS',
        },
      })
    } catch (error) {
      console.error('[EntityResolution] Failed to audit operation:', error)
    }
  }
}
