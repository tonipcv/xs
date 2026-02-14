-- ============================================
-- XASE CORE - Migration 003: Remove WhatsApp/IA + PrayerRequest
-- SAFE: Drops only deprecated tables, preserves core (Auth/Stripe/Xase)
-- ============================================

-- Drop child tables first (respect FK order)
DROP TABLE IF EXISTS "whatsapp_contact_labels" CASCADE;
DROP TABLE IF EXISTS "ai_conversation_messages" CASCADE;
DROP TABLE IF EXISTS "ai_agent_logs" CASCADE;
DROP TABLE IF EXISTS "whatsapp_messages" CASCADE;
DROP TABLE IF EXISTS "ai_conversations" CASCADE;
DROP TABLE IF EXISTS "knowledge_chunks" CASCADE;
DROP TABLE IF EXISTS "ai_agent_configs" CASCADE;
DROP TABLE IF EXISTS "whatsapp_chats" CASCADE;
DROP TABLE IF EXISTS "whatsapp_contacts" CASCADE;
DROP TABLE IF EXISTS "whatsapp_labels" CASCADE;
DROP TABLE IF EXISTS "whatsapp_instances" CASCADE;
DROP TABLE IF EXISTS "PrayerRequest" CASCADE;

-- Optional: Clean up any leftover types/indexes if they existed (defensive)
-- (No custom enums were created for these models in the current schema)

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
