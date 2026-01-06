import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import ApiKeyCreatorModal from './ApiKeyCreatorModal';
import ApiKeyDeleteButton from './ApiKeyDeleteButton';

export const metadata: Metadata = {
  title: 'Xase',
  description: 'Manage API keys',
};

export default async function ApiKeysPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const tenantId = await getTenantId();
  
  let keys: any[] = [];

  if (tenantId) {
    keys = await prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        isActive: true,
        rateLimit: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">
                API Keys
              </h1>
              <p className="text-sm text-white/50">
                {keys.length} key{keys.length !== 1 ? 's' : ''} configured
              </p>
            </div>
            <ApiKeyCreatorModal />
          </div>

          {keys.length > 0 ? (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">Name</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">Key Prefix</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">Permissions</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">Rate Limit</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">Last Used</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">Status</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-sm text-white/90">{key.name}</td>
                      <td className="px-6 py-4 text-sm text-white/60 font-mono">{key.keyPrefix}...</td>
                      <td className="px-6 py-4 text-sm text-white/60">{key.permissions}</td>
                      <td className="px-6 py-4 text-sm text-white/60">{key.rateLimit}/hour</td>
                      <td className="px-6 py-4 text-sm text-white/50">
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Never'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${key.isActive ? 'bg-emerald-500/5 text-emerald-400/80 border-emerald-500/20' : 'bg-white/[0.02] text-white/40 border-white/[0.06]'}`}>
                          {key.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {key.isActive ? (
                          <ApiKeyDeleteButton apiKeyId={key.id} apiKeyName={key.name} />
                        ) : (
                          <span className="text-xs text-white/40">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">No API keys yet</h3>
                  <p className="text-sm text-white/50 max-w-md">Create your first API key to start using the API</p>
                </div>
                <a href="https://xase.ai/docs" className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm font-medium rounded-md transition-colors mt-4">
                  View docs
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
