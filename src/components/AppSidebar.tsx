'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
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
    <Sidebar variant="inset" className="border-r border-white/[0.08] bg-[#0a0a0a] w-60">
      <SidebarHeader className="border-none bg-[#0a0a0a] h-14 flex items-center px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white text-sm font-semibold">X</div>
          <span className="text-sm text-white/70">XASE AI</span>
        </div>
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

      <SidebarFooter className="border-t border-white/[0.06] bg-[#0a0a0a] p-2">
        <div className="flex items-center justify-between px-2">
          <div className="truncate text-xs text-white/50 max-w-[180px]" title={(session?.user as any)?.email || 'account'}>
            {(session?.user as any)?.email || 'xppsalvador@gmail.com'}
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
      <div className="flex min-h-screen w-full bg-[#0a0a0a]">
        <AppSidebar />
        <main className="flex-1 min-w-0 bg-[#0a0a0a]">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
} 