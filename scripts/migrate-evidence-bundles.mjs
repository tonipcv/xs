#!/usr/bin/env node
/*
  Evidence Bundles Migration Script
  ---------------------------------
  This script regenerates the Prisma client and applies the database migration
  required for the Evidence Bundles & Export Compliance feature.

  Usage:
    - Development (default):
        node scripts/migrate-evidence-bundles.mjs

    - Force deploy mode (production-like):
        node scripts/migrate-evidence-bundles.mjs --deploy

    - Respect NODE_ENV:
        NODE_ENV=production node scripts/migrate-evidence-bundles.mjs

  Notes:
    - This script will not install dependencies. Ensure Prisma CLI is available via npx.
    - For production, you generally want `prisma migrate deploy`.
*/

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...opts,
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

function header(title) {
  console.log(`\n\x1b[36m❯ ${title}\x1b[0m`);
}

async function main() {
  const root = process.cwd();
  const prismaSchema = path.join(root, 'prisma', 'schema.prisma');
  const deployFlag = process.argv.includes('--deploy');
  const isProd = deployFlag || process.env.NODE_ENV === 'production';

  header('Validating project structure');
  if (!existsSync(prismaSchema)) {
    console.error('\n\x1b[31m✖ prisma/schema.prisma not found. Run this from the project root.\x1b[0m');
    process.exit(1);
  }

  // Optional: warn if jszip not installed (used by bundle download)
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    await import('jszip');
  } catch (e) {
    console.warn('\n\x1b[33m⚠ jszip is not installed. Install with `npm i jszip` to enable ZIP generation.\x1b[0m');
  }

  header('Generating Prisma Client');
  await run('npx', ['prisma', 'generate']);

  if (isProd) {
    header('Applying migrations (deploy)');
    await run('npx', ['prisma', 'migrate', 'deploy']);
  } else {
    header('Creating & applying migration (dev)');
    await run('npx', ['prisma', 'migrate', 'dev', '--name', 'add_evidence_bundle_compliance_fields']);
  }

  // Optional: type-check to ensure updated client types are in place
  const hasTypeCheck = existsSync(path.join(root, 'package.json'));
  if (hasTypeCheck) {
    header('Type-checking build (optional)');
    try {
      await run('npm', ['run', 'build']);
    } catch {
      console.warn('\n\x1b[33m⚠ Build reported errors. Ensure TypeScript errors are fixed after migration.\x1b[0m');
    }
  }

  console.log('\n\x1b[32m✔ Migration complete. Evidence Bundles schema is up to date.\x1b[0m');
  console.log('\x1b[2mTip: In production, prefer `--deploy` or NODE_ENV=production.\x1b[0m');
}

main().catch((err) => {
  console.error('\n\x1b[31m✖ Migration failed:\x1b[0m', err?.message || err);
  process.exit(1);
});
