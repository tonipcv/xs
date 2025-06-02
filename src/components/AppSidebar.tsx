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
    <Sidebar variant="inset" className="border-r border-gray-200/50 bg-gradient-to-b from-gray-50 to-gray-100 shadow-[1px_0_5px_rgba(0,0,0,0.05)]">
      <SidebarHeader className="border-b border-gray-200/50 bg-white/20 backdrop-blur-sm">
        <div className="flex items-center justify-center px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 grayscale">
              <Image
                src="/logo.png"
                alt="Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <span className="text-sm font-medium text-gray-900 tracking-tight group-data-[collapsible=icon]:hidden">
              HTPS.io
            </span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="bg-transparent py-2">
        {menuItems.map((group) => (
          <SidebarGroup key={group.title} className="px-2 py-1">
            <SidebarGroupLabel className="text-[10px] font-semibold text-gray-600/70 uppercase tracking-wider px-2 mb-1">
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild
                      isActive={pathname ? (pathname === item.url || pathname.startsWith(item.url + '/')) : false}
                      className="h-7 px-2 rounded-md text-xs font-medium tracking-[-0.01em] transition-all duration-200 data-[active=true]:bg-white/90 data-[active=true]:text-gray-900 data-[active=true]:shadow-sm hover:bg-white/40 text-gray-700"
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
      
      <SidebarFooter className="border-t border-gray-200/50 bg-white/20 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="h-7 px-2 rounded-md text-xs font-medium tracking-[-0.01em] text-red-600 hover:bg-red-50/80 hover:text-red-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="flex min-h-screen w-full bg-gray-50">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex h-12 items-center gap-4 border-b border-gray-200/50 bg-gradient-to-r from-gray-50 to-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] px-4">
            <SidebarTrigger className="md:hidden" />
            
            {/* Logo no mobile */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="relative w-6 h-6 grayscale">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <span className="text-sm font-medium text-gray-900 tracking-tight">
                HTPS.io
              </span>
            </div>
            
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="hover:bg-white/40 h-8 w-8">
              <Settings className="h-4 w-4 text-gray-600" />
            </Button>
          </header>
          <div className="flex-1 p-4 bg-gray-50">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
} 