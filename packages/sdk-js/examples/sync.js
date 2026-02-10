/**
 * XASE SDK - Synchronous Example
 * 
 * Demonstrates synchronous mode with immediate response
 */

const { XaseClient } = require('../dist/index.js')

// Initialize client in sync mode
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY || 'xase_pk_demo',
  baseUrl: 'http://localhost:3000/api/xase/v1',
  fireAndForget: false, // Synchronous mode
})

async function processFraudDetection(transaction) {
  console.log('\n🔍 Analyzing transaction for fraud...')
  
  // Your fraud detection logic
  const isFraud = transaction.amount > 10000 && transaction.location !== 'US'
  const confidence = isFraud ? 0.87 : 0.12
  
  // Record evidence synchronously (waits for response)
  const result = await xase.record({
    policy: 'fraud_detection_v2',
    input: transaction,
    output: { is_fraud: isFraud },
    confidence,
    transactionId: transaction.id,
    decisionType: 'FRAUD_DETECTION',
    storePayload: true, // Store full payload for audit
  })
  
  console.log('✅ Evidence recorded:')
  console.log('   Transaction ID:', result.transaction_id)
  console.log('   Record Hash:', result.record_hash)
  console.log('   Chain Position:', result.chain_position)
  console.log('   Receipt URL:', result.receipt_url)
  
  return { isFraud, confidence, evidence: result }
}

async function main() {
  console.log('🚀 XASE SDK - Synchronous Example\n')
  
  try {
    await processFraudDetection({
      id: 'txn_12345',
      amount: 15000,
      location: 'RU',
      merchant: 'Unknown Store',
    })
    
    await processFraudDetection({
      id: 'txn_12346',
      amount: 50,
      location: 'US',
      merchant: 'Amazon',
    })
    
    console.log('\n✅ All transactions processed!\n')
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

main()
