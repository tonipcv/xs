import { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppLayout } from '@/components/AppSidebar'

export const metadata: Metadata = {
  title: 'Profile',
  description: 'User profile and security settings',
}

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  const user = session.user as any

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#1c1d20]">
        <div className="max-w-[900px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Profile</h1>
            <p className="text-sm text-white/60">Manage your account information and security.</p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-white/80">Account</h2>
              <div className="text-sm text-white/80 space-y-1">
                <p><span className="text-white/50">Name:</span> {user?.name || '-'}</p>
                <p><span className="text-white/50">Email:</span> {user?.email || '-'}</p>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white/80">Two-factor authentication</h2>
                  <p className="text-xs text-white/50">Add an extra layer of security to your account.</p>
                </div>
                <a href="/xase/profile/security/2fa" className="px-3 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm font-medium rounded-md transition-colors">
                  Configure
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
