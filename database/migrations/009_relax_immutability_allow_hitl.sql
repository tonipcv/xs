-- ============================================
-- XASE CORE - Migration 009: Relax immutability to allow HITL flags
-- Permite UPDATE apenas dos campos derivados: hasHumanIntervention, finalDecisionSource
-- Continua proibindo DELETE e alterações em quaisquer outros campos
-- ============================================

-- Função nova que permite apenas updates em campos específicos
CREATE OR REPLACE FUNCTION allow_only_hitl_fields_update()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Decision records are immutable and cannot be modified or deleted';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Permitir apenas mudanças nestes campos
    IF (
      (OLD."hasHumanIntervention" IS NOT DISTINCT FROM NEW."hasHumanIntervention") AND
      (OLD."finalDecisionSource"  IS NOT DISTINCT FROM NEW."finalDecisionSource")
    ) THEN
      -- Nenhuma alteração relevante (ou update redundante)
      RETURN NEW;
    END IF;

    -- Se houver alterações em outros campos além dos permitidos, bloqueia
    IF (
      OLD."tenantId"           IS DISTINCT FROM NEW."tenantId" OR
      OLD."transactionId"      IS DISTINCT FROM NEW."transactionId" OR
      OLD."policyId"           IS DISTINCT FROM NEW."policyId" OR
      OLD."policyVersion"      IS DISTINCT FROM NEW."policyVersion" OR
      OLD."inputHash"          IS DISTINCT FROM NEW."inputHash" OR
      OLD."outputHash"         IS DISTINCT FROM NEW."outputHash" OR
      OLD."contextHash"        IS DISTINCT FROM NEW."contextHash" OR
      OLD."recordHash"         IS DISTINCT FROM NEW."recordHash" OR
      OLD."previousHash"       IS DISTINCT FROM NEW."previousHash" OR
      OLD."decisionType"       IS DISTINCT FROM NEW."decisionType" OR
      OLD."confidence"         IS DISTINCT FROM NEW."confidence" OR
      OLD."processingTime"     IS DISTINCT FROM NEW."processingTime" OR
      OLD."inputPayload"       IS DISTINCT FROM NEW."inputPayload" OR
      OLD."outputPayload"      IS DISTINCT FROM NEW."outputPayload" OR
      OLD."contextPayload"     IS DISTINCT FROM NEW."contextPayload" OR
      OLD."storageUrl"         IS DISTINCT FROM NEW."storageUrl" OR
      OLD."isVerified"         IS DISTINCT FROM NEW."isVerified" OR
      OLD."verifiedAt"         IS DISTINCT FROM NEW."verifiedAt" OR
      OLD."timestamp"          IS DISTINCT FROM NEW."timestamp" OR
      OLD."createdAt"          IS DISTINCT FROM NEW."createdAt"
    ) THEN
      RAISE EXCEPTION 'Decision records are immutable and cannot be modified or deleted';
    END IF;

    -- Se chegou aqui, as únicas alterações foram nos campos permitidos
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remover triggers antigos que bloqueiam todo UPDATE/DELETE
DROP TRIGGER IF EXISTS prevent_update_xase_records ON "xase_decision_records";
DROP TRIGGER IF EXISTS prevent_delete_xase_records ON "xase_decision_records";

-- Criar novo trigger de UPDATE com a função que permite apenas HITL fields
CREATE TRIGGER prevent_illegal_update_xase_records
  BEFORE UPDATE ON "xase_decision_records"
  FOR EACH ROW
  EXECUTE FUNCTION allow_only_hitl_fields_update();

-- Recriar trigger de DELETE que segue bloqueando
CREATE TRIGGER prevent_delete_xase_records
  BEFORE DELETE ON "xase_decision_records"
  FOR EACH ROW
  EXECUTE FUNCTION allow_only_hitl_fields_update();

-- ============================================
-- MIGRATION 009 COMPLETE
-- ============================================
