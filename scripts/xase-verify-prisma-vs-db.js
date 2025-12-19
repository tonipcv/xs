#!/usr/bin/env node

/**
 * XASE - Verificação Prisma vs Banco (schema público)
 *
 * Verifica se as colunas esperadas pelos modelos Prisma existem no banco atual.
 * Foco em HumanIntervention e DecisionRecord.
 */

const { Client } = require('pg')
const path = require('path')
require('dotenv').config({ path: path.join(process.cwd(), '.env') })

function sanitize(url){
  if (!url) return url
  return url.startsWith('=postgres') ? url.slice(1) : url
}

const EXPECT = {
  xase_decision_records: [
    'id','tenantId','transactionId','policyId','policyVersion','policy_hash',
    'model_id','model_version','model_hash','feature_schema_hash','explanation_json',
    'inputHash','outputHash','contextHash','recordHash','previousHash',
    'decisionType','confidence','processingTime',
    'inputPayload','outputPayload','contextPayload','storageUrl',
    'isVerified','verifiedAt','timestamp','createdAt',
    // derivados HITL
    'hasHumanIntervention','finalDecisionSource'
  ],
  xase_human_interventions: [
    'id','tenantId','record_id', // atenção: record_id (snake) mapeado pelo Prisma
    'action','actorUserId','actorName','actorEmail','actorRole',
    'reason','notes','metadata','newOutcome','previousOutcome',
    'ipAddress','userAgent','timestamp','created_at'
  ]
}

async function main(){
  let cs = sanitize(process.env.DATABASE_URL)
  if (!cs){
    console.error('❌ DATABASE_URL não definido no ambiente')
    process.exit(1)
  }
  const client = new Client({ connectionString: cs })
  try{
    await client.connect()
    const [{ current_database }] = (await client.query('select current_database()')).rows
    console.log('🔎 current_database =', current_database)

    for (const [table, cols] of Object.entries(EXPECT)){
      const q = `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY column_name`
      const rows = (await client.query(q)).rows.map(r=>r.column_name)
      const missing = cols.filter(c=>!rows.includes(c))
      const extra = rows.filter(c=>!cols.includes(c))
      console.log(`\n📦 ${table}`)
      console.log(' - columns in db   :', rows)
      console.log(' - expected by app :', cols)
      console.log(' - missing         :', missing)
      console.log(' - extra           :', extra)
    }

    console.log('\n✅ Verificação concluída')
  }catch(e){
    console.error('❌ Erro:', e.message)
    process.exit(1)
  }finally{
    try{ await client.end() }catch{}
  }
}

main()
