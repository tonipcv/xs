import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import { Playfair_Display } from 'next/font/google';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

export const metadata: Metadata = {
  title: 'Getting Started - Xase',
  description: 'Quick start guide to connect insurance decisions via CLI, SDK, or API',
};

export default async function GettingStartedPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0e0f12]">
        <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-8">
          <div className="space-y-2">
            <h1 className={`${heading.className} text-2xl font-semibold text-white tracking-tight`}>Getting Started</h1>
            <p className="text-sm text-gray-400">Connect insurance decisions (claims/underwriting) via CLI (curl), JavaScript SDK, or HTTP API.</p>
          </div>

          {/* Prerequisites */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-2">Prerequisites</h2>
            <ul className="text-sm text-gray-300 space-y-1 list-disc pl-5">
              <li>Generate an API Key in <a href="/xase/api-keys" className="text-blue-400 hover:underline">API Keys</a>.</li>
              <li>Set your API key as an environment variable: <code className="px-1 py-0.5 bg-gray-800 rounded text-xs">X-API-Key</code>.</li>
            </ul>
          </div>

          {/* CLI (curl) */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-3">CLI (curl)</h2>
            <p className="text-sm text-gray-400 mb-3">Record an insurance decision using a simple HTTP request.</p>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
              <code className="text-xs text-gray-300 font-mono block whitespace-pre overflow-auto">
{`curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: xase_pk_..." \
  -d '{
    "input": { "claim_id": "clm_123", "policy_number": "PN-9982", "claim_amount": 12500.00 },
    "output": { "decision": "APPROVED", "score": 0.91, "reasons": ["Within coverage", "No fraud indicators"] },
    "policyId": "insurance-claims-v1",
    "storePayload": true
  }' \
  https://your-domain.com/api/xase/v1/records`}
              </code>
            </div>
          </div>

          {/* SDK (JavaScript) */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-3">SDK (JavaScript)</h2>
            <p className="text-sm text-gray-400 mb-3">Use the official JavaScript SDK to record decisions from Node.js.</p>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 mb-3">
              <code className="text-xs text-gray-300 font-mono block whitespace-pre overflow-auto">{`npm install @xase/sdk-js`}</code>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
              <code className="text-xs text-gray-300 font-mono block whitespace-pre overflow-auto">
{`import { XaseClient } from '@xase/sdk-js'

const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  baseUrl: 'https://your-domain.com', // optional if using default
  fireAndForget: true,
})

await xase.record({
  policy: 'insurance-claims-v1',
  input: { claim_id: 'clm_123', policy_number: 'PN-9982', claim_amount: 12500.00 },
  output: { decision: 'APPROVED', score: 0.91, reasons: ['Within coverage', 'No fraud indicators'] },
  confidence: 0.94,
})`}
              </code>
            </div>
          </div>

          {/* HTTP API */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-3">HTTP API</h2>
            <p className="text-sm text-gray-400 mb-3">Verify insurance decision integrity using the verification endpoint.</p>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
              <code className="text-xs text-gray-300 font-mono block whitespace-pre overflow-auto">
{`curl -X GET \
  -H "X-API-Key: xase_pk_..." \
  https://your-domain.com/api/xase/v1/verify/<transaction_id>`}
              </code>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
