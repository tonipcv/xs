#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'src', 'app', 'layout.tsx');

function main() {
  if (!fs.existsSync(targetPath)) {
    console.error(`[fix-favicons] File not found: ${targetPath}`);
    process.exit(1);
  }

  let code = fs.readFileSync(targetPath, 'utf8');
  const original = code;

  // Short-circuit if already configured
  if (code.includes("/favicon.ico") && code.includes("/apple-icon.png")) {
    console.log('[fix-favicons] Favicons already configured. No changes made.');
    process.exit(0);
  }

  // 1) Update metadata.icons block
  // Replace icon: '/splash.png', with a list of icons (ico, svg, png)
  code = code.replace(
    /(icons:\s*\{[\s\S]*?icon:\s*)'\/splash\.png'(,)/,
    (m, p1, p2) =>
      `${p1}[{ url: '/favicon.ico', rel: 'icon', type: 'image/x-icon' }, { url: '/icon0.svg', rel: 'icon', type: 'image/svg+xml' }, { url: '/icon1.png', rel: 'icon', type: 'image/png' }]${p2}`
  );

  // Replace shortcut: '/splash.png', with ['/favicon.ico']
  code = code.replace(
    /(icons:\s*\{[\s\S]*?shortcut:\s*)'\/splash\.png'(,)/,
    (m, p1, p2) => `${p1}['/favicon.ico']${p2}`
  );

  // Replace apple: '/splash.png', with '/apple-icon.png'
  code = code.replace(
    /(icons:\s*\{[\s\S]*?apple:\s*)'\/splash\.png'(,?)/,
    (m, p1, p2) => `${p1}'/apple-icon.png'${p2}`
  );

  // 2) Update <head> link tags
  // Replace single favicon link
  code = code.replace(
    /<link\s+rel=\"icon\"\s+href=\"\/splash\.png\"\s*\/>/,
    '<link rel="icon" href="/favicon.ico" sizes="any" />\n        <link rel="icon" type="image/svg+xml" href="/icon0.svg" />\n        <link rel="icon" type="image/png" href="/icon1.png" />'
  );

  // Replace apple-touch-icon link
  code = code.replace(
    /<link\s+rel=\"apple-touch-icon\"\s+href=\"\/splash\.png\"\s*\/>/,
    '<link rel="apple-touch-icon" href="/apple-icon.png" />'
  );

  if (code === original) {
    console.warn('[fix-favicons] No changes applied (patterns not found). Please review src/app/layout.tsx structure.');
    process.exit(2);
  }

  fs.writeFileSync(targetPath, code, 'utf8');
  console.log('[fix-favicons] Updated favicons in src/app/layout.tsx');
}

main();
