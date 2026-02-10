'use client';

import { Playfair_Display } from 'next/font/google';
const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

interface Snapshot {
  id: string;
  type: string;
  payloadHash: string;
  payloadSize: number | null;
  capturedAt: Date;
  compressed: boolean;
}

interface SnapshotsCardProps {
  snapshots: Snapshot[];
  docMode?: boolean;
}

export function SnapshotsCard({ snapshots, docMode = false }: SnapshotsCardProps) {
  const getSnapshotIcon = () => {
    // Minimal neutral indicator (dot)
    return <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/40" />;
  };

  const getSnapshotLabel = (type: string) => {
    switch (type) {
      case 'EXTERNAL_DATA':
        return 'External Data';
      case 'BUSINESS_RULES':
        return 'Business Rules';
      case 'ENVIRONMENT':
        return 'Environment';
      case 'FEATURE_VECTOR':
        return 'Feature Vector';
      default:
        return type;
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (snapshots.length === 0) {
    return null;
  }

  const isDoc = !!docMode;
  return (
    <div className={`${isDoc ? 'bg-white border border-gray-200 text-gray-900' : 'bg-white/[0.03] border border-white/[0.08] text-white'} rounded-xl p-4 space-y-4`}>
      <div className="flex items-center gap-2">
        <h2 className={`${heading.className} text-base font-semibold ${isDoc ? 'text-gray-900' : 'text-white'}`}>Reproducibility Snapshots</h2>
      </div>

      <p className={`text-xs ${isDoc ? 'text-gray-700' : 'text-white/60'}`}>
        Immutable snapshots captured at decision time to enable full reproducibility and audit trail.
      </p>

      <div className="space-y-2.5">
        {snapshots.map((snapshot) => (
          <div
            key={snapshot.id}
            className={`flex items-center justify-between p-3 rounded-lg transition-colors ${isDoc ? 'bg-gray-50 border border-gray-300 hover:bg-gray-100' : 'bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04]'}`}
          >
            <div className="flex items-center gap-2.5 flex-1">
              {!isDoc && getSnapshotIcon()}
              <div className="flex-1">
                <p className={`text-xs font-medium ${isDoc ? 'text-gray-900' : 'text-white'}`}>{getSnapshotLabel(snapshot.type)}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className={`text-[11px] ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>
                    Hash: {snapshot.payloadHash.substring(0, 16)}...
                  </p>
                  <p className={`text-[11px] ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>
                    Size: {formatSize(snapshot.payloadSize)}
                  </p>
                  {snapshot.compressed && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${isDoc ? 'bg-gray-100 text-gray-700 border-gray-300' : 'bg-white/10 text-white/80 border-white/15'}`}>
                      Compressed
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-[11px] ${isDoc ? 'text-gray-500' : 'text-white/40'}`}>
                {new Date(snapshot.capturedAt).toLocaleString('en-US', {
                  month: 'short',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className={`${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.04] border-white/[0.08]'} rounded-lg p-3 border`}>
        <div className="flex items-start gap-2.5">
          {!isDoc && <div className={`w-1.5 h-1.5 rounded-full mt-1 bg-white/40`} />}
          <div className="flex-1">
            <h3 className={`text-xs font-medium mb-0.5 ${isDoc ? 'text-gray-900' : 'text-white'}`}>Reproducibility Guarantee</h3>
            <p className={`text-[11px] ${isDoc ? 'text-gray-700' : 'text-white/60'}`}>
              These snapshots allow complete recreation of the decision. All data is immutably stored and cryptographically verified.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
