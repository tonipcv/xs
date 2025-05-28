'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
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
import {
  Bot,
  MessageSquare,
  ShoppingCart,
  BookOpen,
  User,
  Settings,
  CreditCard,
  BarChart3,
  Users,
  Zap,
  Home,
  Menu,
  LogOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const menuItems = [
  {
    title: "WhatsApp",
    items: [
      {
        title: "Instâncias",
        url: "/whatsapp",
        icon: MessageSquare,
      },
    ],
  },
  {
    title: "IA",
    items: [
      {
        title: "Agente IA",
        url: "/ai-agent",
        icon: Bot,
      },
      {
        title: "Conhecimento",
        url: "/ai-agent/knowledge",
        icon: BookOpen,
      },
    ],
  },
  {
    title: "Configurações",
    items: [
      {
        title: "Perfil",
        url: "/profile",
        icon: User,
      },
      {
        title: "Planos",
        url: "/planos",
        icon: CreditCard,
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
    <Sidebar variant="inset" className="border-r border-gray-200/50 bg-gradient-to-b from-gray-100 to-gray-200/80 shadow-[1px_0_5px_rgba(0,0,0,0.05)]">
      <SidebarHeader className="border-b border-gray-200/50 bg-white/10">
        <div className="flex items-center justify-center px-3 py-2">
          <div className="relative w-6 h-6">
            <Image
              src="/logo.png"
              alt="Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="bg-transparent py-2">
        {menuItems.map((group) => (
          <SidebarGroup key={group.title} className="px-2 py-1">
            <SidebarGroupLabel className="text-[10px] font-semibold text-[#2d5568]/70 uppercase tracking-wider px-2 mb-1">
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild
                      isActive={pathname ? (pathname === item.url || pathname.startsWith(item.url + '/')) : false}
                      className="h-7 px-2 rounded-md text-xs font-medium tracking-[-0.01em] font-inter transition-all duration-200 data-[active=true]:bg-white/90 data-[active=true]:text-[#2d5568] data-[active=true]:shadow-sm hover:bg-white/20 text-[#2d5568]/90"
                    >
                      <Link href={item.url} className="flex items-center gap-2">
                        <item.icon className="h-3.5 w-3.5 stroke-[1.5] flex-shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      
      <SidebarFooter className="border-t border-gray-200/50 bg-white/10 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="h-7 px-2 rounded-md text-xs font-medium tracking-[-0.01em] font-inter text-red-600 hover:bg-red-50/80 hover:text-red-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <div className="flex items-center gap-2 w-full">
                <LogOut className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
      <div className="flex min-h-screen w-full bg-gray-100">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex h-10 items-center gap-4 border-b border-gray-200/50 bg-gradient-to-r from-gray-100 to-gray-200/80 shadow-[0_1px_5px_rgba(0,0,0,0.05)] px-4">
            <SidebarTrigger />
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="hover:bg-white/20 h-7 w-7">
              <Settings className="h-3.5 w-3.5 text-[#2d5568]" />
            </Button>
          </header>
          <div className="flex-1 p-3 bg-gray-100">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
} 