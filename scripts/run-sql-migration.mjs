#!/usr/bin/env node
/*
  Run Raw SQL Migration (PostgreSQL)
  ----------------------------------
  Executes a SQL file against the database specified by DATABASE_URL (or --url).

  Defaults to scripts/sql/evidence_bundles_migration.sql.

  Usage:
    node scripts/run-sql-migration.mjs
    node scripts/run-sql-migration.mjs --file scripts/sql/your_migration.sql
    node scripts/run-sql-migration.mjs --url postgres://user:pass@host:5432/db

  Env:
    DATABASE_URL=postgres://...
*/

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function header(msg) {
  console.log(`\n\x1b[36m❯ ${msg}\x1b[0m`);
}

function parseArgs(argv) {
  const args = { file: null, url: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') args.file = argv[++i];
    else if (a === '--url' || a === '-u') args.url = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const defaultFile = path.join(__dirname, 'sql', 'evidence_bundles_migration.sql');
  const sqlFile = args.file ? path.resolve(process.cwd(), args.file) : defaultFile;

  header('Resolving SQL file');
  if (!fs.existsSync(sqlFile)) {
    console.error(`\n\x1b[31m✖ SQL file not found:\x1b[0m ${sqlFile}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlFile, 'utf8');
  console.log(`Using SQL file: ${sqlFile}`);

  const connectionString = args.url || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('\n\x1b[31m✖ DATABASE_URL not provided. Set env or pass --url.\x1b[0m');
    process.exit(1);
  }

  header('Connecting to database');
  const client = new Client({ connectionString });
  try {
    await client.connect();

    header('Executing migration SQL');
    await client.query(sql);

    header('Migration completed successfully');
    console.log('\x1b[32m✔ Done\x1b[0m');
  } catch (err) {
    console.error('\n\x1b[31m✖ Migration failed:\x1b[0m', err.message || err);
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

main();
