-- REVIEW ONLY. SELECT statements for a disposable database AFTER archive build.
-- Do not execute against production as the archive tables do not exist there.
-- Query 1 must return zero missing flights.
WITH expected AS (
 SELECT id,ident,flight_date,origin,destination,
        method_a_mean_xtd_km,method_a_mean_total_km,method_a_mean_atd_km
 FROM public.flight_jobs WHERE method_a_mean_xtd_km IS NOT NULL
), actual AS (
 SELECT * FROM evidence_v1.latest_scored_flights
)
SELECT count(*) AS source_scored_jobs,
       count(a.source_job_id) AS archived_jobs,
       count(*) FILTER (WHERE a.source_job_id IS NULL) AS missing_archive,
       count(*) FILTER (WHERE a.source_job_id IS NOT NULL AND (
          a.ident IS DISTINCT FROM e.ident OR
          a.flight_date IS DISTINCT FROM e.flight_date OR
          a.origin_icao IS DISTINCT FROM e.origin OR
          a.destination_icao IS DISTINCT FROM e.destination OR
          abs(a.mean_route_line_xtd_km-e.method_a_mean_xtd_km)>0.000001 OR
          abs(a.mean_total_error_km-e.method_a_mean_total_km)>0.000001 OR
          abs(a.mean_atd_km-e.method_a_mean_atd_km)>0.000001
       )) AS mismatched_identity_or_scores
FROM expected e LEFT JOIN actual a ON a.source_job_id=e.id;

-- Query 2: all scored checkpoints must be represented, identical within
-- round-off; materializer should store the five checkpoints ordered by
-- checkpoint_pct with numerical xtd_km,atd_km,total_error_km and scored_at.
SELECT count(*) AS stored_checkpoint_rows,
       count(DISTINCT flight_job_id) AS scored_flights
FROM public.method_a_scores;

-- Query 3: the immutable archive must not contain fabricated predictions.
SELECT count(*) FILTER (WHERE prediction_provenance_status='VERIFIED_LOCKED_DERIVATIVE') AS verified_predictions,
       count(*) FILTER (WHERE prediction_provenance_status <> 'VERIFIED_LOCKED_DERIVATIVE' AND prediction_route_approved IS NOT NULL) AS illegal_nonverified_route_entries,
       count(*) FILTER (WHERE prediction_locked_at IS NULL AND prediction_route_approved IS NOT NULL) AS route_without_proven_lock
FROM evidence_v1.latest_scored_flights;

-- Query 4: record a signed manifest hash and verify from an independent
-- copied read-only backup in the restoration drill; do not do cleanup as a test.
SELECT count(*) AS archive_flights,
       count(*) FILTER (WHERE licence_review_version='PENDING') AS licence_pending,
       count(*) FILTER (WHERE inclusion_class='INCIDENT_REVIEW') AS flagged_incident_review,
       count(*) FILTER (WHERE inclusion_class='EXCLUDED_FROM_COMPARISON') AS flagged_comparison_excluded
FROM evidence_v1.latest_scored_flights;
