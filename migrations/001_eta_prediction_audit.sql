-- Entry 745 / package endpoint ETA audit persistence.
-- Production table created 2026-10-07 after ETA calibration freeze.
-- source_environment is required and has NO DEFAULT so missing environment tags fail loudly.

create table if not exists eta_prediction_audit (
  id bigserial primary key,
  flight_job_id uuid not null references flight_jobs(id) on delete cascade,
  cutoff_at timestamptz not null,
  prediction_version text not null,
  predicted_at timestamptz not null,
  predicted_on timestamptz,
  window_early timestamptz,
  window_late timestamptz,
  baseline_source text not null,
  baseline_at_cutoff timestamptz,
  final_actual_on timestamptz,
  source_environment text not null,
  created_at timestamptz not null default now()
);

create index if not exists eta_prediction_audit_job_cutoff_idx
  on eta_prediction_audit(flight_job_id, cutoff_at desc);

create unique index if not exists eta_prediction_audit_unique_cutoff_idx
  on eta_prediction_audit(flight_job_id, prediction_version, cutoff_at);

create or replace view eta_prediction_audit_genuine as
select epa.*
from eta_prediction_audit epa
join flight_jobs j on j.id=epa.flight_job_id
where epa.source_environment='production'
  and j.final_actual_off is not null
  and epa.predicted_at < j.final_actual_off;
