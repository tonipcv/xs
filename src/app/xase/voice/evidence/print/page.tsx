// @ts-nocheck
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'
import Link from 'next/link'
import PrintButton from './PrintButton'

function formatDate(d: Date) {
  return new Date(d).toLocaleString()
}

export default async function EvidencePrintPage({ searchParams }: { searchParams: Promise<{ days?: string; datasetId?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const tenantId = await getTenantId()
  if (!tenantId) redirect('/login')

  const params = await searchParams
  const days = Math.max(1, Math.min(90, Number(params.days || '3')))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  let datasetFilterId: string | undefined
  if (params.datasetId) {
    const ds = await prisma.dataset.findFirst({ where: { datasetId: params.datasetId }, select: { id: true } })
    datasetFilterId = ds?.id
  }

  const logs = await prisma.voiceAccessLog.findMany({
    where: {
      clientTenantId: tenantId,
      timestamp: { gte: since },
      ...(datasetFilterId ? { datasetId: datasetFilterId } : {}),
    },
    orderBy: { timestamp: 'desc' },
    include: {
      dataset: { select: { datasetId: true, name: true, language: true, consentStatus: true, jurisdiction: true } },
      policy: { select: { policyId: true, usagePurpose: true, maxHours: true, hoursConsumed: true, expiresAt: true, pricePerHour: true, currency: true } },
    }
  })

  const title = 'Training Evidence Bundle'

  return (
    <html>
      <head>
        <title>{title}</title>
        <style>{`
          @media print {
            .no-print { display: none; }
            body { color: #000; }
            .card { box-shadow: none; border-color: #000; }
          }
          body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, 'Apple Color Emoji','Segoe UI Emoji'; background: #0e0f12; color: #e5e7eb; }
          .container { max-width: 900px; margin: 24px auto; padding: 0 16px; }
          .muted { color: #9ca3af; font-size: 12px; }
          .h1 { font-size: 28px; font-weight: 600; margin: 0 0 8px; }
          .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; margin: 16px 0; }
          .table { width: 100%; border-collapse: collapse; }
          .table th, .table td { text-align: left; font-size: 12px; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 6px; font-size: 10px; }
          .badge-ok { background: rgba(16,185,129,0.15); color: #34d399; }
          .badge-denied { background: rgba(239,68,68,0.15); color: #f87171; }
          .row { display:flex; gap:12px; }
          .row .col { flex:1; }
          .actions { display:flex; gap:8px; align-items:center; }
          .button { border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06); color: #fff; padding: 6px 10px; border-radius: 8px; text-decoration:none }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="actions no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <Link href="/xase/voice/client" className="button">← Back</Link>
            <PrintButton className="button" />
          </div>

          <div className="h1">{title}</div>
          <div className="muted">Window: last {days} day(s){searchParams.datasetId ? ` • Dataset: ${searchParams.datasetId}` : ''}</div>

          <div className="card">
            <div className="muted" style={{ marginBottom: 8 }}>Events</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Dataset</th>
                  <th>Policy</th>
                  <th>Purpose</th>
                  <th>Hours</th>
                  <th>Outcome</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDate(l.timestamp)}</td>
                    <td>{l.dataset?.name || l.dataset?.datasetId}</td>
                    <td>{l.policy?.policyId}</td>
                    <td>{l.policy?.usagePurpose}</td>
                    <td>{l.hoursAccessed.toFixed(2)}h</td>
                    <td>
                      <span className={`badge ${l.outcome === 'GRANTED' ? 'badge-ok' : 'badge-denied'}`}>{l.outcome}</span>
                    </td>
                    <td>{l.errorMessage || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="muted" style={{ marginBottom: 8 }}>Summary</div>
            <div className="row">
              <div className="col">
                <div className="muted">Generated at</div>
                <div>{formatDate(new Date())}</div>
              </div>
              <div className="col">
                <div className="muted">Events</div>
                <div>{logs.length}</div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
