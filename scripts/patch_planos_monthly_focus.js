/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src', 'app', 'planos', 'page.tsx');
let src = fs.readFileSync(file, 'utf8');

function replaceOnce(haystack, needle, replacement) {
  if (!haystack.includes(needle)) return haystack;
  return haystack.replace(needle, replacement);
}

// Team: change primary to monthly, add annual note
src = replaceOnce(
  src,
  '              <h3 className="text-xl font-semibold">$12,000 / year <span className="text-white/50 text-sm">($1,000/mo, billed annually)</span></h3>',
  '              <h3 className="text-xl font-semibold">$1,000 / month</h3>\n              <p className="text-white/50 text-xs">Billed annually ($12,000/year)</p>'
);

// Business: monthly focus
src = replaceOnce(
  src,
  '              <h3 className="text-xl font-semibold">$40,000 / year <span className="text-white/50 text-sm">(~$3,333/mo, billed annually)</span></h3>',
  '              <h3 className="text-xl font-semibold">~$3,333 / month</h3>\n              <p className="text-white/50 text-xs">Billed annually ($40,000/year)</p>'
);

// Enterprise: monthly focus
src = replaceOnce(
  src,
  '              <h3 className="text-xl font-semibold">From $120,000 / year <span className="text-white/50 text-sm">(from $10,000/mo, billed annually)</span></h3>',
  '              <h3 className="text-xl font-semibold">From $10,000 / month</h3>\n              <p className="text-white/50 text-xs">Billed annually (from $120,000/year)</p>'
);

fs.writeFileSync(file, src, 'utf8');
console.log('Patched monthly focus in src/app/planos/page.tsx');
