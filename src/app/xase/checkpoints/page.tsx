import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';

export const metadata: Metadata = {
  title: 'Xase Checkpoints',
  description: 'This feature was removed. Bundles + audit logs provide all guarantees.',
};

export default async function CheckpointsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Checkpoints</h1>
            <p className="text-sm text-white/50">This feature was removed. Integrity is guaranteed by the decision chain, evidence bundles (manifest hash + offline verify), and immutable audit logs.</p>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-12">
            <div className="space-y-3">
              <p className="text-sm text-white/60">
                If you need additional signing, we can optionally sign the bundle manifest with KMS and include the signature in the export.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
