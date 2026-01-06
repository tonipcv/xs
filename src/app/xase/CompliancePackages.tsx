'use client';

import { useState } from 'react';
import { CreateBundleModal } from './bundles/CreateBundleModal';

interface CompliancePackagesProps {
  tenantId: string;
}

export function CompliancePackages({ tenantId }: CompliancePackagesProps) {
  const [open, setOpen] = useState(false);
  const [initialPurpose, setInitialPurpose] = useState<string | undefined>(undefined);
  const [initialDescription, setInitialDescription] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState<string | undefined>(undefined);

  const openModal = (purpose: string, description: string | undefined, t: string) => {
    setInitialPurpose(purpose);
    setInitialDescription(description || t);
    setTitle(t);
    setOpen(true);
  };

  const Card = ({ title, desc, includes, onClick }: { title: string; desc: string; includes: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="text-left flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
    >
      <p className="text-sm font-medium text-white">{title}</p>
      <div className="text-xs text-white/60 space-y-1">
        <p>{desc}</p>
        <p className="text-white/50">{includes}</p>
      </div>
    </button>
  );

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-white/90">Compliance Packages</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card
          title="EU AI Act High-Risk Report"
          desc="Full decision trail + human oversight evidence."
          includes="Includes: Chain integrity proof, Merkle root certificate, decision hashes, timestamp attestation, intervention logs."
          onClick={() => openModal('COMPLIANCE', 'EU AI Act high-risk report generation', 'EU AI Act High-Risk Report')}
        />
        <Card
          title="Decision Reconstruction Package"
          desc="Complete reproducibility evidence bundle."
          includes="Includes: Input/output hashes, model/policy versions, environment snapshots, feature vectors, verification scripts."
          onClick={() => openModal('COMPLIANCE', 'Decision reconstruction package', 'Decision Reconstruction Package')}
        />
        <Card
          title="Human Oversight Evidence"
          desc="Intervention logs + justifications."
          includes="Includes: Intervention breakdown (approve/reject/override/escalate), reasons, actor metadata, timestamps."
          onClick={() => openModal('COMPLIANCE', 'Human oversight evidence export', 'Human Oversight Evidence')}
        />
        <a
          href="/xase/audit"
          className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
        >
          <p className="text-sm font-medium text-white">Full Audit Trail Export</p>
          <div className="text-xs text-white/60 space-y-1">
            <p>Complete immutable action log.</p>
            <p className="text-white/50">Includes: Administrative actions, resource targets, immutable timestamps, event identifiers, status outcomes.</p>
          </div>
        </a>
      </div>

      {open && (
        <CreateBundleModal
          onClose={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
          tenantId={tenantId}
          initialPurpose={initialPurpose}
          initialDescription={initialDescription}
          title={title}
        />
      )}
    </div>
  );
}
