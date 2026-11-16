-- DESIGN ONLY -- DO NOT EXECUTE ON US PRODUCTION.
-- AevPath scored-flight investor evidence archive, revision 1, 13 November 2026.
-- No raw provider payloads. Licence approval of individual fields is REQUIRED.
-- These tables deliberately have NO foreign keys to campaign tables.
-- Nothing in this file purges data, modifies scores or enrolls flights.

CREATE SCHEMA IF NOT EXISTS evidence_v1;

-- Append-only historical snapshots, keyed by AevPath job UUID but NOT referencing
-- flight_jobs: evidence must not be cascade-deleted when campaign rows change.
CREATE TABLE evidence_v1.scored_flight_revisions (
  evidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_job_id uuid NOT NULL,
  source_flight_id text NOT NULL,
  revision_no integer NOT NULL CHECK (revision_no >= 1),
  prior_evidence_sha256 text,
  source_account text NOT NULL CHECK(source_account='US_PRODUCTION'),
  ident text NOT NULL,
  flight_date date NOT NULL,
  origin_icao text NOT NULL,
  destination_icao text NOT NULL,
  scheduled_out_at timestamptz,
  flight_terminal_state text,
  scoreable boolean NOT NULL,
  score_method text NOT NULL,
  score_method_version text NOT NULL,
  score_metric_definition text NOT NULL,
  -- Method A is cross-track separation, not actual aircraft position accuracy.
  mean_route_line_xtd_km double precision NOT NULL CHECK(mean_route_line_xtd_km >= 0),
  mean_total_error_km double precision,
  mean_atd_km double precision,
  score_checkpoint_metrics jsonb NOT NULL,
  score_computed_at timestamptz NOT NULL,
  -- Prediction fields are NULL unless the source, locked-before-flight proof
  -- AND the exact derivative representation are accepted in writing by Tayla.
  prediction_locked_at timestamptz,
  prediction_method_version text,
  prediction_route_kind text,
  prediction_route_approved jsonb,
  eta_locked_at timestamptz,
  eta_prediction_approved jsonb,
  prediction_provenance_status text NOT NULL
    CHECK(prediction_provenance_status IN (
      'NOT_PRESERVED','CAPTURE_REFERENCE_ONLY',
      'VERIFIED_LOCKED_DERIVATIVE','NOT_LICENSED')),
  licence_review_version text NOT NULL,
  inclusion_class text NOT NULL
    CHECK(inclusion_class IN ('NORMAL','INCIDENT_REVIEW','EXCLUDED_FROM_COMPARISON')),
  inclusion_reason text,
  source_capture_reference_id bigint,
  source_track_reference_id bigint,
  evidence_schema_version integer NOT NULL DEFAULT 1,
  evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  revision_reason text NOT NULL,
  UNIQUE(source_job_id,revision_no),
  UNIQUE(evidence_sha256),
  CHECK(prediction_route_approved IS NULL OR
    prediction_provenance_status='VERIFIED_LOCKED_DERIVATIVE'),
  CHECK(prediction_locked_at IS NULL OR
    prediction_locked_at < score_computed_at)
);
CREATE INDEX scored_flight_revisions_ident_date_idx
 ON evidence_v1.scored_flight_revisions(ident,flight_date);
CREATE INDEX scored_flight_revisions_source_idx
 ON evidence_v1.scored_flight_revisions(source_job_id,revision_no DESC);

-- Retained proof of archive verification. No provider data or flight geometry.
CREATE TABLE evidence_v1.archive_acceptance_events (
  acceptance_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  assessment_version text NOT NULL,
  scored_jobs_expected bigint NOT NULL,
  distinct_scored_jobs_archived bigint NOT NULL,
  checkpoint_rows_expected bigint NOT NULL,
  checkpoint_rows_archived bigint NOT NULL,
  missing_or_mismatched_count bigint NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  licence_approval_reference text,
  reviewer text NOT NULL,
  backup_restore_test_reference text,
  passed boolean NOT NULL DEFAULT false,
  notes text
);

-- Do not update a snapshot in place; corrections are a new revision.
CREATE FUNCTION evidence_v1.reject_evidence_rewrite()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'IMMUTABLE_EVIDENCE: append a revision; no UPDATE/DELETE permitted';
END; $$;
CREATE TRIGGER scored_flight_revisions_immutable
BEFORE UPDATE OR DELETE ON evidence_v1.scored_flight_revisions
FOR EACH ROW EXECUTE FUNCTION evidence_v1.reject_evidence_rewrite();
CREATE TRIGGER archive_acceptance_events_immutable
BEFORE UPDATE OR DELETE ON evidence_v1.archive_acceptance_events
FOR EACH ROW EXECUTE FUNCTION evidence_v1.reject_evidence_rewrite();

-- Read-only investor view gives the latest approved revision per scored flight.
-- This is a view, not the archive itself; the underlying rows are preserved.
CREATE VIEW evidence_v1.latest_scored_flights AS
SELECT DISTINCT ON (source_job_id)
 source_job_id, source_flight_id, ident,flight_date,origin_icao,
 destination_icao,score_method,score_method_version,
 score_metric_definition,mean_route_line_xtd_km,mean_total_error_km,
 mean_atd_km,score_checkpoint_metrics,score_computed_at,
 prediction_locked_at,prediction_method_version,prediction_route_kind,
 prediction_route_approved,eta_prediction_approved,
 prediction_provenance_status,licence_review_version,
 inclusion_class,inclusion_reason,revision_no,evidence_sha256
FROM evidence_v1.scored_flight_revisions
ORDER BY source_job_id,revision_no DESC;

-- No CREATE ROLE, GRANT, scheduled task or source-campaign modifications here.
-- Future grants: independent archive writer INSERT only;
-- investor role SELECT only; no role except DBA DDL on this schema.
-- Database owner/superuser remains capable of circumventing triggers:
-- require separately versioned, access-controlled backups and restore drills.
