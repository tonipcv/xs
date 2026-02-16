-- Migration: Add auto-renew and extended TTL support to VoiceAccessLease
-- Date: 2026-02-16
-- Purpose: Support 72h leases with auto-renewal for long H100/H200 training jobs

-- Add new columns to xase_voice_access_leases
ALTER TABLE xase_voice_access_leases
ADD COLUMN IF NOT EXISTS ttl_seconds INTEGER DEFAULT 28800, -- 8h default (backward compatible)
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS max_renewals INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS renewals_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS budget_limit DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS alert_30min_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS alert_5min_sent BOOLEAN DEFAULT false;

-- Create index for auto-renew queries
CREATE INDEX IF NOT EXISTS idx_leases_auto_renew 
ON xase_voice_access_leases(auto_renew, expires_at) 
WHERE status = 'ACTIVE' AND auto_renew = true;

-- Create index for alert queries
CREATE INDEX IF NOT EXISTS idx_leases_expiry_alerts 
ON xase_voice_access_leases(expires_at, alert_30min_sent, alert_5min_sent) 
WHERE status = 'ACTIVE';

-- Update existing leases to have ttl_seconds based on expires_at - issued_at
UPDATE xase_voice_access_leases
SET ttl_seconds = EXTRACT(EPOCH FROM (expires_at - issued_at))::INTEGER
WHERE ttl_seconds IS NULL;

-- Add comment
COMMENT ON COLUMN xase_voice_access_leases.ttl_seconds IS 'TTL in seconds. Max 259200 (72h) for long training jobs';
COMMENT ON COLUMN xase_voice_access_leases.auto_renew IS 'Automatically renew lease 30min before expiry';
COMMENT ON COLUMN xase_voice_access_leases.max_renewals IS 'Maximum number of auto-renewals allowed';
COMMENT ON COLUMN xase_voice_access_leases.renewals_count IS 'Current number of renewals performed';
COMMENT ON COLUMN xase_voice_access_leases.budget_limit IS 'Stop auto-renew if total cost exceeds this limit';
