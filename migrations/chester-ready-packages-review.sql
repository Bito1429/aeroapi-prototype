-- REVIEW ONLY. Not executed. Separate derived-package store: no raw AeroAPI payloads.
-- Creation, grants, and 7-day cleanup require owner/Tayla signoff before deployment.
CREATE TABLE IF NOT EXISTS public.chester_ready_packages (
  flight_id text PRIMARY KEY,
  package_json jsonb NOT NULL,
  etag text NOT NULL,
  source_account text NOT NULL DEFAULT 'US_PRODUCTION',
  source_captured_at timestamptz NOT NULL,
  scheduled_arrival_at timestamptz NOT NULL,
  generated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chester_ready_package_source CHECK (source_account = 'US_PRODUCTION'),
  CONSTRAINT chester_ready_package_lifetime CHECK (expires_at = scheduled_arrival_at + interval '7 days'),
  CONSTRAINT chester_ready_package_no_foresight CHECK (
    package_json::text !~* 'predicted_|foresight|raw_capture|raw_receipts'
  )
);
CREATE INDEX IF NOT EXISTS chester_ready_packages_expiry_idx ON public.chester_ready_packages(expires_at);
-- Grant only after checking the existing account's permissions and data licence:
-- GRANT SELECT ON public.chester_ready_packages TO chester_api_readonly_20261108;
-- Producer must use a separate limited role granted INSERT/SELECT only on this table,
-- plus SELECT on the two existing source tables, never campaign UPDATE/DELETE.
-- Cleanup job (separate from collection/scoring) should execute:
-- DELETE FROM public.chester_ready_packages WHERE expires_at <= now();
