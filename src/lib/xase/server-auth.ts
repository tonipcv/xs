/**
 * XASE CORE - Server-side Auth Helpers
 * 
 * Helpers para buscar API key do tenant logado em Server Components
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Busca API key ativa do tenant logado
 * Para usar em Server Components
 */
export async function getTenantApiKey(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return null;
    }

    // Buscar tenant pelo email do usuário
    const tenant = await prisma.tenant.findFirst({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!tenant) {
      return null;
    }

    // Buscar primeira API key ativa do tenant
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        tenantId: tenant.id,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
      select: { keyHash: true },
    });

    // NOTA: Retornamos null pois keyHash não pode ser revertido
    // Em produção, considere armazenar uma key de sistema separada
    // Por ora, vamos criar uma função alternativa que busca direto do DB
    return null;
  } catch (error) {
    console.error('Error getting tenant API key:', error);
    return null;
  }
}

/**
 * Busca tenant ID do usuário logado
 */
export async function getTenantId(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return null;
    }

    // 1) Garantir que o usuário exista; se não, criar com email da sessão
    const user = await prisma.user.upsert({
      where: { email: session.user.email },
      update: {},
      create: {
        email: session.user.email,
        name: session.user.name || null,
      },
      select: { id: true, tenantId: true, name: true },
    });

    if (user?.tenantId) {
      return user.tenantId;
    }

    // 2) Tentar achar Tenant por email (fallback legado)
    const existingTenant = await prisma.tenant.findFirst({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (existingTenant?.id) {
      // Vincular usuário ao tenant encontrado
      if (user?.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { tenantId: existingTenant.id },
        }).catch(() => {});
      }
      return existingTenant.id;
    }

    // 3) Criar Tenant e vincular o usuário
    const created = await prisma.tenant.create({
      data: {
        email: session.user.email,
        name: session.user.name || session.user.email.split('@')[0],
        companyName: null,
        status: 'ACTIVE',
        plan: 'enterprise',
      },
      select: { id: true },
    });

    await prisma.user.update({ where: { id: user.id }, data: { tenantId: created.id } }).catch(() => {});

    return created.id;
  } catch (error) {
    // Evitar passar objetos para instrumentação quando podem ser null/undefined
    console.warn('Error getting tenant ID');
    return null;
  }
}
