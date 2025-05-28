import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { WhatsAppInstances } from '@/components/whatsapp/WhatsAppInstances';
import { AppLayout } from '@/components/AppSidebar';

export const metadata: Metadata = {
  title: 'WhatsApp Business | VUOM',
  description: 'Gerencie suas instâncias do WhatsApp Business',
};

export default async function WhatsAppPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <AppLayout>
      <div className="min-h-[100dvh] bg-gray-100 pt-4 pb-8 px-2">
        <div className="container mx-auto pl-1 sm:pl-2 md:pl-4 lg:pl-8 max-w-[99%] sm:max-w-[97%] md:max-w-[95%] lg:max-w-[92%]">
          {/* Título */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4">
            <div>
              <h1 className="text-lg sm:text-base md:text-lg font-bold text-gray-900 tracking-[-0.03em] font-inter">
                WhatsApp Business
              </h1>
              <p className="text-xs sm:text-xs md:text-xs text-gray-600 tracking-[-0.03em] font-inter">
                Gerencie suas instâncias e conecte-se com seus clientes
              </p>
            </div>
          </div>

          {/* WhatsApp Component */}
          <WhatsAppInstances />
        </div>
      </div>
    </AppLayout>
  );
} 