'use client';

import { useState } from 'react';
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
} from '@/components/ui/sidebar';
import { Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const menuItems = [
  {
    title: 'XASE AI',
    items: [
      { title: 'Dashboard', url: '/xase' },
      { title: 'Records', url: '/xase/records' },
      { title: 'Evidence Bundles', url: '/xase/bundles' },
      { title: 'Audit Log', url: '/xase/audit' },
      { title: 'API Keys', url: '/xase/api-keys' },
      { title: 'Docs', url: '/xase/docs' },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { data: session } = useSession();

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
    <Sidebar variant="inset" className="border-r border-white/[0.08] bg-[#121316] w-60">
      <SidebarHeader className="border-none bg-[#121316] h-14 flex items-center px-4">
        <BrandLogo />
      </SidebarHeader>

      <SidebarContent className="bg-transparent py-2">
        {menuItems.map((group) => (
          <SidebarGroup key={group.title} className="px-2 py-1">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {group.items.map((item) => {
                  const isRoot = item.url === '/xase';
                  const active = pathname
                    ? (isRoot ? pathname === '/xase' : (pathname === item.url || pathname.startsWith(item.url + '/')))
                    : false;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="h-8 w-full justify-start px-2 rounded-md text-[13px] transition-colors border border-transparent data-[active=true]:border-white/[0.12] data-[active=true]:bg-white/[0.03] data-[active=true]:text-white hover:bg-white/[0.02] text-white/60"
                      >
                        <Link href={item.url}>{item.title}</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
 
      <SidebarFooter className="border-t border-white/[0.06] bg-[#121316] p-2">
        <div className="flex items-center justify-between px-2">
          <Link href="/profile" className="flex items-center gap-2 hover:opacity-90">
            <div className="w-6 h-6 rounded-md bg-[#2a2d33] bg-gradient-to-br from-white/10 to-white/[0.02] text-white/80 flex items-center justify-center text-[10px] font-semibold border border-white/10">
              {initial}
            </div>
            <div className="text-xs text-white/80">
              {displayName}
            </div>
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
      <div className="flex min-h-screen w-full bg-[#121316]">
        <AppSidebar />
        <main className="flex-1 min-w-0 bg-[#121316]">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
} 