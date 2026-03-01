#!/bin/bash

# Script to run webhooks migration
# Adds Webhook and WebhookDelivery tables to the database

set -e

echo "🔄 Running webhooks migration..."

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL not set in .env"
  exit 1
fi

# Run migration
psql "$DATABASE_URL" -f migrations/add_webhooks.sql

echo "✅ Webhooks migration completed successfully!"
echo ""
echo "Tables created:"
echo "  - webhooks"
echo "  - webhook_deliveries"
echo ""
echo "Indexes created:"
echo "  - idx_webhooks_tenant_id"
echo "  - idx_webhooks_is_active"
echo "  - idx_webhook_deliveries_webhook_id"
echo "  - idx_webhook_deliveries_status"
echo "  - idx_webhook_deliveries_next_retry_at"
echo "  - idx_webhook_deliveries_created_at"
