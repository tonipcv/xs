
'use client';

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession, signOut } from "next-auth/react";
import Link from 'next/link';
import { Playfair_Display } from 'next/font/google';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

interface UsageData {
  tokensUsedThisMonth: number;
  freeTokensLimit: number;
  totalTokensUsed: number;
  percentage: number;
  planTier: string;
  useCasesIncluded: number;
  retentionYears: number;
  daysUntilReset: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [organizationType, setOrganizationType] = useState<string | null>(null);
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user) {
      setProfile({
        id: '1',
        name: session.user.name || 'Usuário',
        email: session.user.email || '',
        phone: '+55 11 99999-9999',
      });
    }
  }, [session]);

  useEffect(() => {
    const loadUsage = async () => {
      try {
        const res = await fetch('/api/user/usage', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setUsage(data);
      } catch (e) {
        console.error('Failed to load usage', e);
      }
    };
    loadUsage();
  }, []);

  useEffect(() => {
    const load2fa = async () => {
      try {
        const res = await fetch('/api/profile/me', { cache: 'no-store' })
        if (!res.ok) return;
        const data = await res.json()
        setTwoFactorEnabled(Boolean(data.twoFactorEnabled))
        if (typeof data.role === 'string') {
          setRole(data.role)
        }
      } catch {}
    }
    load2fa()
  }, [])

  useEffect(() => {
    const fetchOrganizationType = async () => {
      try {
        const res = await fetch('/api/user/organization-type', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setOrganizationType(data.organizationType || null);
        }
      } catch {}
    }
    fetchOrganizationType();
  }, [])

  if (!profile) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const handleManageBilling = async () => {
    setIsLoadingPortal(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error('Failed to open billing portal', e);
    } finally {
      setIsLoadingPortal(false);
    }
  };

  const tierLabels: Record<string, string> = {
    sandbox: 'Sandbox (Free)',
    team: 'Team',
    business: 'Business',
    enterprise: 'Enterprise',
    enterprise_plus: 'Enterprise Plus',
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className={`${heading.className} text-2xl font-semibold text-gray-900 tracking-tight`}>Profile</h1>
              <p className="text-sm text-gray-600">Manage your account information, security and preferences.</p>
            </div>
            <Button
              onClick={() => signOut({ callbackUrl: '/login', redirect: true })}
              className="bg-gray-900 hover:bg-gray-800 text-white"
            >
              Sign out
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className={`${heading.className} text-sm font-semibold text-gray-900`}>Account</h2>
                    <p className="text-xs text-gray-500">Update your personal information</p>
                  </div>
                  <div>
                    <Label className="text-gray-700">Organization</Label>
                    <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded border border-gray-200 text-xs text-gray-700">
                      {organizationType
                        ? (organizationType === 'CLIENT' ? 'AI LAB' : 'DATA HOLDER')
                        : 'Loading...'}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-gray-700">Name</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      disabled={!isEditing}
                      className="mt-1 bg-white border border-gray-300 text-gray-900 placeholder-gray-400"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-gray-700">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      disabled={!isEditing}
                      className="mt-1 bg-white border border-gray-300 text-gray-900 placeholder-gray-400"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-700">Role</Label>
                    <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded border border-gray-200 text-xs text-gray-700">
                      {role ? role : 'Loading...'}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-gray-700">Phone</Label>
                    <Input
                      id="phone"
                      value={profile.phone || ''}
                      disabled={!isEditing}
                      className="mt-1 bg-white border border-gray-300 text-gray-900 placeholder-gray-400"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-700">Plan</Label>
                    <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded border border-gray-200 text-xs text-gray-700">
                      {usage ? tierLabels[usage.planTier] || usage.planTier : 'Loading...'}
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex gap-2 pt-5">
                    <Button size="sm" className="bg-gray-900 hover:bg-gray-800 text-white">Save</Button>
                    <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50" onClick={() => setIsEditing(false)}>Cancel</Button>
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className={`${heading.className} text-sm font-semibold text-gray-900`}>Preferences</h2>
                    <p className="text-xs text-gray-500">Language, notifications and theme</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="text-gray-700">Language</div>
                  <div className="text-gray-500">Auto (browser)</div>
                  <div className="text-gray-700">Theme</div>
                  <div className="text-gray-500">Light</div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className={`${heading.className} text-sm font-semibold text-gray-900`}>Security</h2>
                    <p className="text-xs text-gray-500">Add an extra layer of protection to your account</p>
                  </div>
                  {twoFactorEnabled !== null && (
                    <span className={`text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-600`}>
                      {twoFactorEnabled ? '2FA Enabled' : '2FA Disabled'}
                    </span>
                  )}
                </div>
                <Link href="/profile/security/2fa" className="inline-flex items-center px-3 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-md transition-colors">
                  {twoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA'}
                </Link>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className={`${heading.className} text-sm font-semibold text-gray-900`}>Plan & Usage</h2>
                    <p className="text-xs text-gray-500">Current tier and monthly consumption</p>
                  </div>
                </div>
                {usage ? (
                  <div className="space-y-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Tier</span>
                      <span className="text-gray-900 font-medium">{tierLabels[usage.planTier] || usage.planTier}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Use Cases</span>
                      <span className="text-gray-900 font-medium">{usage.useCasesIncluded === 999999999 ? 'Unlimited' : usage.useCasesIncluded}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Retention</span>
                      <span className="text-gray-900 font-medium">{usage.retentionYears < 1 ? '30 days' : `${usage.retentionYears} years`}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-3 space-y-2">
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Tokens Used</span>
                        <span className="text-gray-900 font-medium">{usage.tokensUsedThisMonth.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Limit</span>
                        <span className="text-gray-900 font-medium">{usage.freeTokensLimit >= 999999999 ? 'Unlimited' : usage.freeTokensLimit.toLocaleString()}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-2 bg-gray-500" style={{ width: `${Math.min(usage.percentage, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-500">{usage.percentage}% used</span>
                        <span className="text-gray-500">Resets in {usage.daysUntilReset} days</span>
                      </div>
                    </div>
                    {usage.planTier !== 'sandbox' && (
                      <Button 
                        onClick={handleManageBilling}
                        disabled={isLoadingPortal}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm"
                      >
                        {isLoadingPortal ? 'Loading...' : 'Manage Billing'}
                      </Button>
                    )}
                    {usage.planTier === 'sandbox' && (
                      <Link href="/planos" className="block">
                        <Button className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm">
                          Upgrade Plan
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Loading...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
