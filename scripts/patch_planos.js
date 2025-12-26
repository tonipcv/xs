/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src', 'app', 'planos', 'page.tsx');
let src = fs.readFileSync(file, 'utf8');

function replaceOnce(haystack, needle, replacement) {
  if (!haystack.includes(needle)) return haystack;
  return haystack.replace(needle, replacement);
}

// 1) Ensure import of TalkToSalesModal
const importNeedle = "import type { ReactNode } from 'react'";
const importInsert = `${importNeedle}\nimport TalkToSalesModal from '@/components/TalkToSalesModal'`;
src = replaceOnce(src, importNeedle, importInsert);

// 2) Replace hero buttons block
const heroNeedle = [
  '          <div className="flex gap-3">',
  '            <a href="/contact" className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">',
  '              Talk to Sales',
  '            </a>',
  '            <a href="/contact" className="px-4 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm">',
  '              Talk to Sales',
  '            </a>',
  '          </div>',
].join('\n');

const heroReplacement = [
  '          <div className="flex gap-3">',
  '            <TalkToSalesModal triggerClassName="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm" triggerText="Talk to Sales" />',
  '            <TalkToSalesModal triggerClassName="px-4 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm" triggerText="Request Demo" />',
  '          </div>',
].join('\n');

src = replaceOnce(src, heroNeedle, heroReplacement);

// 3) Replace Sandbox CTA
src = replaceOnce(
  src,
  '<a href="/contact" className="block w-full text-center px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] rounded-md text-sm">Talk to Sales</a>',
  '<TalkToSalesModal triggerClassName="block w-full text-center px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] rounded-md text-sm" triggerText="Talk to Sales" />'
);

// 4) Replace Team CTA
src = replaceOnce(
  src,
  '<a href="/contact" className="block w-full text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Talk to Sales</a>',
  '<TalkToSalesModal triggerClassName="block w-full text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm" triggerText="Talk to Sales" />'
);

// 5) Replace Business CTA (same class as Team)
src = replaceOnce(
  src,
  '<a href="/contact" className="block w-full text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Talk to Sales</a>',
  '<TalkToSalesModal triggerClassName="block w-full text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm" triggerText="Talk to Sales" />'
);

// 6) Replace Enterprise CTAs
src = replaceOnce(
  src,
  '<a href="/contact" className="w-1/2 text-center px-3 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm">Contact Sales</a>',
  '<TalkToSalesModal triggerClassName="w-1/2 text-center px-3 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm" triggerText="Contact Sales" />'
);

src = replaceOnce(
  src,
  '<a href="/contact" className="w-1/2 text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Request Demo</a>',
  '<TalkToSalesModal triggerClassName="w-1/2 text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm" triggerText="Request Demo" />'
);

// 7) POV button
src = replaceOnce(
  src,
  '<a href="/contact" className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Start a Proof of Value</a>',
  '<TalkToSalesModal triggerClassName="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm" triggerText="Start a Proof of Value" />'
);

// 8) Monthly equivalents
src = replaceOnce(
  src,
  '<h3 className="text-xl font-semibold">$12,000 / year</h3>',
  '<h3 className="text-xl font-semibold">$12,000 / year <span className="text-white/50 text-sm">($1,000/mo, billed annually)</span></h3>'
);

src = replaceOnce(
  src,
  '<h3 className="text-xl font-semibold">$40,000 / year</h3>',
  '<h3 className="text-xl font-semibold">$40,000 / year <span className="text-white/50 text-sm">(~$3,333/mo, billed annually)</span></h3>'
);

src = replaceOnce(
  src,
  '<h3 className="text-xl font-semibold">From $120,000 / year</h3>',
  '<h3 className="text-xl font-semibold">From $120,000 / year <span className="text-white/50 text-sm">(from $10,000/mo, billed annually)</span></h3>'
);

fs.writeFileSync(file, src, 'utf8');
console.log('Patched src/app/planos/page.tsx');
