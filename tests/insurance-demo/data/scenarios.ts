import crypto from 'crypto'

export type ClaimType = 'AUTO' | 'HEALTH' | 'LIFE' | 'PROPERTY' | 'LIABILITY' | 'TRAVEL'

export interface DemoClaim {
  claimNumber: string
  policyNumber: string
  claimType: ClaimType
  amount: number
  occurredAt: Date
  approved: boolean
  manualReview: boolean
  confidence: number
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function weightedPick<T>(items: { value: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const i of items) {
    if (r < i.weight) return i.value
    r -= i.weight
  }
  return items[items.length - 1].value
}

export function randomClaimType(): ClaimType {
  return weightedPick<ClaimType>([
    { value: 'AUTO', weight: 35 },
    { value: 'HEALTH', weight: 20 },
    { value: 'LIFE', weight: 10 },
    { value: 'PROPERTY', weight: 20 },
    { value: 'LIABILITY', weight: 10 },
    { value: 'TRAVEL', weight: 5 },
  ])
}

export function randomApproval(): { approved: boolean; manualReview: boolean } {
  // 60% approved, 30% denied, 10% manual review
  const r = Math.random()
  if (r < 0.10) return { approved: false, manualReview: true }
  if (r < 0.40) return { approved: false, manualReview: false }
  return { approved: true, manualReview: false }
}

export function randomAmount(): number {
  // £500 to £500k, log-like distribution
  const base = Math.pow(10, Math.random() * 3.7 + 2.7) // 10^2.7..6.4 ~ 500..250k
  return Math.min(500000, Math.max(500, Math.round(base)))
}

export function randomConfidence(approved: boolean, manualReview: boolean): number {
  if (manualReview) return Math.random() * 0.2 + 0.4 // 0.4-0.6
  return approved ? Math.random() * 0.2 + 0.8 : Math.random() * 0.2 + 0.6
}

export function randomDateInLastDays(days: number): Date {
  const now = Date.now()
  const past = now - days * 24 * 60 * 60 * 1000
  const skewWeekly = Math.sin(Date.now() / (1000 * 60 * 60 * 24) + Math.random()) // add some pattern
  const ts = randomInt(past, now)
  const d = new Date(ts)
  // More claims on Mondays (simulate)
  if (d.getDay() === 1 && Math.random() < 0.3) d.setHours(d.getHours() - randomInt(0, 8))
  return d
}

export function makeClaim(i: number): DemoClaim {
  const claimType = randomClaimType()
  const { approved, manualReview } = randomApproval()
  const amount = randomAmount()
  const confidence = randomConfidence(approved, manualReview)
  const occurredAt = randomDateInLastDays(90)
  const claimNumber = `CLM-${new Date(occurredAt).toISOString().slice(0, 10)}-${String(i).padStart(4, '0')}`
  const policyNumber = `POL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  return { claimNumber, policyNumber, claimType, amount, occurredAt, approved, manualReview, confidence }
}
