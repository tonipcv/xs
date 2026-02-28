-- Add Stripe-related fields to User table
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(50) DEFAULT 'FREE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50);

-- Create Subscription table for tracking Stripe subscriptions
CREATE TABLE IF NOT EXISTS xase_subscriptions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_price_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  plan_tier VARCHAR(50) NOT NULL,
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_subscription_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON xase_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON xase_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON xase_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON xase_subscriptions(status);

-- Create Invoice table for tracking Stripe invoices
CREATE TABLE IF NOT EXISTS xase_invoices (
  id VARCHAR(255) PRIMARY KEY,
  subscription_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  amount_due DECIMAL(10, 2) NOT NULL,
  amount_paid DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  status VARCHAR(50) NOT NULL,
  invoice_pdf VARCHAR(500),
  hosted_invoice_url VARCHAR(500),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_invoice_subscription FOREIGN KEY (subscription_id) REFERENCES xase_subscriptions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON xase_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_customer_id ON xase_invoices(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON xase_invoices(status);

-- Add indexes for Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
