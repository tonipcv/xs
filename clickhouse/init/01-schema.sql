-- XASE Audit Ledger Schema for ClickHouse
-- Immutable event log with HMAC hash chaining

CREATE DATABASE IF NOT EXISTS xase_audit;

USE xase_audit;

-- Main audit events table with hash chaining
CREATE TABLE IF NOT EXISTS audit_events (
    event_id String,
    tenant_id String,
    event_type LowCardinality(String),
    resource_type LowCardinality(String),
    resource_id String,
    actor_id String,
    actor_type LowCardinality(String),
    action LowCardinality(String),
    outcome LowCardinality(String),
    ip_address String,
    user_agent String,
    metadata String,
    
    -- Hash chaining fields
    event_hash String,
    previous_hash String,
    chain_index UInt64,
    
    -- KMS checkpoint (every 10K events)
    checkpoint_signature String,
    checkpoint_index UInt64,
    
    -- Timestamps
    event_timestamp DateTime64(3),
    ingested_at DateTime64(3) DEFAULT now64(3),
    
    -- Partitioning
    partition_date Date DEFAULT toDate(event_timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(partition_date)
ORDER BY (tenant_id, event_timestamp, event_id)
SETTINGS index_granularity = 8192;

-- Policy decision events (high volume)
CREATE TABLE IF NOT EXISTS policy_decisions (
    decision_id String,
    tenant_id String,
    policy_id String,
    dataset_id String,
    principal String,
    purpose String,
    environment LowCardinality(String),
    decision LowCardinality(String),
    reasons Array(String),
    latency_ms UInt32,
    
    -- Hash chaining
    event_hash String,
    previous_hash String,
    chain_index UInt64,
    
    event_timestamp DateTime64(3),
    ingested_at DateTime64(3) DEFAULT now64(3),
    partition_date Date DEFAULT toDate(event_timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(partition_date)
ORDER BY (tenant_id, policy_id, event_timestamp)
SETTINGS index_granularity = 8192;

-- Data access events (streaming, downloads)
CREATE TABLE IF NOT EXISTS data_access_events (
    access_id String,
    tenant_id String,
    dataset_id String,
    policy_id String,
    lease_id String,
    action LowCardinality(String),
    files_accessed UInt32,
    bytes_transferred UInt64,
    hours_accessed Float32,
    outcome LowCardinality(String),
    
    -- Hash chaining
    event_hash String,
    previous_hash String,
    chain_index UInt64,
    
    event_timestamp DateTime64(3),
    ingested_at DateTime64(3) DEFAULT now64(3),
    partition_date Date DEFAULT toDate(event_timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(partition_date)
ORDER BY (tenant_id, dataset_id, event_timestamp)
SETTINGS index_granularity = 8192;

-- Consent change events
CREATE TABLE IF NOT EXISTS consent_events (
    event_id String,
    tenant_id String,
    dataset_id String,
    user_id String,
    consent_status LowCardinality(String),
    consent_version String,
    reason String,
    changed_by String,
    
    -- Hash chaining
    event_hash String,
    previous_hash String,
    chain_index UInt64,
    
    event_timestamp DateTime64(3),
    ingested_at DateTime64(3) DEFAULT now64(3),
    partition_date Date DEFAULT toDate(event_timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(partition_date)
ORDER BY (tenant_id, dataset_id, event_timestamp)
SETTINGS index_granularity = 8192;

-- KMS checkpoints table (for verification)
CREATE TABLE IF NOT EXISTS kms_checkpoints (
    checkpoint_id String,
    tenant_id String,
    table_name LowCardinality(String),
    chain_index UInt64,
    event_count UInt64,
    last_event_hash String,
    signature String,
    kms_key_id String,
    
    created_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree()
ORDER BY (tenant_id, table_name, chain_index)
SETTINGS index_granularity = 8192;

-- Materialized views for analytics

-- Hourly aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS audit_events_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (tenant_id, event_type, hour)
AS SELECT
    tenant_id,
    event_type,
    outcome,
    toStartOfHour(event_timestamp) as hour,
    count() as event_count
FROM audit_events
GROUP BY tenant_id, event_type, outcome, hour;

-- Policy decision metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS policy_decisions_metrics
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (tenant_id, policy_id, hour)
AS SELECT
    tenant_id,
    policy_id,
    decision,
    toStartOfHour(event_timestamp) as hour,
    count() as decision_count,
    avg(latency_ms) as avg_latency_ms,
    quantile(0.95)(latency_ms) as p95_latency_ms
FROM policy_decisions
GROUP BY tenant_id, policy_id, decision, hour;

-- Data access metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS data_access_metrics
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (tenant_id, dataset_id, hour)
AS SELECT
    tenant_id,
    dataset_id,
    action,
    toStartOfHour(event_timestamp) as hour,
    count() as access_count,
    sum(files_accessed) as total_files,
    sum(bytes_transferred) as total_bytes,
    sum(hours_accessed) as total_hours
FROM data_access_events
GROUP BY tenant_id, dataset_id, action, hour;
