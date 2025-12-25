'use client';

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession, signOut } from "next-auth/react";
import Link from 'next/link';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  plan: string;
  tokensUsed: number;
  tokensLimit: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null);
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user) {
      setProfile({
        id: '1',
        name: session.user.name || 'Usuário',
        email: session.user.email || '',
        phone: '+55 11 99999-9999',
        plan: 'Pro',
        tokensUsed: 1250,
        tokensLimit: 5000,
      });
    }
  }, [session]);

  useEffect(() => {
    const load2fa = async () => {
      try {
        const res = await fetch('/api/profile/me', { cache: 'no-store' })
        if (!res.ok) return;
        const data = await res.json()
        setTwoFactorEnabled(Boolean(data.twoFactorEnabled))
      } catch {}
    }
    load2fa()
  }, [])

  if (!profile) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-[#1c1d20] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const usagePct = Math.round((profile.tokensUsed / profile.tokensLimit) * 100);

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#1c1d20]">
        <div className="max-w-[1100px] mx-auto px-8 py-8 space-y-8">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">Profile</h1>
              <p className="text-sm text-white/60">Manage your account information, security and preferences.</p>
            </div>
            <Button
              onClick={() => signOut({ callbackUrl: '/login', redirect: true })}
              className="bg-white/[0.06] hover:bg-white/[0.12] text-white"
            >
              Sign out
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white/80">Account</h2>
                    <p className="text-xs text-white/50">Update your personal information</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/15 text-white/80 hover:bg-white/[0.06]"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-white/70">Name</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      disabled={!isEditing}
                      className="mt-1 bg-[#2a2b2d] border-none text-white placeholder-white/40"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-white/70">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      disabled={!isEditing}
                      className="mt-1 bg-[#2a2b2d] border-none text-white placeholder-white/40"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-white/70">Phone</Label>
                    <Input
                      id="phone"
                      value={profile.phone || ''}
                      disabled={!isEditing}
                      className="mt-1 bg-[#2a2b2d] border-none text-white placeholder-white/40"
                    />
                  </div>
                  <div>
                    <Label className="text-white/70">Plan</Label>
                    <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded border border-white/[0.12] text-xs text-white/80">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                      {profile.plan}
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex gap-2 pt-5">
                    <Button size="sm" className="bg-white/[0.12] hover:bg-white/[0.18] text-white">Save</Button>
                    <Button size="sm" variant="outline" className="border-white/15 text-white/80 hover:bg-white/[0.06]" onClick={() => setIsEditing(false)}>Cancel</Button>
                  </div>
                )}
              </div>

              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white/80">Preferences</h2>
                    <p className="text-xs text-white/50">Language, notifications and theme</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="text-white/70">Language</div>
                  <div className="text-white/50">Auto (browser)</div>
                  <div className="text-white/70">Theme</div>
                  <div className="text-white/50">Dark</div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white/80">Security</h2>
                    <p className="text-xs text-white/50">Add an extra layer of protection to your account</p>
                  </div>
                  {twoFactorEnabled !== null && (
                    <span className={`text-[11px] px-2 py-1 rounded border ${twoFactorEnabled ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/15 text-white/60 bg-white/[0.04]'}`}>
                      {twoFactorEnabled ? '2FA Enabled' : '2FA Disabled'}
                    </span>
                  )}
                </div>
                <Link href="/profile/security/2fa" className="inline-flex items-center px-3 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm font-medium rounded-md transition-colors">
                  {twoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA'}
                </Link>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
                <h2 className="text-sm font-semibold text-white/80 mb-1">Plan</h2>
                <p className="text-xs text-white/50 mb-4">Monthly AI usage</p>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs text-white/60">
                    <span>Used</span>
                    <span className="text-white/80 font-medium">{profile.tokensUsed.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>Limit</span>
                    <span className="text-white/80 font-medium">{profile.tokensLimit.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-2 bg-green-500" style={{ width: `${usagePct}%` }} />
                  </div>
                  <p className="text-[11px] text-white/50">{usagePct}% used</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
