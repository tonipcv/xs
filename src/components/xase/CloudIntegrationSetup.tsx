'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Cloud, CheckCircle2, XCircle, AlertCircle, Trash2 } from 'lucide-react';
import Image from 'next/image';

interface CloudIntegration {
  id: string;
  name: string;
  provider: string;
  status: string;
  lastTestedAt?: string;
  lastTestStatus?: string;
  createdAt: string;
}

const PROVIDER_INFO: Record<string, { name: string; logo: string; description: string }> = {
  AWS_S3: {
    name: 'Amazon S3',
    logo: '/logos-integrations/aws.png',
    description: 'Connect your AWS S3 buckets for voice data storage',
  },
  GCS: {
    name: 'Google Cloud Storage',
    logo: '/logos-integrations/google-cloud.png',
    description: 'Connect your GCS buckets for voice data storage',
  },
  AZURE_BLOB: {
    name: 'Azure Blob Storage',
    logo: '/logos-integrations/azure.png',
    description: 'Connect your Azure storage accounts',
  },
  BIGQUERY: {
    name: 'BigQuery',
    // Using Google Cloud logo for BigQuery if a specific BigQuery asset isn't present
    logo: '/logos-integrations/google-cloud.png',
    description: 'Connect to Google BigQuery',
  },
};

function ProviderLogo({ provider }: { provider: string }) {
  const info = PROVIDER_INFO[provider];
  const fallback = info?.name?.[0] || '?';
  if (!info) return null;
  return (
    <div className="w-6 h-6 rounded-md bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
      {/* Use plain img to allow graceful onError fallback without Next.js build-time asset checks */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={info.logo}
        alt={`${info.name} logo`}
        className="w-6 h-6 object-contain"
        onError={(e) => {
          const el = e.currentTarget;
          // Hide broken image, show fallback initial
          el.style.display = 'none';
          const parent = el.parentElement;
          if (parent) {
            parent.textContent = fallback;
            parent.classList.add('text-gray-900', 'font-semibold');
          }
        }}
      />
    </div>
  );
}

export function CloudIntegrationSetup({ tenantId }: { tenantId: string }) {
  const [integrations, setIntegrations] = useState<CloudIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalProvider, setModalProvider] = useState<string | null>(null);
  const [modalName, setModalName] = useState<string>('');
  const [modalProjectId, setModalProjectId] = useState<string>('');
  const [modalAwsAccessKeyId, setModalAwsAccessKeyId] = useState<string>('');
  const [modalAwsSecretAccessKey, setModalAwsSecretAccessKey] = useState<string>('');
  const [modalAwsRegion, setModalAwsRegion] = useState<string>('us-east-1');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  useEffect(() => {
    fetchIntegrations();
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      const provider = urlParams.get('provider');
      setSuccess(`Successfully connected ${provider}!`);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (urlParams.get('error')) {
      setError(urlParams.get('error'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // When there is at least one integration connected, mark onboarding step as completed
  useEffect(() => {
    if (integrations.length > 0) {
      (async () => {
        try {
          await fetch('/api/onboarding/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: 'integrationSetup' }),
          });
        } catch {}
      })();
    }
  }, [integrations]);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cloud-integrations');
      if (!response.ok) throw new Error('Failed to fetch integrations');
      const data = await response.json();
      setIntegrations(data.integrations || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (integrationId: string, newName: string) => {
    if (!newName || !newName.trim()) return;
    try {
      const res = await fetch(`/api/cloud-integrations/rename?id=${encodeURIComponent(integrationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data?.error || 'Failed to rename integration');
      }
      await fetchIntegrations();
      setSuccess('Integration renamed successfully');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setMenuOpenId(null);
      setShowRenameModal(false);
      setRenameId(null);
      setRenameValue('');
    }
  };

  const openRename = (integrationId: string, currentName: string) => {
    setRenameId(integrationId);
    setRenameValue(currentName || '');
    setShowRenameModal(true);
  };

  const handleConnect = async (
    provider: string,
    opts?: { name?: string; projectId?: string; accessKeyId?: string; secretAccessKey?: string; region?: string }
  ) => {
    try {
      setConnectingProvider(provider);
      setError(null);
      
      // AWS uses access keys flow via POST (no OAuth)
      if (provider === 'AWS_S3') {
        const friendlyName = (opts?.name || '').trim();
        if (!friendlyName) throw new Error('A name is required');
        const accessKeyId = (opts?.accessKeyId || '').trim();
        const secretAccessKey = (opts?.secretAccessKey || '').trim();
        const region = (opts?.region || 'us-east-1').trim();
        if (!accessKeyId) throw new Error('AWS Access Key ID is required');
        if (!secretAccessKey) throw new Error('AWS Secret Access Key is required');

        const res = await fetch('/api/cloud-integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'AWS_S3',
            name: friendlyName,
            accessKeyId: accessKeyId.trim(),
            secretAccessKey: secretAccessKey.trim(),
            region: region.trim() || 'us-east-1',
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as any));
          throw new Error(body.error || 'Failed to create AWS integration');
        }
        await fetchIntegrations();
        setSuccess('Successfully connected AWS S3!');
        setConnectingProvider(null);
        return;
      }

      const friendlyName = (opts?.name || '').trim();
      if (!friendlyName) throw new Error('A name is required');

      let url = `/api/oauth/${provider.toLowerCase()}/authorize?tenantId=${tenantId}&redirect=/app/datasets/browse&name=${encodeURIComponent(friendlyName)}`;
      // For Google providers using OAuth, ask for projectId and pass it along
      if (provider === 'GCS' || provider === 'BIGQUERY') {
        const projectId = (opts?.projectId || '').trim();
        if (!projectId) throw new Error('GCP Project ID is required to connect this provider.');
        url += `&projectId=${encodeURIComponent(projectId)}`;
      }
      window.location.href = url;
    } catch (err: any) {
      setError(err.message);
      setConnectingProvider(null);
    }
  };

  const openConnectModal = (provider: string) => {
    setModalProvider(provider);
    setModalName('');
    setModalProjectId('');
    setModalAwsAccessKeyId('');
    setModalAwsSecretAccessKey('');
    setModalAwsRegion('us-east-1');
    setShowModal(true);
  };

  const submitModal = async () => {
    if (!modalProvider) return;
    const provider = modalProvider;
    const name = modalName.trim();
    const needsProjectId = provider === 'GCS' || provider === 'BIGQUERY';
    const projectId = modalProjectId.trim();
    const needsAwsCreds = provider === 'AWS_S3';
    const accessKeyId = modalAwsAccessKeyId.trim();
    const secretAccessKey = modalAwsSecretAccessKey.trim();
    const region = modalAwsRegion.trim() || 'us-east-1';
    if (!name) {
      setError('A name is required');
      return;
    }
    if (needsProjectId && !projectId) {
      setError('GCP Project ID is required');
      return;
    }
    if (needsAwsCreds) {
      if (!accessKeyId) { setError('AWS Access Key ID is required'); return; }
      if (!secretAccessKey) { setError('AWS Secret Access Key is required'); return; }
    }
    setShowModal(false);
    await handleConnect(provider, {
      name,
      projectId: needsProjectId ? projectId : undefined,
      accessKeyId: needsAwsCreds ? accessKeyId : undefined,
      secretAccessKey: needsAwsCreds ? secretAccessKey : undefined,
      region: needsAwsCreds ? region : undefined,
    });
  };

  const handleDelete = async (integrationId: string) => {
    if (!confirm('Are you sure you want to remove this integration?')) return;

    try {
      const response = await fetch(`/api/cloud-integrations?id=${integrationId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete integration');
      
      await fetchIntegrations();
      setSuccess('Integration removed successfully');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'ACTIVE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-emerald-200 bg-emerald-50 text-emerald-700">
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-gray-200 bg-gray-50 text-gray-700">
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert className="bg-gray-50 border-gray-200">
          <AlertDescription className="text-gray-800">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-gray-50 border-gray-200">
          <AlertDescription className="text-gray-800">{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(PROVIDER_INFO).map(([provider, info]) => {
          // Always allow connecting a new account from the provider cards
          return (
            <Card key={provider} className="relative border border-gray-200 bg-transparent shadow-none">
              <CardHeader className="py-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <ProviderLogo provider={provider} />
                    <div>
                      <CardTitle className="text-base text-gray-900">{info.name}</CardTitle>
                      <CardDescription className="text-xs mt-1 text-gray-700">
                        {info.description}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <Button
                  onClick={() => openConnectModal(provider)}
                  disabled={connectingProvider === provider}
                  size="sm"
                  variant="outline"
                  className="w-full border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  {connectingProvider === provider ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4 mr-2" />
                      Connect
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {integrations.length > 0 && (
        <Card className="bg-transparent border border-gray-200 shadow-none">
          <CardHeader>
            <CardTitle className="text-gray-900">Connected Integrations</CardTitle>
            <CardDescription className="text-gray-600">Manage your cloud storage connections</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {integrations.filter(integration => integration.provider !== 'SNOWFLAKE').map(integration => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-transparent border-gray-200 relative"
                >
                  <div className="flex items-center gap-3">
                    <ProviderLogo provider={integration.provider} />
                    <div>
                      <div className="font-medium text-gray-900">{integration.name}</div>
                      <div className="text-sm text-gray-600">
                        {PROVIDER_INFO[integration.provider as keyof typeof PROVIDER_INFO]?.name}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(integration.status)}
                    <button
                      type="button"
                      aria-label="More actions"
                      onClick={() => setMenuOpenId(menuOpenId === integration.id ? null : integration.id)}
                      className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-100"
                    >
                      <span className="block w-1 h-1 bg-gray-600 rounded-full" />
                      <span className="block w-1 h-1 bg-gray-600 rounded-full mx-[2px]" />
                      <span className="block w-1 h-1 bg-gray-600 rounded-full" />
                    </button>
                    {menuOpenId === integration.id && (
                      <div className="absolute right-3 top-10 z-10 w-40 rounded-md border border-gray-200 bg-white shadow-sm text-gray-900">
                        <button
                          className="w-full text-left px-3 py-2 text-[13px] text-gray-900 hover:bg-gray-50"
                          onClick={() => {
                            setMenuOpenId(null)
                            window.location.href = `/app/datasets/browse?integrationId=${encodeURIComponent(integration.id)}`
                          }}
                        >
                          Browse datasets
                        </button>
                        <button
                          className="w-full text-left px-3 py-2 text-[13px] text-gray-900 hover:bg-gray-50"
                          onClick={() => { setMenuOpenId(null); openRename(integration.id, integration.name) }}
                        >
                          Rename
                        </button>
                        <button
                          className="w-full text-left px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(integration.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Native Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-white border border-gray-200 shadow-lg p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Connect {modalProvider && PROVIDER_INFO[modalProvider]?.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Integration Name</label>
                <input
                  className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 placeholder-gray-400"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  placeholder={modalProvider === 'AWS_S3' ? 'e.g., Marketing S3 Prod' : 'e.g., Finance GCS Prod'}
                />
              </div>
              {(modalProvider === 'GCS' || modalProvider === 'BIGQUERY') && (
                <div>
                  <label className="block text-sm text-gray-700 mb-1">GCP Project ID</label>
                  <input
                    className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 placeholder-gray-400"
                    value={modalProjectId}
                    onChange={(e) => setModalProjectId(e.target.value)}
                    placeholder="my-gcp-project"
                  />
                </div>
              )}
              {modalProvider === 'AWS_S3' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">AWS Access Key ID</label>
                    <input
                      className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 placeholder-gray-400"
                      value={modalAwsAccessKeyId}
                      onChange={(e) => setModalAwsAccessKeyId(e.target.value)}
                      placeholder="AKIA..."
                      autoComplete="off"
                      name="aws_access_key_id"
                      inputMode="text"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">AWS Secret Access Key</label>
                    <input
                      type="password"
                      className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 placeholder-gray-400"
                      value={modalAwsSecretAccessKey}
                      onChange={(e) => setModalAwsSecretAccessKey(e.target.value)}
                      placeholder="****************"
                      autoComplete="new-password"
                      name="aws_secret_access_key"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Region</label>
                    <input
                      className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 placeholder-gray-400"
                      value={modalAwsRegion}
                      onChange={(e) => setModalAwsRegion(e.target.value)}
                      placeholder="us-east-1"
                      autoComplete="off"
                      name="aws_region"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" className="border-gray-300 text-gray-700" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="bg-gray-900 hover:bg-black text-white" onClick={submitModal} disabled={!!connectingProvider}>
                {connectingProvider === modalProvider ? 'Connecting…' : 'Connect'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRenameModal(false)} />
          <div className="relative w-full max-w-sm rounded-lg bg-white border border-gray-200 shadow-lg p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Rename Integration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">New name</label>
                <input
                  className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 placeholder-gray-400"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="e.g., GCS Finance Prod"
                  autoFocus
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" className="border-gray-300 text-gray-700" onClick={() => setShowRenameModal(false)}>Cancel</Button>
              <Button
                variant="outline"
                className="border-gray-300 text-gray-700 hover:bg-gray-100"
                onClick={() => { if (renameId && renameValue.trim()) handleRename(renameId, renameValue) }}
                disabled={!renameId || !renameValue.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
