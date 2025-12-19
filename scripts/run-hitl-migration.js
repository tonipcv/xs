#!/usr/bin/env node

/**
 * Script para executar migration de Human-in-the-Loop
 * 
 * Uso:
 *   DATABASE_URL="postgres://..." node scripts/run-hitl-migration.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🚀 XASE CORE - Human-in-the-Loop Migration');
  console.log('=====================================\n');

  // 1. Verificar DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Erro: DATABASE_URL não configurado');
    console.error('   Configure: export DATABASE_URL="postgres://..."');
    process.exit(1);
  }

  // 2. Conectar ao PostgreSQL
  console.log('🔌 Conectando ao PostgreSQL...');
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    console.log('✅ Conectado!\n');

    // 3. Ler migration SQL
    const migrationPath = path.join(__dirname, '../database/migrations/006_add_human_interventions.sql');
    console.log('📄 Lendo migration:', migrationPath);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // 4. Executar migration
    console.log('⚙️  Executando migration...\n');
    await client.query(sql);
    console.log('✅ Migration executada com sucesso!\n');

    // 5. Verificar tabelas criadas
    console.log('🔍 Verificando tabelas criadas...');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'xase_human_interventions'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Tabela xase_human_interventions criada com sucesso!\n');
    } else {
      console.log('⚠️  Tabela não encontrada (pode já existir)\n');
    }

    // 6. Verificar campos adicionados
    console.log('🔍 Verificando campos adicionados ao DecisionRecord...');
    const fieldsResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'xase_decision_records' 
      AND column_name IN ('hasHumanIntervention', 'finalDecisionSource')
    `);

    if (fieldsResult.rows.length === 2) {
      console.log('✅ Campos hasHumanIntervention e finalDecisionSource adicionados!\n');
    } else {
      console.log('⚠️  Campos não encontrados (podem já existir)\n');
    }

    // 7. Verificar ENUM criado
    console.log('🔍 Verificando ENUM xase_intervention_action...');
    const enumResult = await client.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typname = 'xase_intervention_action'
    `);

    if (enumResult.rows.length > 0) {
      console.log('✅ ENUM xase_intervention_action criado!\n');
    } else {
      console.log('⚠️  ENUM não encontrado (pode já existir)\n');
    }

    // 8. Verificar triggers
    console.log('🔍 Verificando triggers de imutabilidade...');
    const triggersResult = await client.query(`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE event_object_table = 'xase_human_interventions'
    `);

    if (triggersResult.rows.length > 0) {
      console.log('✅ Triggers de imutabilidade criados:');
      triggersResult.rows.forEach(row => {
        console.log(`   - ${row.trigger_name}`);
      });
      console.log('');
    }

    console.log('🎉 MIGRATION COMPLETA!\n');
    console.log('📋 Próximos passos:');
    console.log('   1. npx prisma generate');
    console.log('   2. npm run dev');
    console.log('   3. Testar API de intervenção\n');

  } catch (error) {
    console.error('❌ Erro ao executar migration:', error.message);
    console.error('\nDetalhes:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
