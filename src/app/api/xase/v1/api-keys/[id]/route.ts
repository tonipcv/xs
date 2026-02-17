/**
 * XASE CORE - API Key Management (Individual)
 * 
 * DELETE /api/xase/v1/api-keys/:id - Desativar API key
 */

import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/xase/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * DELETE - Desativar API Key (soft delete)
 */
export async function DELETE(
  request: Request,
  { params }: any
) {
  try {
    // 1. Validar API Key
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: auth.error, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const tenantId = auth.tenantId!;
    const keyId = params.id;

    // 2. Verificar se key existe e pertence ao tenant
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        tenantId,
      },
    });

    if (!existingKey) {
      return NextResponse.json(
        { error: 'API key not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // 3. Desativar key (soft delete)
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    // 4. Log audit
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'KEY_DELETED',
        resourceType: 'API_KEY',
        resourceId: keyId,
        metadata: JSON.stringify({ name: existingKey.name }),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        status: 'SUCCESS',
      },
    }).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
