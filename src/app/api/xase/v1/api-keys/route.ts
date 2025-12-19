/**
 * XASE CORE - API Keys Management
 * 
 * GET  /api/xase/v1/api-keys - Listar API keys do tenant
 * POST /api/xase/v1/api-keys - Criar nova API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/xase/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * GET - Listar API Keys
 */
export async function GET(request: NextRequest) {
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

    // 2. Buscar API keys (sem expor keyHash)
    const keys = await prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        isActive: true,
        rateLimit: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ keys });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * POST - Criar Nova API Key
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validar API Key (admin)
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: auth.error, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const tenantId = auth.tenantId!;

    // 2. Parse body
    const body = await request.json();
    const { name, permissions, rateLimit } = body;

    // 3. Validar input
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    // 4. Gerar API key segura
    const apiKeyValue = `xase_pk_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = await bcrypt.hash(apiKeyValue, 10);
    const keyPrefix = apiKeyValue.substring(0, 12);

    // 5. Criar API key
    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId,
        name,
        keyHash,
        keyPrefix,
        permissions: permissions || 'ingest,verify',
        isActive: true,
        rateLimit: rateLimit || 1000,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        isActive: true,
        rateLimit: true,
        createdAt: true,
      },
    });

    // 6. Log audit
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'KEY_CREATED',
        resourceType: 'API_KEY',
        resourceId: apiKey.id,
        metadata: JSON.stringify({ name, permissions }),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        status: 'SUCCESS',
      },
    }).catch(console.error);

    // 7. Retornar key completa (APENAS UMA VEZ)
    return NextResponse.json({
      key: apiKeyValue, // ATENÇÃO: Exibir apenas uma vez
      ...apiKey,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
