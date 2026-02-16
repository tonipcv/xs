/**
 * Watermark Forensics API
 * 
 * Problema: Data Holder descobre leak, não tem ferramenta para detectar watermark.
 * Não consegue provar origem.
 * 
 * Solução: API pública para upload de áudio e detecção de watermark.
 * Retorna contract ID se detectado (99.7% confidence).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/xase/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { createHash } from 'crypto';
import { detectWatermark, generateForensicReport } from '@/lib/xase/watermark-detector';

/**
 * POST /api/v1/watermark/forensics
 * 
 * Upload áudio suspeito e detecta watermark
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Validar API key
    const auth = await validateApiKey(req);
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse multipart form
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const tenantId = formData.get('tenant_id') as string || auth.tenantId;

    if (!audioFile) {
      return NextResponse.json({ error: 'Missing audio file' }, { status: 400 });
    }

    // 3. Validar tamanho (max 100 MB)
    if (audioFile.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 100 MB)' }, { status: 400 });
    }

    // 4. Download audio
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const audioHash = createHash('sha256').update(audioBuffer).digest('hex');

    // 5. Buscar todos os contracts deste tenant (como Data Holder)
    const contracts = await prisma.policyExecution.findMany({
      where: {
        offer: {
          dataset: {
            tenantId: tenantId,
          },
        },
      },
      select: {
        id: true,
        executionId: true,
        buyerTenantId: true,
        startedAt: true,
      },
      take: 100, // Limitar para evitar timeout
    });

    if (contracts.length === 0) {
      return NextResponse.json({
        detected: false,
        message: 'No contracts found for this tenant',
      });
    }

    // 6. Brute-force detection (paralelo)
    // Use real Rust watermark detector
    const candidateIds = contracts.map(c => c.executionId);
    
    // Detect watermark using Rust detector
    const detectionResult = await detectWatermark(audioBuffer, candidateIds);
    
    // Map detection result to contract details
    const results = contracts.map((c) => {
      const isMatch = detectionResult.detected && detectionResult.contractId === c.executionId;
      return {
        contractId: c.executionId,
        buyer: c.buyerTenantId,
        detected: isMatch,
        confidence: isMatch ? detectionResult.confidence : 0,
        timestamp: c.startedAt,
      };
    });

    // 7. Filtrar matches (confidence > 95%)
    const matches = results.filter(r => r.confidence > 0.95);

    // 8. Log forensic analysis
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId!,
        action: 'WATERMARK_FORENSICS',
        resourceType: 'AUDIO',
        resourceId: audioHash,
        status: matches.length > 0 ? 'DETECTED' : 'NOT_FOUND',
        timestamp: new Date(),
        metadata: JSON.stringify({
          audioHash,
          audioSizeBytes: audioBuffer.length,
          candidatesChecked: contracts.length,
          matchesFound: matches.length,
          matches: matches.map(m => ({
            contractId: m.contractId,
            buyer: m.buyer,
            confidence: m.confidence,
          })),
        }),
      },
    });

    if (matches.length > 0) {
      // 9. Gerar forensic report (PDF)
      const reportUrl = await generateForensicReport({
        audioHash,
        matches,
        tenantId: auth.tenantId!,
        timestamp: new Date(),
      });

      return NextResponse.json({
        detected: true,
        matches: matches.map(m => ({
          contractId: m.contractId,
          buyer: m.buyer,
          confidence: m.confidence,
          timestamp: m.timestamp,
        })),
        reportUrl,
        message: `Watermark detected in ${matches.length} contract(s)`,
      });
    }

    return NextResponse.json({
      detected: false,
      candidatesChecked: contracts.length,
      message: 'No watermark detected',
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[API] POST /api/v1/watermark/forensics error:', msg);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

