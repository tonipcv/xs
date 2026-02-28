#!/bin/bash

# Extract DATABASE_URL from .env
if [ -f .env ]; then
  export $(cat .env | grep DATABASE_URL | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not found in .env file"
  exit 1
fi

echo "Starting Stripe fields migration..."

# Execute the migration
psql "$DATABASE_URL" -f migrations/add_stripe_fields.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration completed successfully!"
else
  echo "❌ Migration failed"
  exit 1
fi
