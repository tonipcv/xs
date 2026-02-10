'use client';

import { useState } from 'react';

interface ExplainerButtonProps {
  title: string;
  explanation: string;
  legalContext?: string;
}

export function ExplainerButton({ title, explanation, legalContext }: ExplainerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs text-white/50 hover:text-white/80 transition-colors ml-2"
        title="What does this mean?"
      >
        ?
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="absolute z-50 top-full right-0 mt-2 w-80 p-4 bg-[#1a1d23] border border-white/10 rounded-lg shadow-xl">
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-sm font-semibold text-white">{title}</h4>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/50 hover:text-white/80 transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-white/70 leading-relaxed mb-3">{explanation}</p>
            {legalContext && (
              <div className="pt-3 border-t border-white/10">
                <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1">
                  Legal Context
                </p>
                <p className="text-xs text-white/60 leading-relaxed">{legalContext}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export const EXPLAINERS = {
  chainIntegrity: {
    title: 'Chain Integrity',
    explanation: 'Every decision record is cryptographically linked to the previous one using hash functions. This creates an unbreakable chain where any tampering would be immediately detectable.',
    legalContext: 'This mechanism provides legal proof that evidence has not been altered after creation, satisfying EU AI Act Article 12 requirements for record-keeping and Article 19 for conformity assessment.',
  },
  merkleRoot: {
    title: 'Merkle Root',
    explanation: 'A single cryptographic hash that represents all records in an evidence bundle. Think of it as a digital fingerprint for the entire dataset. If any record changes, the Merkle root changes.',
    legalContext: 'Used in legal evidence packages to prove completeness and authenticity. Widely accepted in courts as proof of data integrity.',
  },
  humanOversight: {
    title: 'Human Oversight Log',
    explanation: 'A complete record of every time a human reviewed, approved, rejected, or changed an AI decision. This includes who made the change, when, why, and what the outcome was.',
    legalContext: 'Required by EU AI Act Article 14 for high-risk AI systems. Demonstrates that meaningful human oversight is in place and functioning.',
  },
  overrideRate: {
    title: 'Override Rate',
    explanation: 'The percentage of AI decisions that were changed by human operators. A very low rate might indicate the AI is highly reliable, or that humans aren\'t reviewing carefully. A very high rate might indicate the AI needs retraining.',
    legalContext: 'Key performance indicator for human oversight effectiveness. Regulators use this to assess if human review is meaningful or just rubber-stamping.',
  },
  auditTrail: {
    title: 'Audit Trail',
    explanation: 'An immutable, timestamped log of every action taken in the system - who accessed what, when, and what they did. Once written, entries cannot be modified or deleted.',
    legalContext: 'Critical for demonstrating compliance with GDPR Article 5(2) accountability principle and for defending against claims of evidence tampering.',
  },
  highImpact: {
    title: 'High-Impact Decisions',
    explanation: 'AI decisions that significantly affect individuals - such as large financial amounts, legal rights, or access to essential services. These require additional scrutiny and documentation.',
    legalContext: 'Consumer protection laws and the EU AI Act require enhanced safeguards for decisions with significant individual impact, including the right to explanation and human review.',
  },
  evidenceBundle: {
    title: 'Evidence Bundle',
    explanation: 'A cryptographically sealed package containing decision records, supporting data, verification tools, and a chain-of-custody report. Designed to be independently verifiable by third parties.',
    legalContext: 'Structured for legal admissibility in court proceedings and regulatory audits. Meets e-discovery standards and can be verified without access to the original system.',
  },
};
