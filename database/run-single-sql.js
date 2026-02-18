/**
 * Run a single SQL migration file in its own transaction.
 * Usage: node database/run-single-sql.js database/migrations/<file>.sql
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function sanitizeDatabaseUrl(url) {
  if (!url) return url;
  if (url.startsWith('=postgres://') || url.startsWith('=postgresql://')) {
    console.warn('⚠️  Removendo "=" inicial indevido do DATABASE_URL');
    return url.slice(1);
  }
  return url;
}

(async () => {
  try {
    const filePath = process.argv[2];
    if (!filePath) {
      console.error('Usage: node database/run-single-sql.js <path-to-sql>');
      process.exit(1);
    }

    const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(absPath)) {
      console.error(`❌ SQL file not found: ${absPath}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(absPath, 'utf8');
    const connectionString = sanitizeDatabaseUrl(process.env.DATABASE_URL);
    if (!connectionString) {
      console.error('❌ DATABASE_URL não definido.');
      process.exit(1);
    }

    const client = new Client({ connectionString });
    await client.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`✅ Migration aplicada: ${path.basename(absPath)}`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`❌ Falha ao aplicar ${path.basename(absPath)}:`, e.message);
      process.exit(1);
    } finally {
      await client.end();
    }
  } catch (err) {
    console.error('❌ Erro inesperado:', err);
    process.exit(1);
  }
})();
