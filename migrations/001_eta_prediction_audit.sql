-- Entry 745 / package endpoint ETA audit persistence.
-- Draft only: do not apply to production until the calibration fields are frozen.

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
  created_at timestamptz not null default now()
);

create index if not exists eta_prediction_audit_job_cutoff_idx
  on eta_prediction_audit(flight_job_id, cutoff_at desc);

create unique index if not exists eta_prediction_audit_unique_cutoff_idx
  on eta_prediction_audit(flight_job_id, prediction_version, cutoff_at);
