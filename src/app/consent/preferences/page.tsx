'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ConsentPreference {
  id: string;
  datasetId: string;
  datasetName: string;
  purpose: string;
  granted: boolean;
  grantedAt?: string;
  expiresAt?: string;
}

export default function ConsentPreferencesPage() {
  const { data: session, status } = useSession();
  const [preferences, setPreferences] = useState<ConsentPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchPreferences();
    }
  }, [status]);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/consent/preferences');
      
      if (!response.ok) {
        throw new Error('Failed to fetch preferences');
      }
      
      const data = await response.json();
      setPreferences(data.preferences || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleConsent = async (datasetId: string, purpose: string, currentlyGranted: boolean) => {
    try {
      const endpoint = currentlyGranted ? '/api/v1/consent/revoke' : '/api/v1/consent/grant';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          datasetId,
          purpose,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${currentlyGranted ? 'revoke' : 'grant'} consent`);
      }

      // Refresh preferences
      await fetchPreferences();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading preferences...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
          <p className="text-gray-600">Please sign in to manage your consent preferences.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-5 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Consent Preferences</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your data usage consent for AI training and analytics
            </p>
          </div>

          {error && (
            <div className="px-6 py-4 bg-red-50 border-b border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="px-6 py-6">
            {preferences.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No consent preferences</h3>
                <p className="mt-1 text-sm text-gray-500">
                  You haven't been asked for consent on any datasets yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {preferences.map((pref) => (
                  <div
                    key={pref.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900">
                          {pref.datasetName}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Purpose: <span className="font-medium">{pref.purpose}</span>
                        </p>
                        {pref.granted && pref.grantedAt && (
                          <p className="mt-1 text-xs text-gray-400">
                            Granted on {new Date(pref.grantedAt).toLocaleDateString()}
                          </p>
                        )}
                        {pref.expiresAt && (
                          <p className="mt-1 text-xs text-gray-400">
                            Expires on {new Date(pref.expiresAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="ml-4">
                        <button
                          onClick={() =>
                            handleToggleConsent(pref.datasetId, pref.purpose, pref.granted)
                          }
                          className={`
                            relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
                            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                            ${pref.granted ? 'bg-blue-600' : 'bg-gray-200'}
                          `}
                        >
                          <span
                            className={`
                              pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
                              transition duration-200 ease-in-out
                              ${pref.granted ? 'translate-x-5' : 'translate-x-0'}
                            `}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span
                        className={`
                          inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                          ${
                            pref.granted
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }
                        `}
                      >
                        {pref.granted ? 'Consent Granted' : 'Consent Revoked'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-blue-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-900">About Consent</h3>
                <div className="mt-2 text-sm text-gray-500">
                  <p>
                    Your consent preferences control how your data can be used for AI training and
                    analytics. You can revoke consent at any time, and changes take effect within 60
                    seconds across all systems.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
