/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src', 'app', 'planos', 'page.tsx');
let src = fs.readFileSync(file, 'utf8');

const containerNeedle = '    <div className="min-h-screen bg-[#0f1115] text-white">';
const headerBlock = [
  '    <div className="min-h-screen bg-[#0f1115] text-white">',
  '      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#0f1115]/80 backdrop-blur">',
  '        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">',
  '          <a href="/" className="flex items-center gap-2">',
  '            <img src="/ft-icone.png" alt="XASE" className="h-6 w-6 rounded" />',
  '            <span className="text-sm font-medium tracking-tight text-white/90">XASE</span>',
  '          </a>',
  '        </div>',
  '      </header>'
].join('\n');

if (src.includes(containerNeedle)) {
  src = src.replace(containerNeedle, headerBlock);
  fs.writeFileSync(file, src, 'utf8');
  console.log('Inserted header into src/app/planos/page.tsx');
} else {
  console.log('Container needle not found. No changes made.');
}
