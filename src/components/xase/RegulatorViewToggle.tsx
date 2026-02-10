'use client';

import { Eye, Building2 } from 'lucide-react';

interface RegulatorViewToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function RegulatorViewToggle({ enabled, onChange }: RegulatorViewToggleProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
      <Building2 className="w-4 h-4 text-white/50" />
      <span className="text-xs text-white/60">Regulator View</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          enabled ? 'bg-blue-500' : 'bg-white/20'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
      {enabled && (
        <span className="text-[10px] text-blue-400 uppercase font-medium">Active</span>
      )}
    </div>
  );
}
