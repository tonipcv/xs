'use client';

import { useState } from 'react';

interface TooltipProps {
  term: string;
  definition: string;
  children: React.ReactNode;
}

export function Tooltip({ term, definition, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span className="relative inline-block">
      <span
        className="border-b border-dotted border-white/30 cursor-help"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </span>
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-[#1a1d23] border border-white/10 rounded-lg shadow-xl">
          <p className="text-xs font-semibold text-white mb-1">{term}</p>
          <p className="text-xs text-white/70 leading-relaxed">{definition}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-[#1a1d23] border-r border-b border-white/10 rotate-45"></div>
        </div>
      )}
    </span>
  );
}

interface GlossaryEntry {
  term: string;
  definition: string;
  legalContext?: string;
}

export const XASE_GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Chain Integrity',
    definition: 'Cryptographic verification that all decision records are linked in an unbroken chain using hash functions, ensuring no record can be altered without detection.',
    legalContext: 'Critical for demonstrating evidence tampering has not occurred (EU AI Act Art. 12)',
  },
  {
    term: 'Merkle Root',
    definition: 'A single hash that represents the entire set of decision records in a bundle, allowing efficient verification of data integrity.',
    legalContext: 'Used in legal evidence packages to prove completeness and authenticity',
  },
  {
    term: 'Hash Chain',
    definition: 'A sequence where each record contains the hash of the previous record, creating an immutable audit trail.',
    legalContext: 'Provides temporal ordering and tamper-evidence for regulatory compliance',
  },
  {
    term: 'Override Rate',
    definition: 'Percentage of AI decisions that were changed by human operators, indicating model reliability and human oversight effectiveness.',
    legalContext: 'Key metric for EU AI Act Art. 14 human oversight requirements',
  },
  {
    term: 'Human Oversight',
    definition: 'Documented interventions where humans review, approve, reject, or override AI decisions.',
    legalContext: 'Required by EU AI Act Art. 14 for high-risk AI systems',
  },
  {
    term: 'Evidence Bundle',
    definition: 'A cryptographically sealed package containing decision records, metadata, and verification tools for legal or regulatory purposes.',
    legalContext: 'Designed for e-discovery, regulatory audits, and litigation support',
  },
  {
    term: 'Audit Trail',
    definition: 'Immutable log of all administrative actions and system events, timestamped and cryptographically secured.',
    legalContext: 'Required for demonstrating compliance with data protection and AI regulations',
  },
  {
    term: 'High-Impact Decision',
    definition: 'An AI decision with significant consequences for individuals (e.g., large financial impact, legal rights affected).',
    legalContext: 'Triggers additional review requirements under consumer protection laws',
  },
];

export function GlossaryTooltip({ term, children }: { term: string; children: React.ReactNode }) {
  const entry = XASE_GLOSSARY.find((e) => e.term === term);
  
  if (!entry) {
    return <>{children}</>;
  }

  return (
    <Tooltip term={entry.term} definition={entry.definition}>
      {children}
    </Tooltip>
  );
}
