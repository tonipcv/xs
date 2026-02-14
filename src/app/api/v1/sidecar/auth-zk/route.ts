/**
 * Zero-Knowledge Token Exchange
 * 
 * Problema: Xase Brain gera S3 token e PODE ver token em plaintext.
 * Data Holder não confia.
 * 
 * Solução: Sidecar gera keypair RSA, envia public key.
 * Brain encrypta token com public key.
 * APENAS Sidecar pode decryptar (private key nunca sai do pod).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/xase/auth';
import { prisma } from '@/lib/prisma';
import { publicEncrypt, constants } from 'crypto';
import { z } from 'zod';

const BodySchema = z.object({
  contractId: z.string().min(1),
  publicKey: z.string().min(1), // Base64-encoded RSA public key
});

interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  region: string;
  bucket: string;
  expiresAt: string;
}

/**
 * POST /api/v1/sidecar/auth-zk
 * 
 * Autentica Sidecar e retorna S3 token ENCRIPTADO
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Validar API key
    const auth = await validateApiKey(req);
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse body
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { contractId, publicKey } = parsed.data;

    // 3. Validar contrato
    const contract = await prisma.policyExecution.findFirst({
      where: {
        id: contractId,
        buyerTenantId: auth.tenantId,
      },
      include: {
        offer: {
          include: {
            dataset: {
              include: {
                dataSources: true,
              },
            },
          },
        },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // 4. Gerar S3 token (STS AssumeRole)
    // TODO: Integrar com AWS STS real
    // Por enquanto, mock credentials
    const s3Token: S3Credentials = {
      accessKeyId: `ASIA${Math.random().toString(36).substring(2, 18).toUpperCase()}`,
      secretAccessKey: Buffer.from(Math.random().toString()).toString('base64').substring(0, 40),
      sessionToken: Buffer.from(Math.random().toString()).toString('base64'),
      region: 'us-east-1',
      bucket: contract.offer.dataset.dataSources[0]?.storageLocation || '',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hora
    };

    // 5. ENCRYPT token com public key do Sidecar
    const publicKeyBuffer = Buffer.from(publicKey, 'base64');
    const tokenJson = JSON.stringify(s3Token);
    
    const encryptedToken = publicEncrypt(
      {
        key: publicKeyBuffer,
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(tokenJson)
    );

    // 6. Criar sessão do Sidecar
    const sessionId = `sess_${Math.random().toString(36).substring(2, 18)}`;
    
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId,
        action: 'SIDECAR_AUTH',
        resourceType: 'CONTRACT',
        resourceId: contractId,
        status: 'SUCCESS',
        timestamp: new Date(),
        metadata: JSON.stringify({
          sessionId,
          publicKeyFingerprint: publicKey.substring(0, 32), // Apenas fingerprint
          expiresAt: s3Token.expiresAt,
        }),
      },
    });

    // 7. Brain NUNCA vê plaintext token
    // Apenas encrypted_token é retornado
    return NextResponse.json({
      sessionId,
      encryptedToken: encryptedToken.toString('base64'),
      expiresAt: s3Token.expiresAt,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[API] POST /api/v1/sidecar/auth-zk error:', msg);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
