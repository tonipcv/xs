/**
 * Exemplo: Ingestão de decisão com Explicabilidade (XAI) e Model Card
 *
 * Fluxo:
 * 1) POST /model-cards
 * 2) POST /records (com explanation + metadata de modelo)
 * 3) GET /export/{transactionId}/download?download=json
 */

async function main() {
  const apiKey = process.env.XASE_API_KEY || 'xase_test_key'
  const baseUrl = process.env.XASE_BASE_URL || 'http://localhost:3000/api/xase/v1'

  // 1. Registrar o Model Card (uma vez por versão do modelo)
  console.log('📊 Registrando Model Card...')
  try {
    const modelRes = await fetch(`${baseUrl}/model-cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        model_id: 'credit_scoring_v2',
        model_version: '2.1.0',
        model_name: 'Credit Scoring Model',
        model_type: 'gradient_boosting',
        framework: 'xgboost',
        description: 'Modelo de credit scoring treinado com XGBoost',
        training_date: '2025-01-15T00:00:00Z',
        dataset_hash: 'sha256:abc123...',
        dataset_size: 50000,
        training_duration_seconds: 3600,
        performance_metrics: {
          accuracy: 0.94,
          precision: 0.91,
          recall: 0.89,
          f1_score: 0.90,
          auc_roc: 0.96,
        },
        intended_use: 'Credit scoring for personal loans up to R$100,000',
        feature_schema: {
          features: [
            { name: 'income', type: 'numeric', range: [0, 1000000] },
            { name: 'credit_score', type: 'numeric', range: [300, 850] },
            { name: 'debt_ratio', type: 'numeric', range: [0, 1] },
            { name: 'employment_years', type: 'numeric', range: [0, 50] },
            { name: 'age', type: 'numeric', range: [18, 100] },
          ],
        },
        feature_importance: {
          credit_score: 0.35,
          income: 0.25,
          debt_ratio: 0.20,
          employment_years: 0.12,
          age: 0.08,
        },
      }),
    })
    if (modelRes.ok) {
      console.log('✅ Model Card registrado com sucesso')
    } else {
      const errBody: any = await modelRes.json().catch(() => ({}))
      console.log('⚠️ Model Card já existe ou erro:', errBody.message || modelRes.statusText)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log('⚠️ Falha ao registrar Model Card:', msg)
  }

  // 2. Registrar decisão com explicabilidade (SHAP)
  console.log('\n🤖 Registrando decisão com explicabilidade...')

  const input = {
    applicant_id: 'APP-12345',
    income: 75000,
    credit_score: 720,
    debt_ratio: 0.25,
    employment_years: 5,
    age: 35,
    loan_amount: 50000,
  }

  const output = {
    decision: 'APPROVED',
    approved_amount: 50000,
    interest_rate: 0.12,
    risk_score: 0.15,
  }

  const explanation = {
    method: 'SHAP',
    model_output: 0.85,
    base_value: 0.5,
    shap_values: {
      credit_score: 0.25,
      income: 0.15,
      debt_ratio: -0.05,
      employment_years: 0.08,
      age: 0.02,
    },
    top_features: [
      { name: 'credit_score', value: 720, importance: 0.25, contribution: 'positive' },
      { name: 'income', value: 75000, importance: 0.15, contribution: 'positive' },
      { name: 'employment_years', value: 5, importance: 0.08, contribution: 'positive' },
      { name: 'debt_ratio', value: 0.25, importance: -0.05, contribution: 'negative' },
      { name: 'age', value: 35, importance: 0.02, contribution: 'positive' },
    ],
    confidence: 0.85,
    explanation_text:
      'Decisão aprovada principalmente devido ao bom credit score (720) e renda adequada (R$75k). Debt ratio está dentro do aceitável.',
  }

  const context = {
    user_agent: 'Mozilla/5.0...',
    ip_address: '192.168.1.1',
    session_id: 'sess_abc123',
    timestamp: new Date().toISOString(),
  }

  // POST /records com todos os metadados (inclui XAI e modelo)
  const recRes = await fetch(`${baseUrl}/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      // Pode-se passar Idempotency-Key aqui, se desejar
    },
    body: JSON.stringify({
      input,
      output,
      context,
      policyId: 'credit_policy',
      policyVersion: 'v2.1',
      decisionType: 'loan_approval',
      confidence: 0.85,
      // Metadata do modelo
      modelId: 'credit_scoring_v2',
      modelVersion: '2.1.0',
      // Explicabilidade (XAI)
      explanation,
      // Armazenar payloads (opcional)
      storePayload: true,
    }),
  })

  if (!recRes.ok) {
    const errBody: any = await recRes.json().catch(() => ({}))
    throw new Error(`Falha ao registrar decisão: ${errBody.message || recRes.statusText}`)
  }
  const recJson: any = await recRes.json()
  const txnId: string = recJson.transaction_id
  console.log(`✅ Decisão registrada: ${txnId}`)

  // 3. (Opcional) Aguardar processamento
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // 4. Exportar bundle de evidências
  console.log('\n📦 Exportando bundle de evidências...')
  const expRes = await fetch(`${baseUrl}/export/${txnId}/download?download=json`, {
    headers: { 'X-API-Key': apiKey },
  })
  if (!expRes.ok) {
    const errBody: any = await expRes.json().catch(() => ({}))
    throw new Error(`Falha ao exportar evidências: ${errBody.message || expRes.statusText}`)
  }
  const expJson: any = await expRes.json()
  console.log(`✅ Bundle info:`, expJson)
  console.log('\n📄 O bundle contém:')
  console.log('  - decision.json (decisão + modelo)')
  console.log('  - proof.json (assinatura criptográfica)')
  console.log('  - explanation.json (SHAP values) ⭐ NOVO')
  console.log('  - model_card.json (ficha técnica do modelo) ⭐ NOVO')
  console.log('  - policy.json (política aplicada)')
  console.log('  - payloads/ (input, output, context)')
  console.log('  - report.txt (relatório legível)')
  console.log('  - verify.js (script de verificação offline)')
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e)
  console.error('Erro no exemplo:', msg)
  process.exit(1)
})
