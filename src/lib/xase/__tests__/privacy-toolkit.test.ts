/**
 * PRIVACY TOOLKIT TESTS
 */

import {
  KAnonymityChecker,
  DifferentialPrivacy,
  PIIDetector,
  PrivacyAnalyzer,
} from '../privacy-toolkit'

describe('KAnonymityChecker', () => {
  test('should detect k-anonymity satisfaction', () => {
    const data = [
      { age: 25, zipcode: '94102', gender: 'M', income: 50000 },
      { age: 25, zipcode: '94102', gender: 'M', income: 55000 },
      { age: 25, zipcode: '94102', gender: 'M', income: 60000 },
      { age: 30, zipcode: '94103', gender: 'F', income: 70000 },
      { age: 30, zipcode: '94103', gender: 'F', income: 75000 },
      { age: 30, zipcode: '94103', gender: 'F', income: 80000 },
    ]

    const result = KAnonymityChecker.check(data, ['age', 'zipcode', 'gender'], 3)

    expect(result.isAnonymous).toBe(true)
    expect(result.k).toBe(3)
    expect(result.violations).toHaveLength(0)
  })

  test('should detect k-anonymity violations', () => {
    const data = [
      { age: 25, zipcode: '94102', gender: 'M' },
      { age: 25, zipcode: '94102', gender: 'M' },
      { age: 30, zipcode: '94103', gender: 'F' }, // Only 1 in this group
    ]

    const result = KAnonymityChecker.check(data, ['age', 'zipcode', 'gender'], 2)

    expect(result.isAnonymous).toBe(false)
    expect(result.k).toBe(1)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].count).toBe(1)
  })

  test('should handle empty dataset', () => {
    const result = KAnonymityChecker.check([], ['age'], 5)

    expect(result.isAnonymous).toBe(true)
    expect(result.k).toBe(0)
  })

  test('should suggest generalization', () => {
    const data = [
      { age: 25, zipcode: '94102' },
      { age: 26, zipcode: '94103' },
      { age: 27, zipcode: '94104' },
    ]

    const suggestions = KAnonymityChecker.suggestGeneralization(data, ['age', 'zipcode'], 2)

    expect(suggestions.age).toBeDefined()
    expect(suggestions.zipcode).toBeDefined()
  })
})

describe('DifferentialPrivacy', () => {
  test('should add Laplace noise', () => {
    const original = 100
    const config = { epsilon: 0.1, sensitivity: 1, mechanism: 'laplace' as const }

    const noisy = DifferentialPrivacy.addLaplaceNoise(original, config)

    expect(noisy).not.toBe(original)
    expect(Math.abs(noisy - original)).toBeLessThan(50) // Noise should be bounded
  })

  test('should add noise to count aggregate', () => {
    const count = 1000
    const config = { epsilon: 0.1, sensitivity: 1, mechanism: 'laplace' as const }

    const noisyCount = DifferentialPrivacy.addNoiseToAggregate(count, 'count', config)

    expect(noisyCount).not.toBe(count)
    expect(noisyCount).toBeGreaterThan(0)
  })

  test('should calculate remaining budget', () => {
    const totalBudget = 1.0
    const queries = [
      { epsilon: 0.1 },
      { epsilon: 0.2 },
      { epsilon: 0.3 },
    ]

    const remaining = DifferentialPrivacy.calculateRemainingBudget(totalBudget, queries)

    expect(remaining).toBe(0.4)
  })

  test('should recommend epsilon based on dataset size', () => {
    expect(DifferentialPrivacy.recommendEpsilon('count', 50)).toBe(1.0)
    expect(DifferentialPrivacy.recommendEpsilon('count', 500)).toBe(0.5)
    expect(DifferentialPrivacy.recommendEpsilon('count', 5000)).toBe(0.1)
    expect(DifferentialPrivacy.recommendEpsilon('count', 50000)).toBe(0.01)
  })
})

describe('PIIDetector', () => {
  test('should detect email addresses', () => {
    const data = [
      { id: 1, contact: 'john@example.com' },
      { id: 2, contact: 'jane@example.com' },
      { id: 3, contact: 'bob@example.com' },
    ]

    const result = PIIDetector.detect(data)

    expect(result.hasPII).toBe(true)
    expect(result.detectedFields).toHaveLength(1)
    expect(result.detectedFields[0].type).toBe('email')
    expect(result.detectedFields[0].field).toBe('contact')
  })

  test('should detect phone numbers', () => {
    const data = [
      { id: 1, phone: '(555) 123-4567' },
      { id: 2, phone: '555-234-5678' },
      { id: 3, phone: '5553456789' },
    ]

    const result = PIIDetector.detect(data)

    expect(result.hasPII).toBe(true)
    expect(result.detectedFields.some(f => f.type === 'phone')).toBe(true)
  })

  test('should detect SSN', () => {
    const data = [
      { id: 1, ssn: '123-45-6789' },
      { id: 2, ssn: '234-56-7890' },
    ]

    const result = PIIDetector.detect(data)

    expect(result.hasPII).toBe(true)
    expect(result.detectedFields.some(f => f.type === 'ssn')).toBe(true)
  })

  test('should detect name fields', () => {
    const data = [
      { id: 1, first_name: 'John', last_name: 'Doe' },
      { id: 2, first_name: 'Jane', last_name: 'Smith' },
    ]

    const result = PIIDetector.detect(data)

    expect(result.hasPII).toBe(true)
    expect(result.detectedFields.some(f => f.type === 'name')).toBe(true)
  })

  test('should not detect PII in clean data', () => {
    const data = [
      { id: 1, age: 25, city: 'San Francisco' },
      { id: 2, age: 30, city: 'New York' },
    ]

    const result = PIIDetector.detect(data)

    expect(result.hasPII).toBe(false)
    expect(result.detectedFields).toHaveLength(0)
  })

  test('should suggest anonymization strategies', () => {
    const detectionResult = {
      hasPII: true,
      detectedFields: [
        { field: 'email', type: 'email' as const, confidence: 1.0, samples: [] },
        { field: 'ssn', type: 'ssn' as const, confidence: 1.0, samples: [] },
      ],
    }

    const suggestions = PIIDetector.suggestAnonymization(detectionResult)

    expect(suggestions.email).toBeDefined()
    expect(suggestions.ssn).toBeDefined()
    expect(suggestions.ssn.some(s => s.includes('REQUIRED'))).toBe(true)
  })
})

describe('PrivacyAnalyzer', () => {
  test('should generate complete privacy analysis', () => {
    const data = [
      { age: 25, zipcode: '94102', gender: 'M', email: 'user1@example.com' },
      { age: 25, zipcode: '94102', gender: 'M', email: 'user2@example.com' },
      { age: 25, zipcode: '94102', gender: 'M', email: 'user3@example.com' },
    ]

    const report = PrivacyAnalyzer.analyze(data, ['age', 'zipcode', 'gender'], 3)

    expect(report.kAnonymity).toBeDefined()
    expect(report.piiDetection).toBeDefined()
    expect(report.recommendations).toBeDefined()
    expect(report.privacyScore).toBeGreaterThanOrEqual(0)
    expect(report.privacyScore).toBeLessThanOrEqual(100)
  })

  test('should penalize privacy score for PII', () => {
    const dataWithPII = [
      { age: 25, email: 'user@example.com', ssn: '123-45-6789' },
      { age: 26, email: 'user2@example.com', ssn: '234-56-7890' },
    ]

    const dataWithoutPII = [
      { age: 25, city: 'SF' },
      { age: 26, city: 'NY' },
    ]

    const reportWithPII = PrivacyAnalyzer.analyze(dataWithPII, ['age'], 2)
    const reportWithoutPII = PrivacyAnalyzer.analyze(dataWithoutPII, ['age'], 2)

    expect(reportWithPII.privacyScore).toBeLessThan(reportWithoutPII.privacyScore)
  })

  test('should generate critical recommendations for sensitive PII', () => {
    const data = [
      { id: 1, ssn: '123-45-6789', credit_card: '1234-5678-9012-3456' },
    ]

    const report = PrivacyAnalyzer.analyze(data, ['id'], 1)

    expect(report.recommendations.critical.length).toBeGreaterThan(0)
    expect(report.recommendations.critical.some(r => r.includes('CRITICAL'))).toBe(true)
  })
})
