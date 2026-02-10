-- P0: Catalog/analytics indexes + GIN on use_cases
-- Safe to re-run (IF NOT EXISTS)

-- AccessOffer indexes
CREATE INDEX IF NOT EXISTS access_offers_price_per_hour_idx 
  ON access_offers(price_per_hour);
CREATE INDEX IF NOT EXISTS access_offers_scope_hours_idx 
  ON access_offers(scope_hours);
CREATE INDEX IF NOT EXISTS access_offers_jurisdiction_idx 
  ON access_offers(jurisdiction);
-- GIN index for array filter on use_cases
CREATE INDEX IF NOT EXISTS access_offers_use_cases_gin_idx 
  ON access_offers USING GIN (use_cases);

-- PolicyExecution indexes
CREATE INDEX IF NOT EXISTS policy_executions_started_at_idx 
  ON policy_executions(started_at);
CREATE INDEX IF NOT EXISTS policy_executions_total_cost_idx 
  ON policy_executions(total_cost);
CREATE INDEX IF NOT EXISTS policy_executions_policy_id_idx 
  ON policy_executions(policy_id);
CREATE INDEX IF NOT EXISTS policy_executions_lease_id_idx 
  ON policy_executions(lease_id);

-- AccessReview indexes
CREATE INDEX IF NOT EXISTS access_reviews_overall_rating_idx 
  ON access_reviews(overall_rating);
CREATE INDEX IF NOT EXISTS access_reviews_regulator_accepted_idx 
  ON access_reviews(regulator_accepted);
CREATE INDEX IF NOT EXISTS access_reviews_audit_successful_idx 
  ON access_reviews(audit_successful);
