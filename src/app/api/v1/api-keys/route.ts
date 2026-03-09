import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiKey } from '@/lib/xase/auth';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// POST /api/v1/api-keys - Create API key
export async function POST(req: NextRequest) {
  try {
    // Get auth token from header or session
    const authHeader = req.headers.get('Authorization') || '';
    const apiKeyHeader = req.headers.get('X-API-Key') || req.headers.get('x-api-key') || '';
    
    let tenantId: string | null = null;
    
    // Try API key auth first
    if (apiKeyHeader) {
      const auth = await validateApiKey(apiKeyHeader);
      if (auth.valid && auth.tenantId) {
        tenantId = auth.tenantId;
      }
    }
    
    // Try JWT auth
    if (!tenantId && authHeader) {
      const token = authHeader.replace('Bearer ', '');
      try {
        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || 'fallback-secret') as any;
        tenantId = decoded.tenantId;
      } catch {
        // Invalid token
      }
    }
    
    // If still no tenantId, check if this is the first API key for the tenant
    if (!tenantId) {
      const body = await req.json().catch(() => ({}));
      const providedTenantId = body.tenantId;
      
      // Allow creation if tenantId is provided and no API keys exist for that tenant
      if (providedTenantId) {
        const existingKeys = await prisma.apiKey.count({
          where: { tenantId: providedTenantId }
        });
        
        if (existingKeys === 0) {
          tenantId = providedTenantId;
        }
      }
    }
    
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json().catch(() => ({}));
    const { name = 'API Key', permissions = 'read,write' } = body;
    
    // Generate API key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = `xase_${rawKey.substring(0, 8)}`;
    
    // Create in database
    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        tenantId,
        keyHash,
        keyPrefix,
        isActive: true,
        permissions,
      },
    });
    
    // Return full key only once
    return NextResponse.json({
      id: apiKey.id,
      name: apiKey.name,
      key: `${keyPrefix}_${rawKey}`,
      keyPrefix,
      permissions: apiKey.permissions,
      createdAt: apiKey.createdAt,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
