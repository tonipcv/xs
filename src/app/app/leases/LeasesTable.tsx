import Link from 'next/link';

type Lease = {
  id: string;
  policyId: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  policy: {
    policyId: string;
    dataset: {
      datasetId: string;
      name: string;
    }
  };
};

export function LeasesTable({ initialLeases, initialTotal, tenantId }: { initialLeases: Lease[]; initialTotal: number; tenantId: string; }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200 text-left">
          <tr>
            <th className="px-4 py-2 text-xs text-gray-600">Dataset</th>
            <th className="px-4 py-2 text-xs text-gray-600">Policy</th>
            <th className="px-4 py-2 text-xs text-gray-600">Issued</th>
            <th className="px-4 py-2 text-xs text-gray-600">Expires</th>
            <th className="px-4 py-2 text-xs text-gray-600">Revoked</th>
          </tr>
        </thead>
        <tbody>
          {initialLeases.map((lease) => (
            <tr key={lease.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-2 text-xs text-gray-900">
                <Link href={`/app/datasets/${lease.policy.dataset.datasetId}`} className="underline hover:text-gray-800">
                  {lease.policy.dataset.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-xs text-gray-700 font-mono">{lease.policy.policyId}</td>
              <td className="px-4 py-2 text-xs text-gray-700">{new Date(lease.issuedAt).toLocaleString()}</td>
              <td className="px-4 py-2 text-xs text-gray-700">{new Date(lease.expiresAt).toLocaleString()}</td>
              <td className="px-4 py-2 text-xs text-gray-700">{lease.revokedAt ? new Date(lease.revokedAt).toLocaleString() : '-'}</td>
            </tr>
          ))}
          {initialLeases.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-500">No leases found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
