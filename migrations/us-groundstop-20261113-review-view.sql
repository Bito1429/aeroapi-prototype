-- REVIEW ONLY. Analytics view; does not alter any frozen US campaign scores,
-- capture/scoring workers, or provider data. All flags mean potentially affected,
-- NOT confirmed FAA-caused delay. 2026-11-13 20:54Z is advisory effective time.
CREATE OR REPLACE VIEW public.us_20261113_groundstop_review AS
SELECT j.fa_flight_id AS flight_id,j.ident,j.flight_date,j.scheduled_out_initial,
       j.final_actual_out,j.status,j.terminal_state,j.scoreable,
       j.method_a_mean_xtd_km AS original_score_km,
       CASE
         WHEN j.terminal_state='CANCELLED' THEN 'CANCELLED_UNATTRIBUTED'
         WHEN j.scheduled_out_initial >= timestamptz '2026-11-13 20:54+00'
          AND j.scheduled_out_initial < timestamptz '2026-11-14 04:30+00'
           THEN 'GROUNDSTOP_WINDOW_CANDIDATE'
         WHEN EXISTS (
           SELECT 1 FROM public.flight_captures c WHERE c.flight_job_id=j.id
            AND c.captured_at >= timestamptz '2026-11-13 20:54+00'
            AND c.status_seen ILIKE '%delay%'
            AND c.estimated_out > j.scheduled_out_initial+interval '20 minutes'
         ) THEN 'PRESTOP_SCHEDULE_WITH_LATE_DELAY_CANDIDATE'
         ELSE 'NO_EVENT_EVIDENCE'
       END AS disruption_review_flag
FROM public.flight_jobs j
WHERE j.flight_date IN ('2026-11-13','2026-11-14');
-- Reporting should compare original numbers and an alternative filtered view
-- excluding the two *_CANDIDATE categories. Never overwrite existing results.
