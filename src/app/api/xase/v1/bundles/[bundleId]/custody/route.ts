/**
 * XASE CORE - Chain of Custody Report API
 * 
 * GET /api/xase/v1/bundles/:bundleId/custody
 * 
 * Gera relatório de cadeia de custódia para um bundle
 * Formato: JSON ou PDF (via query param ?format=pdf)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/xase/auth';
import { generateCustodyReport, formatCustodyReportAsText } from '@/lib/xase/custody';
import { logAudit } from '@/lib/xase/audit';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bundleId: string }> }
) {
  try {
    // 1. Validar API Key
    const auth = await validateApiKey(request);
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Extrair bundleId
    const { bundleId } = await context.params;

    // 3. Verificar formato solicitado
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    // 4. Gerar custody report
    const report = await generateCustodyReport(bundleId, {
      userId: undefined, // API Key auth doesn't have userId
    });

    // 5. Log audit
    await logAudit({
      tenantId: auth.tenantId,
      userId: undefined,
      action: 'CUSTODY_REPORT_GENERATED',
      resourceType: 'EVIDENCE_BUNDLE',
      resourceId: bundleId,
      metadata: JSON.stringify({
        format,
        eventCount: report.events.length,
        signatureCount: report.signatures.length,
        integrityStatus: report.integrityStatus,
      }),
      status: 'SUCCESS',
    });

    // 6. Retornar no formato solicitado
    if (format === 'pdf') {
      // TODO: Gerar PDF real (por enquanto retorna texto)
      const textReport = formatCustodyReportAsText(report);
      
      return new NextResponse(textReport, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="custody-report-${bundleId}.txt"`,
        },
      });
    }

    // Formato JSON (default)
    return NextResponse.json(report);
  } catch (error: any) {
    console.error('[Custody Report] Error:', error);

    if (error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Bundle not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
