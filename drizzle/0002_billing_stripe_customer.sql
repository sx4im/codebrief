-- Billing: store the Stripe customer id for lifetime-access purchases.
-- Lifetime entitlement itself is recorded in users.plan = 'lifetime'.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
