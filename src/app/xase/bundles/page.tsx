import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export default async function BundlesPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { tenantId: true },
  });

  if (!user?.tenantId) {
    redirect('/xase/ai-holder');
  }

  const bundles = await prisma.evidenceBundle.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Evidence Bundles</h1>
      
      <div className="grid gap-4">
        {bundles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No evidence bundles found
          </div>
        ) : (
          bundles.map((bundle) => (
            <div key={bundle.id} className="border rounded-lg p-4 hover:bg-accent">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{bundle.id}</h3>
                  <p className="text-sm text-muted-foreground">
                    Created: {new Date(bundle.createdAt).toLocaleString()}
                  </p>
                </div>
                <a
                  href={`/xase/bundles/${bundle.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  View Details
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
