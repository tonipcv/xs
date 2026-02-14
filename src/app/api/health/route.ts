import { NextResponse } from 'next/server'

/**
 * GET /api/health
 * Health check endpoint para verificar se o servidor está rodando
 */
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'xase-voice-data-governance'
  })
}
