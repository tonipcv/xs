import { prisma } from '@/lib/prisma'

export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'

export interface EnqueueOptions {
  dedupeKey?: string | null
  runAt?: Date
  maxAttempts?: number
}

export async function enqueueJob(
  type: string,
  payload: Record<string, any>,
  opts: EnqueueOptions = {}
): Promise<{ id: string; inserted: boolean }>{
  const dedupeKey = opts.dedupeKey ?? null
  const runAt = opts.runAt ?? new Date()
  const maxAttempts = opts.maxAttempts ?? 5

  // Idempotent insert by dedupe_key
  const result = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO xase_jobs (type, payload, run_at, max_attempts, dedupe_key)
     VALUES ($1, $2::jsonb, $3, $4, $5)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    type,
    JSON.stringify(payload),
    runAt,
    maxAttempts,
    dedupeKey
  )

  return { id: result?.[0]?.id ?? dedupeKey ?? '', inserted: (result?.length ?? 0) > 0 }
}

export async function claimNextJob(type?: string) {
  // Use a transaction; claim with SKIP LOCKED
  return prisma.$transaction(async (tx) => {
    const jobs = await tx.$queryRawUnsafe<any[]>(
      `SELECT id FROM xase_jobs
       WHERE status = 'PENDING'
         ${type ? `AND type = '${type.replace(/'/g, "''")}'` : ''}
         AND run_at <= NOW()
       ORDER BY run_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    )
    if (jobs.length === 0) return null

    const jobId = jobs[0].id as string
    const [job] = await Promise.all([
      tx.$queryRawUnsafe<any[]>(`UPDATE xase_jobs SET status='RUNNING', updated_at = NOW() WHERE id = $1 RETURNING *`, jobId),
    ])
    return job?.[0] ?? null
  })
}

export async function markJobDone(id: string) {
  await prisma.$executeRawUnsafe(`UPDATE xase_jobs SET status='DONE', updated_at = NOW() WHERE id = $1`, id)
}

export async function rescheduleJob(id: string, attempts: number, lastError: string) {
  const nextDelayMinutes = Math.pow(3, attempts) // 1,3,9,27...
  await prisma.$executeRawUnsafe(
    `UPDATE xase_jobs
     SET status='PENDING', attempts = attempts + 1, last_error = $2,
         run_at = NOW() + MAKE_INTERVAL(mins := $3), updated_at = NOW()
     WHERE id = $1`,
    id,
    lastError?.slice(0, 2000) ?? null,
    nextDelayMinutes
  )
}

export async function moveToDLQ(job: any, lastError: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO xase_jobs_dlq (id, type, payload, attempts, max_attempts, last_error, created_at, updated_at)
       SELECT id, type, payload, attempts, max_attempts, $2, created_at, updated_at
       FROM xase_jobs WHERE id = $1`,
      job.id,
      lastError?.slice(0, 2000) ?? null
    )
    await tx.$executeRawUnsafe(`DELETE FROM xase_jobs WHERE id = $1`, job.id)
  })
}
