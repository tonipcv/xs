#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SRC_APP = path.join(ROOT, 'src', 'app');

/**
 * Recursively walk directory and return file paths.
 */
function walk(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile() && (p.endsWith('.ts') || p.endsWith('.tsx'))) acc.push(p);
  }
  return acc;
}

/**
 * Replace all metadata and generateMetadata title properties to 'Xase'.
 * Conservative approach: only mutate files that include either
 * 'export const metadata' or 'generateMetadata'.
 */
function normalizeTitles(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  if (!/export\s+const\s+metadata|generateMetadata/.test(code)) return { changed: false };

  let updated = code;

  // 1) In export const metadata blocks, replace title: "..." or '...'
  //    We constrain to within the metadata object by doing a lazy match after the identifier.
  updated = updated.replace(
    /(export\s+const\s+metadata\s*:\s*Metadata\s*=\s*\{[\s\S]*?)(title\s*:\s*)(["'`])([\s\S]*?)(\3)/g,
    (m, pre, tprop) => `${pre}${tprop}'Xase'`
  );

  updated = updated.replace(
    /(export\s+const\s+metadata\s*=\s*\{[\s\S]*?)(title\s*:\s*)(["'`])([\s\S]*?)(\3)/g,
    (m, pre, tprop) => `${pre}${tprop}'Xase'`
  );

  // 2) In generateMetadata return objects, replace title similarly
  //    We handle return { ... } and implicit object returns.
  updated = updated.replace(
    /(generateMetadata[\s\S]*?return\s*\{[\s\S]*?)(title\s*:\s*)(["'`])([\s\S]*?)(\3)/g,
    (m, pre, tprop) => `${pre}${tprop}'Xase'`
  );

  // Also cover simple object literal return via parentheses: return ({ ... })
  updated = updated.replace(
    /(generateMetadata[\s\S]*?return\s*\(\s*\{[\s\S]*?)(title\s*:\s*)(["'`])([\s\S]*?)(\3)/g,
    (m, pre, tprop) => `${pre}${tprop}'Xase'`
  );

  if (updated !== code) {
    fs.writeFileSync(filePath, updated, 'utf8');
    return { changed: true };
  }
  return { changed: false };
}

function main() {
  if (!fs.existsSync(SRC_APP)) {
    console.error('[fix-seo-titles] src/app not found');
    process.exit(1);
  }

  const files = walk(SRC_APP);
  let changedCount = 0;
  for (const f of files) {
    const before = fs.readFileSync(f, 'utf8');
    const res = normalizeTitles(f);
    if (res.changed) {
      changedCount++;
      console.log(`[fix-seo-titles] Updated: ${path.relative(ROOT, f)}`);
    }
  }

  if (changedCount === 0) {
    console.log('[fix-seo-titles] No titles changed (already normalized or patterns not found).');
  } else {
    console.log(`[fix-seo-titles] Done. Files changed: ${changedCount}`);
  }
}

main();
