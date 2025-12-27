-- XASE Jobs Queue (PostgreSQL)
-- Simple, free, DB-backed queue with retries, backoff, DLQ and idempotency

BEGIN;

CREATE TABLE IF NOT EXISTS xase_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  status        text NOT NULL DEFAULT 'PENDING', -- PENDING | RUNNING | DONE | FAILED
  payload       jsonb NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 5,
  run_at        timestamptz NOT NULL DEFAULT now(),
  dedupe_key    text,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_xase_jobs_dedupe ON xase_jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_xase_jobs_status_runat ON xase_jobs(status, run_at);

CREATE TABLE IF NOT EXISTS xase_jobs_dlq (
  id            uuid PRIMARY KEY,
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  attempts      integer NOT NULL,
  max_attempts  integer NOT NULL,
  failed_at     timestamptz NOT NULL DEFAULT now(),
  last_error    text,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL
);

COMMIT;
