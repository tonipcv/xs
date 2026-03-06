-- Migration: Add audit logs table
-- Purpose: Track all preparation pipeline actions for compliance
-- Date: 2026-03-06

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  action VARCHAR(255) NOT NULL,
  resource VARCHAR(255) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  purpose TEXT,
  metadata JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for fast lookup
  CONSTRAINT audit_logs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT audit_logs_tenant_fk FOREIGN KEY (tenant_id) REFERENCES xase_tenants(id) ON DELETE CASCADE
);

-- Index for lookup by resource
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource 
  ON audit_logs(resource, resource_id);

-- Index for lookup by tenant
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant 
  ON audit_logs(tenant_id, created_at DESC);

-- Index for lookup by user
CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
  ON audit_logs(user_id, created_at DESC);

-- Index for lookup by action
CREATE INDEX IF NOT EXISTS idx_audit_logs_action 
  ON audit_logs(action, created_at DESC);

-- Index for cleanup of old logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at 
  ON audit_logs(created_at);
