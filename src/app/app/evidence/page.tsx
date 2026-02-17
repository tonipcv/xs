import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
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
    redirect('/login');
  }

  // Evidence bundles feature not yet implemented in schema
  const bundles: any[] = [];

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Evidence Bundles</h1>
      <div className="space-y-4">
        {bundles.length === 0 ? (
          <div className="border rounded-lg p-8 text-center">
            <p className="text-muted-foreground mb-2">No evidence bundles found.</p>
            <p className="text-sm text-muted-foreground">Evidence bundle functionality is coming soon.</p>
          </div>
        ) : (
          bundles.map((bundle: any) => (
            <div key={bundle.id} className="border rounded-lg p-4 hover:bg-accent">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{bundle.id}</h3>
                  <p className="text-sm text-muted-foreground">
                    Created: {new Date(bundle.createdAt).toLocaleString()}
                  </p>
                </div>
                <a
                  href={`/app/evidence`}
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
