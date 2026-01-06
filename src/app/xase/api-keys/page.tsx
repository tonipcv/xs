import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { Playfair_Display } from 'next/font/google';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';
import ApiKeyCreatorModal from './ApiKeyCreatorModal';
import ApiKeyDeleteButton from './ApiKeyDeleteButton';

export const metadata: Metadata = {
  title: 'Xase',
  description: 'Manage API keys',
};

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600','700'] });

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
      <div className="min-h-screen bg-[#0e0f12]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className={`${heading.className} text-2xl font-semibold text-white/90 tracking-tight`}>
                API Keys
              </h1>
              <p className="text-sm text-white/60">
                {keys.length} key{keys.length !== 1 ? 's' : ''} configured
              </p>
            </div>
            <ApiKeyCreatorModal />
          </div>

          {keys.length > 0 ? (
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider uppercase">Name</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider uppercase">Key Prefix</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider uppercase">Permissions</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider uppercase">Rate Limit</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider uppercase">Last Used</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider uppercase">Status</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-sm text-white/90">{key.name}</td>
                      <td className="px-6 py-4 text-sm text-white/70 font-mono">{key.keyPrefix}...</td>
                      <td className="px-6 py-4 text-sm text-white/70">{key.permissions}</td>
                      <td className="px-6 py-4 text-sm text-white/70">{key.rateLimit}/hour</td>
                      <td className="px-6 py-4 text-sm text-white/70">
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
                        <span className={`text-[11px] px-2 py-0.5 rounded border font-medium bg-white/[0.02] text-white/70 border-white/[0.08]`}>
                          {key.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {key.isActive ? (
                          <ApiKeyDeleteButton apiKeyId={key.id} apiKeyName={key.name} />
                        ) : (
                          <span className="text-xs text-white/60">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <h3 className="text-lg font-semibold text-white/90">No API keys yet</h3>
                <p className="text-sm text-white/60 max-w-md">Create your first API key to start using the API</p>
                <a href="https://xase.ai/docs" className="px-4 py-2 border border-white/12 bg-transparent text-white/85 rounded text-sm font-medium hover:bg-white/[0.04] hover:border-white/20 transition-colors mt-2">
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
