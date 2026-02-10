-- ============================================
-- XASE CORE - Migration 004: Checkpoint & Audit Log
-- Adiciona âncora externa de integridade e trilha de auditoria
-- ============================================

-- 1. Criar tabela de Checkpoints
CREATE TABLE IF NOT EXISTS "xase_checkpoint_records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  
  -- Identificação
  "checkpointId" TEXT NOT NULL UNIQUE,
  "checkpointType" TEXT NOT NULL DEFAULT 'PERIODIC',
  
  -- Dados do checkpoint
  "lastRecordHash" TEXT NOT NULL,
  "recordCount" INTEGER NOT NULL,
  "merkleRoot" TEXT,
  "checkpointHash" TEXT NOT NULL UNIQUE,
  
  -- Assinatura KMS/HSM
  "signature" TEXT,
  "signatureAlgo" TEXT,
  "keyId" TEXT,
  
  -- TSA (RFC3161)
  "tsaToken" TEXT,
  "tsaUrl" TEXT,
  "tsaTimestamp" TIMESTAMP(3),
  
  -- Metadata
  "previousCheckpointId" TEXT,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  
  -- Timestamps
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign Keys
  CONSTRAINT "xase_checkpoint_records_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "xase_tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- 2. Criar índices para Checkpoints
CREATE INDEX IF NOT EXISTS "xase_checkpoint_records_tenantId_idx" ON "xase_checkpoint_records"("tenantId");
CREATE INDEX IF NOT EXISTS "xase_checkpoint_records_timestamp_idx" ON "xase_checkpoint_records"("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "xase_checkpoint_records_checkpointHash_idx" ON "xase_checkpoint_records"("checkpointHash");

-- 3. Criar tabela de Audit Logs
CREATE TABLE IF NOT EXISTS "xase_audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "userId" TEXT,
  
  -- Ação
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  
  -- Contexto
  "metadata" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  
  -- Resultado
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "errorMessage" TEXT,
  
  -- Timestamp (IMUTÁVEL)
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Criar índices para Audit Logs
CREATE INDEX IF NOT EXISTS "xase_audit_logs_tenantId_idx" ON "xase_audit_logs"("tenantId");
CREATE INDEX IF NOT EXISTS "xase_audit_logs_userId_idx" ON "xase_audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "xase_audit_logs_action_idx" ON "xase_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "xase_audit_logs_timestamp_idx" ON "xase_audit_logs"("timestamp" DESC);

-- 5. Criar trigger de imutabilidade para Checkpoints
CREATE OR REPLACE FUNCTION prevent_checkpoint_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Checkpoint records are immutable and cannot be modified or deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_checkpoint_update ON "xase_checkpoint_records";
CREATE TRIGGER prevent_checkpoint_update
  BEFORE UPDATE ON "xase_checkpoint_records"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_checkpoint_modification();

DROP TRIGGER IF EXISTS prevent_checkpoint_delete ON "xase_checkpoint_records";
CREATE TRIGGER prevent_checkpoint_delete
  BEFORE DELETE ON "xase_checkpoint_records"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_checkpoint_modification();

-- 6. Criar trigger de imutabilidade para Audit Logs
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_audit_log_update ON "xase_audit_logs";
CREATE TRIGGER prevent_audit_log_update
  BEFORE UPDATE ON "xase_audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

DROP TRIGGER IF EXISTS prevent_audit_log_delete ON "xase_audit_logs";
CREATE TRIGGER prevent_audit_log_delete
  BEFORE DELETE ON "xase_audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- ============================================
-- MIGRATION 004 COMPLETE
-- ============================================
-- Tabelas criadas:
-- - xase_checkpoint_records (com triggers de imutabilidade)
-- - xase_audit_logs (com triggers de imutabilidade)
-- ============================================
