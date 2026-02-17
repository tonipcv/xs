'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import BrandLogo from '@/components/BrandLogo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Mic, Database, Shield, Activity, Coins, BarChart3, Key, Cpu, Plus, Heart, TrendingUp, Lock, FileCheck, Zap, Settings, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const supplierMenuItems = [
  {
    title: 'MAIN',
    items: [
      { title: 'Dashboard', url: '/app/dashboard', icon: Mic },
      { title: 'Datasets', url: '/app/datasets', icon: Database },
      { title: 'Policies', url: '/app/policies', icon: Shield },
      { title: 'Marketplace', url: '/app/marketplace', icon: BarChart3 },
      { title: 'Leases', url: '/app/leases', icon: Key },
      { title: 'Billing', url: '/app/billing', icon: Coins },
      { title: 'Audit', url: '/app/audit', icon: Activity },
      { title: 'Compliance', url: '/app/compliance', icon: FileCheck },
      { title: 'Settings', url: '/app/settings', icon: Settings },
    ],
  },
];

const clientMenuItems = [
  {
    title: 'MAIN',
    items: [
      { title: 'Dashboard', url: '/app/dashboard', icon: Cpu },
      { title: 'Marketplace', url: '/app/marketplace', icon: BarChart3 },
      { title: 'Training', url: '/app/training', icon: Cpu },
      { title: 'Leases', url: '/app/leases', icon: Key },
      { title: 'Billing', url: '/app/billing', icon: Coins },
      { title: 'Audit', url: '/app/audit', icon: Activity },
      { title: 'Compliance', url: '/app/compliance', icon: FileCheck },
      { title: 'Settings', url: '/app/settings', icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [organizationType, setOrganizationType] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState<boolean>(true);
  const { data: session } = useSession();
  const { setOpen } = useSidebar();

  useEffect(() => {
    let cancelled = false;
    async function fetchOrganizationType() {
      if (!session?.user?.email) {
        setOrgLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/user/organization-type', { cache: 'no-store' });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setOrganizationType(data.organizationType);
        }
      } catch (_) {
        // suppress logs to avoid noisy console during startup
      } finally {
        if (!cancelled) setOrgLoading(false);
      }
    }
    fetchOrganizationType();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.email]);

  const menuItems = organizationType === 'CLIENT' ? clientMenuItems
                   : organizationType === 'SUPPLIER' ? supplierMenuItems
                   : null; // defer until known to avoid flicker

  // Expand sidebar by default so text labels are always visible
  useEffect(() => {
    setOpen(true);
  }, [setOpen]);

  const user = (session?.user as any) || {};
  const displayName: string = user.name || (user.email ? String(user.email).split('@')[0] : 'Account');
  const initial: string = (displayName?.[0] || 'U').toUpperCase();

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await signOut({ 
        callbackUrl: '/login',
        redirect: true 
      });
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      setIsLoggingOut(false);
    }
  };

  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      className="border-r border-gray-200 bg-white"
    >
      <SidebarHeader className="bg-white h-16 flex items-center justify-center text-black">
        <BrandLogo showText={true} />
      </SidebarHeader>

      <SidebarContent className="bg-transparent py-2">
        {!menuItems || orgLoading ? (
          <div className="px-3 py-2 text-[12px] text-gray-500">Loading menu…</div>
        ) : (
        menuItems.map((group) => (
          <SidebarGroup key={group.title} className="px-2 py-1">
            <SidebarGroupLabel className="text-[11px] font-semibold text-gray-500 px-2 py-1">{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname
                    ? (pathname === item.url || pathname.startsWith(item.url + '/'))
                    : false;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="h-8 w-full justify-start px-2 rounded-md text-[13px] transition-colors border border-transparent text-gray-600 hover:bg-gray-50 data-[active=true]:bg-gray-100 data-[active=true]:text-gray-900 data-[active=true]:border-gray-300"
                      >
                        <Link href={item.url} className="flex items-center gap-2">
                          {item.icon ? <item.icon className="h-4 w-4" /> : null}
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))
        )}
      </SidebarContent>
 
      <SidebarFooter className="border-t border-gray-200 bg-white p-2">
        <div className="flex items-center justify-between px-2">
          <Link href="/profile" className="flex items-center gap-2 hover:opacity-90">
            <div className="w-6 h-6 rounded-md bg-gray-100 text-gray-700 flex items-center justify-center text-[10px] font-semibold border border-gray-200">
              {initial}
            </div>
            {/** Only show the display name when sidebar is expanded */}
            {useSidebar().state === 'expanded' && (
              <div className="text-xs text-gray-700">
                {displayName}
              </div>
            )}
          </Link>
          <div />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#0e0f12]">
        <AppSidebar />
        <main className="flex-1 min-w-0 bg-[#0e0f12]">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
} 