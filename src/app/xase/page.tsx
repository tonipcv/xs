import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';


export default async function XaseHomepage() {
  const context = await requireAuth();
  const tenantId = context.tenantId;

  if (!tenantId) {
    redirect('/login');
  }

  // Get organization type
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { organizationType: true },
  });

  // Redirect based on organization type
  if (tenant?.organizationType === 'CLIENT') {
    redirect('/xase/training');
  } else {
    redirect('/xase/voice');
  }
}
