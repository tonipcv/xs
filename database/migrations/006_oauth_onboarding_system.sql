-- ========================================
-- XASE OAUTH ONBOARDING SYSTEM MIGRATION
-- Version: 1.0
-- Date: 2026-02-05
-- Description: Complete OAuth integration system with CloudIntegration, OAuthState, OnboardingProgress
-- ========================================

-- ========================================
-- PART 1: CREATE ENUMS
-- ========================================

-- CloudProvider enum
CREATE TYPE cloud_provider AS ENUM (
  'AWS_S3',
  'GCS',
  'AZURE_BLOB',
  'SNOWFLAKE',
  'BIGQUERY'
);

-- IntegrationStatus enum
CREATE TYPE integration_status AS ENUM (
  'ACTIVE',
  'ERROR',
  'DISABLED',
  'EXPIRED'
);

-- ConnectorType enum
CREATE TYPE connector_type AS ENUM (
  'POSTGRES',
  'MYSQL',
  'MSSQL',
  'ORACLE',
  'MONGODB',
  'REDIS',
  'HTTP_API'
);

-- ========================================
-- PART 2: CREATE CLOUD_INTEGRATIONS TABLE
-- ========================================

CREATE TABLE cloud_integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  
  -- Identification
  name TEXT NOT NULL,
  provider cloud_provider NOT NULL,
  status integration_status NOT NULL DEFAULT 'ACTIVE',
  
  -- OAuth Tokens (ENCRYPTED)
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  token_expires_at TIMESTAMP,
  scopes TEXT[] DEFAULT '{}',
  
  -- Provider-specific metadata
  account_name TEXT,
  project_id TEXT,
  subscription_id TEXT,
  region TEXT,
  
  -- Health & Testing
  last_tested_at TIMESTAMP,
  last_test_status TEXT,
  last_test_error TEXT,
  
  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Foreign Keys
  CONSTRAINT fk_cloud_integrations_tenant
    FOREIGN KEY (tenant_id) 
    REFERENCES xase_tenants(id) 
    ON DELETE CASCADE,
  
  -- Unique constraint
  CONSTRAINT uq_cloud_integrations_tenant_provider_name
    UNIQUE (tenant_id, provider, name)
);

-- Indexes for cloud_integrations
CREATE INDEX idx_cloud_integrations_tenant_id ON cloud_integrations(tenant_id);
CREATE INDEX idx_cloud_integrations_status ON cloud_integrations(status);
CREATE INDEX idx_cloud_integrations_provider ON cloud_integrations(provider);

-- ========================================
-- PART 3: CREATE OAUTH_STATES TABLE
-- ========================================

CREATE TABLE oauth_states (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  provider cloud_provider NOT NULL,
  
  -- Context for reconstruction
  redirect_path TEXT,
  metadata JSONB,
  
  -- Security
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for oauth_states
CREATE INDEX idx_oauth_states_state ON oauth_states(state);
CREATE INDEX idx_oauth_states_expires_at ON oauth_states(expires_at);
CREATE INDEX idx_oauth_states_tenant_id ON oauth_states(tenant_id);

-- ========================================
-- PART 4: CREATE ONBOARDING_PROGRESS TABLE
-- ========================================

CREATE TABLE onboarding_progress (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  
  -- Steps completed
  role_selected BOOLEAN NOT NULL DEFAULT FALSE,
  integration_setup BOOLEAN NOT NULL DEFAULT FALSE,
  first_dataset_added BOOLEAN NOT NULL DEFAULT FALSE,
  first_policy_created BOOLEAN NOT NULL DEFAULT FALSE,
  first_lease_issued BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Metadata
  current_step INTEGER NOT NULL DEFAULT 1,
  completed_at TIMESTAMP,
  skipped_at TIMESTAMP,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Foreign Keys
  CONSTRAINT fk_onboarding_progress_tenant
    FOREIGN KEY (tenant_id) 
    REFERENCES xase_tenants(id) 
    ON DELETE CASCADE
);

-- Index for onboarding_progress
CREATE INDEX idx_onboarding_progress_tenant_id ON onboarding_progress(tenant_id);

-- ========================================
-- PART 5: CREATE INTEGRATION_USAGE TABLE (P2 - Analytics)
-- ========================================

CREATE TABLE integration_usage (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  integration_type TEXT NOT NULL, -- 'CloudIntegration' | 'DataConnector'
  
  -- Metrics
  request_count INTEGER NOT NULL DEFAULT 0,
  bytes_transferred BIGINT NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER,
  
  -- Time bucket
  date DATE NOT NULL,
  hour INTEGER,
  
  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Unique constraint
  CONSTRAINT uq_integration_usage_id_type_date_hour
    UNIQUE (integration_id, integration_type, date, hour)
);

-- Indexes for integration_usage
CREATE INDEX idx_integration_usage_integration_id ON integration_usage(integration_id);
CREATE INDEX idx_integration_usage_date ON integration_usage(date);
CREATE INDEX idx_integration_usage_integration_type ON integration_usage(integration_type);

-- ========================================
-- PART 6: ALTER DATASET TABLE
-- ========================================

-- Add cloud_integration_id column (nullable for backwards compatibility)
ALTER TABLE xase_voice_datasets 
ADD COLUMN cloud_integration_id TEXT;

-- Add foreign key constraint
ALTER TABLE xase_voice_datasets
ADD CONSTRAINT fk_datasets_cloud_integration
  FOREIGN KEY (cloud_integration_id) 
  REFERENCES cloud_integrations(id) 
  ON DELETE SET NULL;

-- Add index
CREATE INDEX idx_datasets_cloud_integration_id ON xase_voice_datasets(cloud_integration_id);

-- Add data_connector_id column (nullable)
ALTER TABLE xase_voice_datasets 
ADD COLUMN data_connector_id TEXT;

-- Add foreign key constraint for data_connector
ALTER TABLE xase_voice_datasets
ADD CONSTRAINT fk_datasets_data_connector
  FOREIGN KEY (data_connector_id) 
  REFERENCES data_connectors(id) 
  ON DELETE SET NULL;

-- Add index
CREATE INDEX idx_datasets_data_connector_id ON xase_voice_datasets(data_connector_id);

-- ========================================
-- PART 7: ALTER DATA_CONNECTORS TABLE
-- ========================================

-- Drop old type column (string) and recreate as enum
ALTER TABLE data_connectors 
DROP COLUMN IF EXISTS type;

ALTER TABLE data_connectors 
ADD COLUMN type connector_type;

-- Rename and add encryption columns
ALTER TABLE data_connectors 
RENAME COLUMN connection_string TO encrypted_connection_string;

ALTER TABLE data_connectors 
RENAME COLUMN credentials TO encrypted_credentials;

-- Add new columns for health checks
ALTER TABLE data_connectors 
ADD COLUMN host TEXT,
ADD COLUMN port INTEGER,
ADD COLUMN database TEXT,
ADD COLUMN schema TEXT,
ADD COLUMN last_test_status TEXT,
ADD COLUMN last_test_error TEXT;

-- Update status column to use integration_status enum
ALTER TABLE data_connectors 
DROP COLUMN IF EXISTS status;

ALTER TABLE data_connectors 
ADD COLUMN status integration_status NOT NULL DEFAULT 'ACTIVE';

-- Update unique constraint
ALTER TABLE data_connectors 
DROP CONSTRAINT IF EXISTS data_connectors_tenantId_type_key;

ALTER TABLE data_connectors 
ADD CONSTRAINT uq_data_connectors_tenant_type_name 
  UNIQUE (tenant_id, type, name);

-- ========================================
-- PART 8: CREATE TRIGGER FOR UPDATED_AT
-- ========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for cloud_integrations
CREATE TRIGGER trigger_cloud_integrations_updated_at
  BEFORE UPDATE ON cloud_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for onboarding_progress
CREATE TRIGGER trigger_onboarding_progress_updated_at
  BEFORE UPDATE ON onboarding_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- PART 9: CREATE CLEANUP JOB FUNCTION
-- ========================================

-- Function to cleanup expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_states
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- PART 10: INSERT DEFAULT ONBOARDING PROGRESS FOR EXISTING TENANTS
-- ========================================

INSERT INTO onboarding_progress (id, tenant_id, role_selected, current_step, created_at, updated_at)
SELECT 
  'obp_' || substr(md5(random()::text), 1, 20),
  id,
  TRUE, -- Existing tenants already selected role
  2, -- Start at step 2 (integration setup)
  NOW(),
  NOW()
FROM xase_tenants
WHERE id NOT IN (SELECT tenant_id FROM onboarding_progress)
ON CONFLICT (tenant_id) DO NOTHING;

-- ========================================
-- PART 11: GRANT PERMISSIONS (if needed)
-- ========================================

-- Grant permissions to application user (adjust as needed)
-- GRANT ALL PRIVILEGES ON cloud_integrations TO your_app_user;
-- GRANT ALL PRIVILEGES ON oauth_states TO your_app_user;
-- GRANT ALL PRIVILEGES ON onboarding_progress TO your_app_user;
-- GRANT ALL PRIVILEGES ON integration_usage TO your_app_user;

-- ========================================
-- MIGRATION COMPLETE
-- ========================================

-- Verify tables created
SELECT 
  'cloud_integrations' as table_name, 
  COUNT(*) as row_count 
FROM cloud_integrations
UNION ALL
SELECT 
  'oauth_states' as table_name, 
  COUNT(*) as row_count 
FROM oauth_states
UNION ALL
SELECT 
  'onboarding_progress' as table_name, 
  COUNT(*) as row_count 
FROM onboarding_progress
UNION ALL
SELECT 
  'integration_usage' as table_name, 
  COUNT(*) as row_count 
FROM integration_usage;

-- Success message
SELECT 'OAuth Onboarding System Migration Completed Successfully!' as status;
