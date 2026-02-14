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
    title: 'AI HOLDER',
    items: [
      { title: 'Dashboard', url: '/xase/ai-holder', icon: Mic },
      { title: 'Datasets', url: '/xase/ai-holder/datasets', icon: Database },
      { title: 'Policies', url: '/xase/ai-holder/policies', icon: Shield },
      { title: 'Leases', url: '/xase/ai-holder/leases', icon: Key },
      { title: 'Audit Logs', url: '/xase/audit', icon: Activity },
      { title: 'Marketplace', url: '/xase/governed-access', icon: Database },
    ],
  },
  {
    title: 'PRIVACY & COMPLIANCE',
    items: [
      { title: 'Consent', url: '/xase/consent', icon: Lock },
      { title: 'Epsilon Budget', url: '/xase/privacy/epsilon', icon: Zap },
      { title: 'Compliance', url: '/xase/compliance', icon: FileCheck },
    ],
  },
  {
    title: 'OBSERVABILITY',
    items: [
      { title: 'Health', url: '/xase/health', icon: Heart },
      { title: 'Metrics', url: '/xase/metrics', icon: TrendingUp },
      { title: 'Dashboard', url: '/xase/observability', icon: Eye },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { title: 'API Keys', url: '/xase/admin/api-keys', icon: Key },
      { title: 'Settings', url: '/xase/settings', icon: Settings },
    ],
  },
];

const clientMenuItems = [
  {
    title: 'AI LAB',
    items: [
      { title: 'Dashboard', url: '/xase/ai-lab', icon: Cpu },
      { title: 'Marketplace', url: '/xase/governed-access', icon: Database },
      { title: 'Training', url: '/xase/ai-lab/training', icon: Cpu },
      { title: 'Billing', url: '/xase/ai-lab/billing', icon: Coins },
      { title: 'Audit Logs', url: '/xase/audit', icon: Activity },
    ],
  },
  {
    title: 'PRIVACY & COMPLIANCE',
    items: [
      { title: 'Consent', url: '/xase/consent', icon: Lock },
      { title: 'Epsilon Budget', url: '/xase/privacy/epsilon', icon: Zap },
      { title: 'Compliance', url: '/xase/compliance', icon: FileCheck },
    ],
  },
  {
    title: 'OBSERVABILITY',
    items: [
      { title: 'Health', url: '/xase/health', icon: Heart },
      { title: 'Metrics', url: '/xase/metrics', icon: TrendingUp },
      { title: 'Dashboard', url: '/xase/observability', icon: Eye },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { title: 'API Keys', url: '/xase/admin/api-keys', icon: Key },
      { title: 'Settings', url: '/xase/settings', icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [organizationType, setOrganizationType] = useState<string | null>(null);
  const { data: session } = useSession();
  const { setOpen } = useSidebar();

  useEffect(() => {
    async function fetchOrganizationType() {
      if (session?.user?.email) {
        try {
          const res = await fetch('/api/user/organization-type');
          if (res.ok) {
            const data = await res.json();
            setOrganizationType(data.organizationType);
          }
        } catch (error) {
          console.error('Failed to fetch organization type:', error);
        }
      }
    }
    fetchOrganizationType();
  }, [session]);

  const menuItems = organizationType === 'CLIENT' ? clientMenuItems : supplierMenuItems;

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
        {menuItems.map((group) => (
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
        ))}
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