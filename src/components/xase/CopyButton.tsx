'use client';

import { useState } from 'react';

export function CopyButton({ text, title }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <button
      onClick={handleCopy}
      className={`text-xs ${copied ? 'text-white/80' : 'text-white/50 hover:text-white/80'} transition-colors`}
      title={title || 'Copy to clipboard'}
    >
      {copied ? '✓' : '📋'}
    </button>
  );
}
