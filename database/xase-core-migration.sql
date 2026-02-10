-- ============================================
-- XASE CORE - Migration para PostgreSQL
-- ============================================
-- Adiciona tabelas do Xase Core ao sistema existente
-- SEGURO: Não modifica tabelas existentes
-- ============================================

-- 1. Criar ENUM para status do tenant
DO $$ BEGIN
  CREATE TYPE "xase_tenant_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Criar ENUM para papéis de usuários no Xase
DO $$ BEGIN
  CREATE TYPE "xase_roles" AS ENUM ('OWNER', 'ADMIN', 'VIEWER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Adicionar colunas Xase ao User (se a tabela existir)
DO $$
DECLARE
  has_user_table BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'User'
  );
  has_users_table BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'users'
  );
BEGIN
  IF has_user_table THEN
    BEGIN
      EXECUTE 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" TEXT';
    EXCEPTION WHEN others THEN NULL; END;
    BEGIN
      EXECUTE 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "xaseRole" "xase_roles"';
    EXCEPTION WHEN others THEN NULL; END;
  ELSIF has_users_table THEN
    BEGIN
      EXECUTE 'ALTER TABLE users ADD COLUMN IF NOT EXISTS tenantId TEXT';
    EXCEPTION WHEN others THEN NULL; END;
    BEGIN
      EXECUTE 'ALTER TABLE users ADD COLUMN IF NOT EXISTS xaseRole xase_roles';
    EXCEPTION WHEN others THEN NULL; END;
  ELSE
    RAISE NOTICE 'Tabela de usuários não encontrada ("User" ou users). Pulando adição de colunas Xase no User.';
  END IF;
END $$;

-- 4. Criar tabela xase_tenants
CREATE TABLE IF NOT EXISTS "xase_tenants" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "companyName" TEXT,
  "industry" TEXT,
  "website" TEXT,
  "status" "xase_tenant_status" NOT NULL DEFAULT 'ACTIVE',
  "plan" TEXT NOT NULL DEFAULT 'free',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- 5. Criar tabela xase_api_keys
CREATE TABLE IF NOT EXISTS "xase_api_keys" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL UNIQUE,
  "keyPrefix" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "rateLimit" INTEGER NOT NULL DEFAULT 1000,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "xase_api_keys_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "xase_tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- 6. Criar tabela xase_decision_records (LEDGER IMUTÁVEL)
CREATE TABLE IF NOT EXISTS "xase_decision_records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL UNIQUE,
  "policyId" TEXT,
  "policyVersion" TEXT,
  "inputHash" TEXT NOT NULL,
  "outputHash" TEXT NOT NULL,
  "contextHash" TEXT,
  "recordHash" TEXT NOT NULL UNIQUE,
  "previousHash" TEXT,
  "decisionType" TEXT,
  "confidence" DOUBLE PRECISION,
  "processingTime" INTEGER,
  "inputPayload" TEXT,
  "outputPayload" TEXT,
  "contextPayload" TEXT,
  "storageUrl" TEXT,
  "isVerified" BOOLEAN NOT NULL DEFAULT true,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "xase_decision_records_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "xase_tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- 7. Adicionar FK de User para Tenant (se a tabela existir)
DO $$
DECLARE
  has_user_table BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'User'
  );
  has_users_table BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'users'
  );
BEGIN
  IF has_user_table THEN
    BEGIN
      EXECUTE 'ALTER TABLE "User" ADD CONSTRAINT IF NOT EXISTS "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "xase_tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE';
    EXCEPTION WHEN others THEN NULL; END;
  ELSIF has_users_table THEN
    BEGIN
      EXECUTE 'ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_tenantId_fkey FOREIGN KEY (tenantId) REFERENCES xase_tenants(id) ON DELETE SET NULL ON UPDATE CASCADE';
    EXCEPTION WHEN others THEN NULL; END;
  ELSE
    RAISE NOTICE 'Tabela de usuários não encontrada ("User" ou users). Pulando adição de FK.';
  END IF;
END $$;

-- 8. Criar índices para performance
-- Criar índice em tenantId da tabela de usuários, se existir
DO $$
DECLARE
  has_user_table BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'User'
  );
  has_users_table BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'users'
  );
BEGIN
  IF has_user_table THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId")';
  ELSIF has_users_table THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS users_tenantId_idx ON users(tenantId)';
  ELSE
    RAISE NOTICE 'Tabela de usuários não encontrada ("User" ou users). Pulando criação de índice.';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "xase_api_keys_tenantId_idx" ON "xase_api_keys"("tenantId");
CREATE INDEX IF NOT EXISTS "xase_api_keys_keyHash_idx" ON "xase_api_keys"("keyHash");
CREATE INDEX IF NOT EXISTS "xase_decision_records_tenantId_idx" ON "xase_decision_records"("tenantId");
CREATE INDEX IF NOT EXISTS "xase_decision_records_transactionId_idx" ON "xase_decision_records"("transactionId");
CREATE INDEX IF NOT EXISTS "xase_decision_records_timestamp_idx" ON "xase_decision_records"("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "xase_decision_records_policyId_idx" ON "xase_decision_records"("policyId");
CREATE INDEX IF NOT EXISTS "xase_decision_records_recordHash_idx" ON "xase_decision_records"("recordHash");

-- 9. Criar TRIGGER para imutabilidade do ledger (OPCIONAL mas recomendado)
CREATE OR REPLACE FUNCTION prevent_xase_record_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Decision records are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_update_xase_records ON "xase_decision_records";
CREATE TRIGGER prevent_update_xase_records
  BEFORE UPDATE ON "xase_decision_records"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_xase_record_modification();

DROP TRIGGER IF EXISTS prevent_delete_xase_records ON "xase_decision_records";
CREATE TRIGGER prevent_delete_xase_records
  BEFORE DELETE ON "xase_decision_records"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_xase_record_modification();

-- 10. Comentários para documentação
COMMENT ON TABLE "xase_tenants" IS 'Empresas clientes do Xase Core ledger service';
COMMENT ON TABLE "xase_api_keys" IS 'API keys para autenticação de ingestão de decisões';
COMMENT ON TABLE "xase_decision_records" IS 'Ledger imutável de decisões de IA com prova criptográfica';
COMMENT ON COLUMN "xase_decision_records"."recordHash" IS 'Hash encadeado ligando ao record anterior';
COMMENT ON COLUMN "xase_decision_records"."previousHash" IS 'Hash do record anterior na chain';
COMMENT ON COLUMN "xase_decision_records"."transactionId" IS 'ID público para recibo de verificação';

-- ============================================
-- MIGRATION COMPLETA
-- ============================================
-- Execute: psql $DATABASE_URL < database/xase-core-migration.sql
-- Ou use: node database/run-migration.js
-- ============================================
