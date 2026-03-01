-- This migration adds support for marketplace offers and negotiations

-- Create Offer table
CREATE TABLE IF NOT EXISTS "Offer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "datasetId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "dataType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "terms" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Offer_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "xase_datasets"("id") ON DELETE CASCADE,
  CONSTRAINT "Offer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create Negotiation table
CREATE TABLE IF NOT EXISTS "Negotiation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offerId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "initialPrice" DECIMAL(10,2) NOT NULL,
  "proposedPrice" DECIMAL(10,2) NOT NULL,
  "counterPrice" DECIMAL(10,2),
  "finalPrice" DECIMAL(10,2),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "proposedTerms" JSONB,
  "counterTerms" JSONB,
  "message" TEXT,
  "counterMessage" TEXT,
  "rejectionReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Negotiation_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE,
  CONSTRAINT "Negotiation_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "Negotiation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create Notification table (for marketplace notifications)
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'INFO',
  "title" TEXT NOT NULL,
  "message" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT FALSE,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "Offer_datasetId_idx" ON "Offer"("datasetId");
CREATE INDEX IF NOT EXISTS "Offer_sellerId_idx" ON "Offer"("sellerId");
CREATE INDEX IF NOT EXISTS "Offer_status_idx" ON "Offer"("status");
CREATE INDEX IF NOT EXISTS "Negotiation_offerId_idx" ON "Negotiation"("offerId");
CREATE INDEX IF NOT EXISTS "Negotiation_buyerId_idx" ON "Negotiation"("buyerId");
CREATE INDEX IF NOT EXISTS "Negotiation_sellerId_idx" ON "Negotiation"("sellerId");
CREATE INDEX IF NOT EXISTS "Negotiation_status_idx" ON "Negotiation"("status");
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");

-- Add updated_at trigger for Offer
CREATE OR REPLACE FUNCTION update_offer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offer_updated_at ON "Offer";
CREATE TRIGGER offer_updated_at
  BEFORE UPDATE ON "Offer"
  FOR EACH ROW
  EXECUTE FUNCTION update_offer_updated_at();

-- Add updated_at trigger for Negotiation
CREATE OR REPLACE FUNCTION update_negotiation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS negotiation_updated_at ON "Negotiation";
CREATE TRIGGER negotiation_updated_at
  BEFORE UPDATE ON "Negotiation"
  FOR EACH ROW
  EXECUTE FUNCTION update_negotiation_updated_at();
