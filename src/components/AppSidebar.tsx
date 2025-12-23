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
      { title: 'Trust Dashboard', url: '/xase/dashboard' },
      { title: 'Records', url: '/xase/records' },
      { title: 'Checkpoints', url: '/xase/checkpoints' },
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
    <Sidebar variant="inset" className="border-r border-white/[0.08] bg-[#1c1d20] w-60">
      <SidebarHeader className="border-none bg-[#1c1d20] h-14 flex items-center px-4">
        <BrandLogo />
      </SidebarHeader>

      <SidebarContent className="bg-transparent py-2">
        {menuItems.map((group) => (
          <SidebarGroup key={group.title} className="px-2 py-1">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname ? (pathname === item.url || pathname.startsWith(item.url + '/')) : false;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="h-9 w-full justify-start px-3 rounded-md text-sm transition-colors data-[active=true]:bg-white/[0.06] data-[active=true]:text-white hover:bg-white/[0.04] text-white/70"
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
 
      <SidebarFooter className="border-t border-white/[0.06] bg-[#1c1d20] p-2">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white/[0.08] text-white/80 flex items-center justify-center text-[10px] font-semibold">
              {initial}
            </div>
            <div className="text-xs text-white/80">
              {displayName}
            </div>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="h-8 w-8 flex items-center justify-center rounded-md text-white/60 hover:bg-white/[0.06] hover:text-white transition-all"
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4 stroke-[1.5]" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
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
      <div className="flex min-h-screen w-full bg-[#1c1d20]">
        <AppSidebar />
        <main className="flex-1 min-w-0 bg-[#1c1d20]">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
} 