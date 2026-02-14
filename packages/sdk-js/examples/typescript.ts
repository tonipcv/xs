/**
 * XASE SDK - TypeScript Example
 * 
 * Demonstrates type-safe usage with TypeScript
 */

import { XaseClient, RecordPayload, RecordResult, XaseError } from '../src/index'

// Define your domain types
interface LoanApplication {
  user_id: string
  amount: number
  credit_score: number
  employment_status: string
}

interface LoanDecision {
  decision: 'APPROVED' | 'DENIED' | 'MANUAL_REVIEW'
  reason?: string
  approved_amount?: number
}

// Initialize client with type safety
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  baseUrl: 'http://localhost:3000/api/xase/v1',
  fireAndForget: true,
  onSuccess: (result: RecordResult) => {
    console.log('✅ Evidence recorded:', result.transaction_id)
  },
  onError: (error: XaseError) => {
    console.error('❌ Error:', error.code, '-', error.message)
  },
})

async function processLoanApplication(
  application: LoanApplication
): Promise<LoanDecision> {
  console.log(`\n🤖 Processing loan for ${application.user_id}...`)
  
  // Your decision logic
  let decision: LoanDecision
  
  if (application.credit_score >= 750) {
    decision = {
      decision: 'APPROVED',
      approved_amount: application.amount,
    }
  } else if (application.credit_score >= 650) {
    decision = {
      decision: 'MANUAL_REVIEW',
      reason: 'Credit score requires manual review',
    }
  } else {
    decision = {
      decision: 'DENIED',
      reason: 'Credit score below threshold',
    }
  }
  
  // Record evidence with type safety
  const payload: RecordPayload = {
    policy: 'credit_policy_v4',
    policyVersion: '4.2.1',
    input: application,
    output: decision,
    confidence: application.credit_score / 850,
    transactionId: `loan_${application.user_id}_${Date.now()}`,
    decisionType: 'CREDIT_APPROVAL',
    context: {
      channel: 'web',
      ip_address: '192.168.1.1',
    },
  }
  
  try {
    await xase.record(payload)
    console.log(`📝 Decision: ${decision.decision}`)
  } catch (error) {
    if (error instanceof XaseError) {
      console.error('Failed to record evidence:', error.code)
    }
    throw error
  }
  
  return decision
}

async function main() {
  console.log('🚀 XASE SDK - TypeScript Example\n')
  
  const applications: LoanApplication[] = [
    {
      user_id: 'u_001',
      amount: 50000,
      credit_score: 780,
      employment_status: 'employed',
    },
    {
      user_id: 'u_002',
      amount: 25000,
      credit_score: 680,
      employment_status: 'self-employed',
    },
    {
      user_id: 'u_003',
      amount: 100000,
      credit_score: 620,
      employment_status: 'employed',
    },
  ]
  
  for (const app of applications) {
    await processLoanApplication(app)
  }
  
  console.log('\n⏳ Flushing queue...')
  await xase.flush()
  
  console.log('✅ All applications processed!\n')
}

main().catch(console.error)
