import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/v1/webhooks/upload-complete
 * Webhook chamado após upload ser concluído
 * Dispara processamento automático do arquivo
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { datasetId, fileKey, apiKey } = body

    if (!datasetId || !fileKey || !apiKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Chamar API de processamento
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const processResponse = await fetch(`${baseUrl}/api/v1/datasets/${datasetId}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ fileKey }),
    })

    if (!processResponse.ok) {
      const error = await processResponse.json()
      console.error('[Webhook] Processing failed:', error)
      return NextResponse.json({ error: 'Processing failed', details: error }, { status: 500 })
    }

    const result = await processResponse.json()
    return NextResponse.json({ success: true, processed: result.processed })
  } catch (err: any) {
    console.error('[Webhook] upload-complete error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
