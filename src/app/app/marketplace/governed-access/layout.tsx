import { ReactNode } from 'react'
import { AppLayout } from '@/components/AppSidebar'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8">
          {children}
        </div>
      </div>
    </AppLayout>
  )
}
