import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { FileText, Code, Shield, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Xase',
  description: 'API usage guide',
};

export default async function DocsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }
  redirect('https://xase.ai/docs');

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[900px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Documentation</h1>
            <p className="text-sm text-gray-400">
              Complete guide to integrate with XASE AI
            </p>
          </div>

          {/* Quick Start */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-base font-semibold text-white">Quick Start</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">1. Create API Key</p>
                <p className="text-xs text-gray-400">
                  Go to <a href="/xase/api-keys" className="text-blue-400 hover:underline">API Keys</a> and create your first key with <code className="px-1 py-0.5 bg-gray-800 rounded text-xs">ingest</code> permission.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">2. Register Decision</p>
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 mt-2">
                  <code className="text-xs text-gray-300 font-mono block whitespace-pre">
{`POST /api/xase/v1/records
Content-Type: application/json
X-API-Key: xase_pk_...

{
  "input": {
    "user_id": 123,
    "amount": 1000
  },
  "output": {
    "approved": true,
    "score": 0.95
  },
  "policyId": "credit-approval-v1",
  "storePayload": true
}`}
                  </code>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">3. Verify Integrity</p>
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 mt-2">
                  <code className="text-xs text-gray-300 font-mono block whitespace-pre">
{`GET /api/xase/v1/verify/:transaction_id
X-API-Key: xase_pk_...`}
                  </code>
                </div>
              </div>
            </div>
          </div>

          {/* Endpoints */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Code className="w-5 h-5 text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Endpoints</h2>
            </div>
            <div className="space-y-4">
              <div className="border-l-2 border-blue-500 pl-4">
                <p className="text-sm font-medium text-white mb-1">POST /api/xase/v1/records</p>
                <p className="text-xs text-gray-400">Register a new decision in the ledger</p>
              </div>
              <div className="border-l-2 border-green-500 pl-4">
                <p className="text-sm font-medium text-white mb-1">GET /api/xase/v1/verify/:id</p>
                <p className="text-xs text-gray-400">Verify integrity of a decision</p>
              </div>
              <div className="border-l-2 border-purple-500 pl-4">
                <p className="text-sm font-medium text-white mb-1">POST /api/xase/v1/export/:id</p>
                <p className="text-xs text-gray-400">Export offline proof bundle</p>
              </div>
              <div className="border-l-2 border-yellow-500 pl-4">
                <p className="text-sm font-medium text-white mb-1">POST /api/xase/v1/cron/checkpoint</p>
                <p className="text-xs text-gray-400">Create checkpoint (protected)</p>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Features</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">✓ Hash Chain</p>
                <p className="text-xs text-gray-400">Each decision is chained with SHA-256</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">✓ KMS Checkpoint</p>
                <p className="text-xs text-gray-400">External cryptographic signature</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">✓ Proof Bundle</p>
                <p className="text-xs text-gray-400">Verifiable offline export</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">✓ Audit Log WORM</p>
                <p className="text-xs text-gray-400">Immutable action trail</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">✓ Idempotency</p>
                <p className="text-xs text-gray-400">Safe retry with Idempotency-Key</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">✓ Scopes</p>
                <p className="text-xs text-gray-400">Permissions per API Key</p>
              </div>
            </div>
          </div>

          {/* Resources */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-orange-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Resources</h2>
            </div>
            <div className="space-y-2">
              <a href="https://xase.ai/docs" className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.12] transition-all">
                <span className="text-sm text-white">API Reference</span>
                <span className="text-xs text-white/40">→</span>
              </a>
              <a href="https://xase.ai/docs" className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.12] transition-all">
                <span className="text-sm text-white">Examples</span>
                <span className="text-xs text-white/40">→</span>
              </a>
              <a href="https://xase.ai/docs" className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.12] transition-all">
                <span className="text-sm text-white">GitHub</span>
                <span className="text-xs text-white/40">→</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
