/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src', 'app', 'planos', 'page.tsx');
let src = fs.readFileSync(file, 'utf8');

function replaceAll(haystack, needle, replacement) {
  return haystack.split(needle).join(replacement);
}

function replaceOnce(haystack, needle, replacement) {
  if (!haystack.includes(needle)) return haystack;
  return haystack.replace(needle, replacement);
}

// 1) Remove TalkToSalesModal import if present
src = src.replace("\nimport TalkToSalesModal from '@/components/TalkToSalesModal'", '');

// 2) Hero buttons block: replace two modal triggers with anchors
src = replaceOnce(
  src,
  '            <TalkToSalesModal triggerClassName="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm" triggerText="Talk to Sales" />',
  '            <a href="/contact" className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Talk to Sales</a>'
);
src = replaceOnce(
  src,
  '            <TalkToSalesModal triggerClassName="px-4 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm" triggerText="Request Demo" />',
  '            <a href="/contact" className="px-4 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm">Request Demo</a>'
);

// 3) Card CTAs: replace modal trigger variants with anchors
src = replaceAll(
  src,
  '<TalkToSalesModal triggerClassName="block w-full text-center px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] rounded-md text-sm" triggerText="Talk to Sales" />',
  '<a href="/contact" className="block w-full text-center px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] rounded-md text-sm">Talk to Sales</a>'
);
src = replaceAll(
  src,
  '<TalkToSalesModal triggerClassName="block w-full text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm" triggerText="Talk to Sales" />',
  '<a href="/contact" className="block w-full text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Talk to Sales</a>'
);

// 4) Enterprise dual buttons
src = replaceOnce(
  src,
  '<TalkToSalesModal triggerClassName="w-1/2 text-center px-3 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm" triggerText="Contact Sales" />',
  '<a href="/contact" className="w-1/2 text-center px-3 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm">Contact Sales</a>'
);
src = replaceOnce(
  src,
  '<TalkToSalesModal triggerClassName="w-1/2 text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm" triggerText="Request Demo" />',
  '<a href="/contact" className="w-1/2 text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Request Demo</a>'
);

// 5) POV callout button
src = replaceOnce(
  src,
  '<TalkToSalesModal triggerClassName="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm" triggerText="Start a Proof of Value" />',
  '<a href="/contact" className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Start a Proof of Value</a>'
);

fs.writeFileSync(file, src, 'utf8');
console.log('Reverted modal to /contact links in src/app/planos/page.tsx');
