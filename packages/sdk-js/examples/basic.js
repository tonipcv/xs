/**
 * XASE SDK - Basic Example
 * 
 * Demonstrates fire-and-forget mode for zero latency impact
 */

const { XaseClient } = require('../dist/index.js')

// Initialize client
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY || 'xase_pk_demo',
  baseUrl: 'http://localhost:3000/api/xase/v1',
  fireAndForget: true, // Zero latency impact
  onSuccess: (result) => {
    console.log('✅ Evidence recorded:', result.transaction_id)
  },
  onError: (error) => {
    console.error('❌ Error:', error.code, error.message)
  },
})

// Simulate AI agent making a credit decision
async function approveLoan(userData) {
  console.log('\n🤖 Processing loan application...')
  
  // Your AI decision logic here
  const decision = userData.credit_score >= 700 ? 'APPROVED' : 'DENIED'
  const confidence = userData.credit_score / 850
  
  // Record evidence (fire-and-forget, returns immediately)
  await xase.record({
    policy: 'credit_policy_v4',
    input: userData,
    output: { decision },
    confidence,
    transactionId: `loan_${userData.user_id}_${Date.now()}`,
    decisionType: 'CREDIT_APPROVAL',
  })
  
  console.log(`📝 Decision: ${decision} (confidence: ${(confidence * 100).toFixed(1)}%)`)
  console.log('⚡ Evidence queued for async recording (zero latency)')
  
  return decision
}

// Run example
async function main() {
  console.log('🚀 XASE SDK - Basic Example\n')
  
  // Process multiple loans
  await approveLoan({
    user_id: 'u_4829',
    amount: 50000,
    credit_score: 720,
  })
  
  await approveLoan({
    user_id: 'u_4830',
    amount: 25000,
    credit_score: 650,
  })
  
  await approveLoan({
    user_id: 'u_4831',
    amount: 100000,
    credit_score: 800,
  })
  
  console.log('\n⏳ Flushing queue before exit...')
  await xase.flush(3000)
  
  console.log('✅ All evidence recorded!\n')
}

main().catch(console.error)
