import { PDFReportData } from './pdf-report'

export async function generateNarrativeFromEvidence(data: PDFReportData): Promise<string | null> {
  const rawKey = process.env.OPENAI_API_KEY
  const apiKey = typeof rawKey === 'string' && rawKey.trim().length > 0 ? rawKey.trim() : null
  if (!apiKey) {
    console.warn('[Narrative] OPENAI_API_KEY not set')
    return null
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const projectId = process.env.OPENAI_PROJECT_ID

  const system =
    'You are a neutral legal report writer. You produce concise, factual narratives from verified evidence data. Do not invent or infer. Do not restate hashes differently. Keep a professional, regulator-friendly tone.'

  const user = `Generate a short legal narrative for a compliance evidence report.
Rules:
- Do not add data that is not present.
- Do not change wording of hashes or IDs.
- Keep neutral tone.
- Limit to ~200-300 words.

Evidence (read-only JSON):\n${JSON.stringify(data, null, 2)}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Number(process.env.OPENAI_TIMEOUT_MS || 6000))
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(projectId ? { 'OpenAI-Project': projectId } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      let body = ''
      try { body = await res.text() } catch {}
      console.error('[Narrative] OpenAI API error', { status: res.status, body: body?.slice(0, 200) })
      return null
    }
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content === 'string' && content.trim()) return content.trim()
    return null
  } catch (e: any) {
    console.error('[Narrative] OpenAI request failed:', e?.message || String(e))
    return null
  }
}
