import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/AppSidebar';
import XaseUsageBanner from '@/components/XaseUsageBanner';
import { getTenantId } from '@/lib/xase/server-auth';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Xase',
  description: 'Immutable ledger for AI decisions',
};

export default async function XaseDashboard({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Buscar tenant ID
  const tenantId = await getTenantId();
  
  // Buscar stats reais
  let totalRecords = 0;
  let totalCheckpoints = 0;
  let totalExports = 0;
  let lastCheckpoint: Date | null = null;
  let integrityStatus = 'Pending';

  if (tenantId) {
    [totalRecords, totalCheckpoints, totalExports] = await Promise.all([
      prisma.decisionRecord.count({ where: { tenantId } }),
      prisma.checkpointRecord.count({ where: { tenantId } }),
      prisma.auditLog.count({
        where: { tenantId, action: 'EXPORT_CREATED' },
      }),
    ]);

    const lastCp = await prisma.checkpointRecord.findFirst({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true, isVerified: true },
    });

    lastCheckpoint = lastCp?.timestamp || null;
    integrityStatus = lastCp?.isVerified ? 'Verified' : 'Pending';
  }

  const stats = [
    {
      label: 'RECORDS',
      value: totalRecords.toString(),
      change: null,
    },
    {
      label: 'CHECKPOINTS',
      value: totalCheckpoints.toString(),
      change: null,
    },
    {
      label: 'EXPORTS',
      value: totalExports.toString(),
      change: null,
    },
    {
      label: 'INTEGRITY',
      value: totalRecords > 0 ? '100%' : 'N/A',
      change: integrityStatus,
    },
  ];

  // Minimal time-series range (controlled by ?range=7|30|90)
  const params = searchParams ? await searchParams : undefined;
  const rangeParam = Number(params?.range || '30');
  const lookbackDays = [7, 30, 90].includes(rangeParam) ? rangeParam : 30;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - (lookbackDays - 1));

  // Build an array of ISO date keys for each day in range
  const dayKeys = Array.from({ length: lookbackDays }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // Fetch timestamps then bucket counts per day
  let decisionSeries: number[] = Array(lookbackDays).fill(0);
  let checkpointSeries: number[] = Array(lookbackDays).fill(0);

  if (tenantId) {
    const [decisionTs, checkpointTs] = await Promise.all([
      prisma.decisionRecord.findMany({
        where: { tenantId, timestamp: { gte: start } },
        select: { timestamp: true },
      }),
      prisma.checkpointRecord.findMany({
        where: { tenantId, timestamp: { gte: start } },
        select: { timestamp: true },
      }),
    ]);

    const bucket = (list: { timestamp: Date }[]) => {
      const m = new Map<string, number>();
      for (const { timestamp } of list) {
        const d = new Date(timestamp);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const key = `${yyyy}-${mm}-${dd}`;
        m.set(key, (m.get(key) || 0) + 1);
      }
      return dayKeys.map((k) => m.get(k) || 0);
    };

    decisionSeries = bucket(decisionTs);
    checkpointSeries = bucket(checkpointTs);
  }

  // Prepare sparkline points with axis margins to avoid overlap
  const buildPoints = (
    series: number[],
    width = 280,
    height = 60,
    paddingX = 6,
    paddingTop = 6,
    axisBottom = 18
  ) => {
    const n = series.length;
    const max = Math.max(1, ...series);
    const usableH = Math.max(1, height - paddingTop - axisBottom);
    const stepX = (width - paddingX * 2) / Math.max(1, n - 1);
    return series
      .map((v, i) => {
        const x = paddingX + i * stepX;
        const y = paddingTop + (1 - v / max) * usableH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const sparkWidth = 1200;
  const sparkHeight = 360;
  const paddingX = 14;
  const paddingTop = 16;
  const axisBottom = 40;
  const decisionPoints = buildPoints(
    decisionSeries,
    sparkWidth,
    sparkHeight,
    paddingX,
    paddingTop,
    axisBottom
  );
  const checkpointPoints = buildPoints(
    checkpointSeries,
    sparkWidth,
    sparkHeight,
    paddingX,
    paddingTop,
    axisBottom
  );

  // Dynamic tick density by range
  const nDays = dayKeys.length;
  const stepX = (sparkWidth - paddingX * 2) / Math.max(1, nDays - 1);
  const tickEvery = lookbackDays <= 14 ? 2 : lookbackDays <= 30 ? 3 : 5;
  const axisStartX = paddingX;
  const axisEndX = paddingX + (nDays - 1) * stepX;
  const ticks = dayKeys
    .map((k, i) => ({
      i,
      x: paddingX + i * stepX,
      label: `${k.slice(5, 7)}/${k.slice(8, 10)}`,
    }))
    .filter((t) => t.i % tickEvery === 0 || t.i === nDays - 1);

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#121316]">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header + minimal usage (top-right) */}
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard</h1>
              <p className="text-sm text-gray-400">Overview of your evidence ledger</p>
            </div>
            <div className="w-full flex justify-end">
              <div className="w-full max-w-sm">
                <XaseUsageBanner />
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6"
              >
                <div className="space-y-3">
                  <p className="text-[10px] font-medium text-white/40 tracking-wider">
                    {stat.label}
                  </p>
                  <p className="text-4xl font-semibold text-white tracking-tight">
                    {stat.value}
                  </p>
                  {stat.change && (
                    <p className="text-xs text-white/50">
                      {stat.change}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Minimalist Activity Chart */}
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-medium text-white/50">Activity ({lookbackDays}d)</h2>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1 text-white/60">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400/80"></span>
                    <span>Records</span>
                  </div>
                  <div className="flex items-center gap-1 text-white/60">
                    <span className="inline-block w-2 h-2 rounded-full bg-sky-400/80"></span>
                    <span>Checkpoints</span>
                  </div>
                  {/* Range toggle */}
                  <div className="ml-3 hidden md:flex items-center gap-1">
                    {([7, 30, 90] as const).map((r) => (
                      <a
                        key={r}
                        href={`/xase?range=${r}`}
                        className={`px-2 py-1 rounded border text-[11px] transition-colors ${
                          r === lookbackDays
                            ? 'border-white/30 text-white bg-white/5'
                            : 'border-white/10 text-white/60 hover:text-white/80 hover:border-white/20'
                        }`}
                      >
                        {r}d
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="w-full overflow-visible">
                <svg width={sparkWidth} height={sparkHeight} viewBox={`0 0 ${sparkWidth} ${sparkHeight}`} className="w-full h-[360px] md:h-[420px]">
                  <defs>
                    <linearGradient id="gradRecords" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="gradCps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Grid: horizontal guides */}
                  {Array.from({ length: 5 }).map((_, idx) => {
                    const y = paddingTop + ((idx + 1) / 6) * (sparkHeight - paddingTop - axisBottom);
                    return <line key={`gh-${idx}`} x1={paddingX} y1={y} x2={paddingX + (nDays - 1) * stepX} y2={y} stroke="#ffffff10" />;
                  })}
                  {/* Grid: vertical guides */}
                  {ticks.map((t, idx) => (
                    <line
                      key={`g-${idx}`}
                      x1={t.x}
                      y1={paddingTop}
                      x2={t.x}
                      y2={sparkHeight - axisBottom}
                      stroke="#ffffff10"
                    />
                  ))}
                  {/* Baseline axis */}
                  <line x1={axisStartX} y1={sparkHeight - axisBottom} x2={axisEndX} y2={sparkHeight - axisBottom} stroke="#ffffff22" />
                  {/* X-axis ticks */}
                  {ticks.map((t, idx) => (
                    <g key={idx}>
                      <line x1={t.x} y1={sparkHeight - axisBottom + 2} x2={t.x} y2={sparkHeight - axisBottom + 6} stroke="#ffffff33" />
                    </g>
                  ))}
                  {/* Records area */}
                  <polyline
                    points={`${axisStartX},${sparkHeight - axisBottom} ${decisionPoints} ${axisEndX},${sparkHeight - axisBottom}`}
                    fill="url(#gradRecords)"
                    stroke="none"
                  />
                  {/* Records line */}
                  <polyline points={decisionPoints} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  {/* Checkpoints line */}
                  <polyline points={checkpointPoints} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
                  {/* Tick labels */}
                  {ticks.map((t, idx) => {
                    const isFirst = t.i === 0;
                    const isLast = t.i === nDays - 1;
                    const x = isFirst ? axisStartX + 4 : isLast ? axisEndX - 4 : t.x;
                    const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
                    return (
                      <text key={idx} x={x} y={sparkHeight - 10} fontSize="12" textAnchor={anchor as any} fill="#c0c4ca">{t.label}</text>
                    );
                  })}
                </svg>
              </div>
              
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-white/50">
              Quick actions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <a
                href="/xase/records"
                className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
              >
                <p className="text-sm font-medium text-white">View records</p>
                <p className="text-xs text-white/40">Browse decision ledger</p>
              </a>

              <a
                href="/xase/checkpoints"
                className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
              >
                <p className="text-sm font-medium text-white">Checkpoints</p>
                <p className="text-xs text-white/40">KMS integrity anchors</p>
              </a>

              <a
                href="/xase/audit"
                className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
              >
                <p className="text-sm font-medium text-white">Audit trail</p>
                <p className="text-xs text-white/40">Immutable action log</p>
              </a>
            </div>
          </div>

          {/* System Status */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white/50">
                System status
              </h2>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                <span className="text-xs text-white/50">Operational</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <span className="text-xs text-white/40">Hash chain</span>
                <span className="text-sm text-white">Verified</span>
              </div>
              <div className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <span className="text-xs text-white/40">Last checkpoint</span>
                <span className="text-sm text-white">
                  {lastCheckpoint
                    ? new Date(lastCheckpoint).toLocaleString('en-US', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Never'}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <span className="text-xs text-white/40">API</span>
                <span className="text-sm text-white">Online</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
