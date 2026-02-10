'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import BrandLogo from '@/components/BrandLogo'

export default function PreviewPage() {
  const params = useParams()
  const bundleId = params?.bundleId as string
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [generating, setGenerating] = useState(false)
  const [downloadingZip, setDownloadingZip] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/xase/bundles/${bundleId}/preview`)
        if (!res.ok) throw new Error('Failed to load preview')
        const json = await res.json()
        setData(json)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [bundleId])

  const handleGeneratePdf = async () => {
    setGenerating(true)
    setError(null)
    try {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('x-csrf-token='))?.split('=')[1]
      const res = await fetch(`/api/xase/bundles/${bundleId}/pdf`, {
        method: 'POST',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to generate PDF')
      }
      window.location.reload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleDownloadZip = async () => {
    setDownloadingZip(true)
    setError(null)
    try {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('x-csrf-token='))?.split('=')[1]
      const dl = await fetch(`/api/xase/bundles/${bundleId}/download`, {
        method: 'POST',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      })
      if (!dl.ok) {
        const derr = await dl.json().catch(() => ({}))
        throw new Error(derr.error || `Download failed (${dl.status})`)
      }
      const blob = await dl.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `evidence-bundle-${bundleId}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDownloadingZip(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0f12] flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <BrandLogo showText={false} />
          </div>
          <div className="mx-auto w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="text-white/70 text-sm mt-4">Preparing report preview…</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0e0f12] flex items-center justify-center">
        <p className="text-white/70 text-sm">{error || 'Failed to load'}</p>
      </div>
    )
  }

  const { bundle, reportData, narrative, pdfPresignedUrl } = data

  const renderMarkdown = (text: string) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let html = esc(text)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\*(.+?)\*/g, '<strong>$1</strong>')
    html = html.replace(/\n/g, '<br/>')
    return html
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-white/90 mb-2">{title}</h2>
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-sm text-white/80">
        {children}
      </div>
    </div>
  )

  const Row = ({ k, v }: { k: string; v?: string | null }) => (
    <div className="flex items-start justify-between py-1 border-b border-white/[0.04] last:border-b-0">
      <span className="text-white/50 mr-6 min-w-[180px]">{k}</span>
      <span className="flex-1 text-white/80 break-all">{v || 'N/A'}</span>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0e0f12]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white/90">Compliance Evidence Report (Preview)</h1>
          <p className="text-xs text-white/50 mt-1">Bundle {bundle.bundleId}</p>
        </div>

        <Section title="Identification">
          <Row k="Tenant" v={bundle.tenant?.companyName || bundle.tenantId} />
          <Row k="Generated (UTC)" v={reportData.generatedAt} />
          <Row k="Claim Number" v={reportData.claimNumber} />
          <Row k="Policy Number" v={reportData.policyNumber} />
          <Row k="Regulatory Case ID" v={reportData.caseId} />
        </Section>

        <Section title="Timeline">
          <Row k="Created At" v={bundle.createdAt} />
          <Row k="Decision Timestamp" v={reportData.decisionTimestamp} />
        </Section>

        <Section title="Cryptographic Hashes">
          <Row k="Record Hash" v={reportData.recordHash !== 'N/A' ? reportData.recordHash : undefined} />
          <Row k="Input Hash" v={reportData.inputHash !== 'N/A' ? reportData.inputHash : undefined} />
          <Row k="Output Hash" v={reportData.outputHash !== 'N/A' ? reportData.outputHash : undefined} />
          <Row k="Manifest Hash" v={bundle.bundleManifestHash} />
          <Row k="Bundle Hash" v={bundle.bundleHash} />
        </Section>

        <Section title="Chain of Custody (summary)">
          <Row k="Access Events" v={String(reportData.accessEventCount || 0)} />
          <Row k="Export Events" v={String(reportData.exportEventCount || 0)} />
          <Row k="Disclosure Events" v={String(reportData.disclosureEventCount || 0)} />
        </Section>

        <Section title="Verification">
          <pre className="text-xs text-white/70 whitespace-pre-wrap">{reportData.verificationInstructions}</pre>
        </Section>

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-white/90 mb-1">Narrative Representation</h2>
          <p className="text-[11px] text-white/40 mb-2">AI-assisted, non-authoritative; evidence remains the source of truth.</p>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-sm text-white/80">
            {narrative ? (
              <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(narrative) }} />
            ) : (
              <p className="text-white/60 text-sm">AI narrative disabled (no OPENAI_API_KEY found) or generation unavailable.</p>
            )}
          </div>
        </div>

        {bundle.pdfReportUrl ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white/90 mb-2">Downloads</h2>
            <div className="flex gap-2 flex-wrap">
              <a href={pdfPresignedUrl || bundle.pdfReportUrl} download className="px-4 py-2 bg-white text-black text-sm rounded-md font-medium hover:bg-white/90 transition-colors">Download PDF</a>
              <button onClick={handleDownloadZip} disabled={downloadingZip} className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {downloadingZip ? 'Preparing ZIP…' : 'Download Evidence Bundle (ZIP)'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6 text-center">
              <p className="text-sm text-white/70 mb-4">PDF report not generated yet.</p>
              {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={handleGeneratePdf}
                  disabled={generating}
                  className="px-4 py-2 bg-white text-black text-sm rounded-md font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? 'Generating...' : 'Generate PDF Report'}
                </button>
                <button onClick={handleDownloadZip} disabled={downloadingZip} className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {downloadingZip ? 'Preparing ZIP…' : 'Download Evidence Bundle (ZIP)'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
