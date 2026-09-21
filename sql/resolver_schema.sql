-- AevPath resolver engine v0
-- Isolated development schema. Do not apply to production until the Sep 21-25 cohort is closed.

create table if not exists nav_cycles (
  id uuid primary key default gen_random_uuid(),
  cycle_code text not null unique,
  effective_from timestamptz not null,
  effective_to timestamptz not null,
  created_at timestamptz not null default now(),
  check (effective_to > effective_from)
);

create table if not exists nav_sources (
  id uuid primary key default gen_random_uuid(),
  source_code text not null,
  jurisdiction text not null,
  licence_ref text,
  source_url text not null,
  cycle_id uuid not null references nav_cycles(id),
  imported_at timestamptz not null default now(),
  sha256 text not null,
  parser_version text not null,
  unique(source_code,jurisdiction,cycle_id)
);

create table if not exists nav_points (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references nav_sources(id),
  ident text not null,
  point_type text not null,
  country_code text,
  fir_code text,
  latitude double precision not null,
  longitude double precision not null,
  valid_from timestamptz,
  valid_to timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists nav_points_ident_idx on nav_points(upper(ident));
create index if not exists nav_points_context_idx on nav_points(country_code,fir_code,upper(ident));

create table if not exists nav_airways (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references nav_sources(id),
  ident text not null,
  airway_type text,
  country_code text,
  fir_code text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists nav_airways_ident_idx on nav_airways(upper(ident));

create table if not exists nav_airway_segments (
  airway_id uuid not null references nav_airways(id) on delete cascade,
  ordinal integer not null,
  from_point_id uuid not null references nav_points(id),
  to_point_id uuid not null references nav_points(id),
  min_altitude_ft integer,
  max_altitude_ft integer,
  metadata jsonb not null default '{}'::jsonb,
  primary key(airway_id,ordinal)
);

create table if not exists nav_procedures (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references nav_sources(id),
  airport_icao text not null,
  ident text not null,
  procedure_type text not null check (procedure_type in ('SID','STAR','APPROACH','OTHER')),
  transition_name text,
  runway text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists nav_procedures_lookup_idx on nav_procedures(airport_icao,upper(ident),procedure_type);

create table if not exists nav_procedure_legs (
  procedure_id uuid not null references nav_procedures(id) on delete cascade,
  ordinal integer not null,
  point_id uuid references nav_points(id),
  leg_type text,
  course_deg double precision,
  distance_nm double precision,
  metadata jsonb not null default '{}'::jsonb,
  primary key(procedure_id,ordinal)
);

create table if not exists resolver_runs (
  id uuid primary key default gen_random_uuid(),
  flight_job_id uuid references flight_jobs(id),
  capture_id uuid references flight_captures(id),
  resolver_rule_version text not null,
  nav_cycle_id uuid not null references nav_cycles(id),
  nav_cycle_code text not null,
  raw_route text not null,
  origin_icao text,
  destination_icao text,
  status text not null check (status in ('VALID','PARTIAL','AMBIGUOUS','INVALID')),
  confidence text not null check (confidence in ('HIGH','MEDIUM','LOW','NONE')),
  geometry_hash text,
  resolved_geometry jsonb,
  unresolved_tokens jsonb not null default '[]'::jsonb,
  ambiguous_tokens jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists resolver_runs_capture_idx on resolver_runs(capture_id,created_at desc);

create table if not exists resolver_token_decisions (
  id uuid primary key default gen_random_uuid(),
  resolver_run_id uuid not null references resolver_runs(id) on delete cascade,
  ordinal integer not null,
  raw_token text not null,
  token_class text not null,
  decision text not null,
  selected_object_type text,
  selected_object_id uuid,
  confidence text not null,
  reason_code text,
  candidates jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  unique(resolver_run_id,ordinal)
);

comment on table resolver_runs is 'Versioned resolver outputs. Scoring may only consume status=VALID. AIRAC cycle is mandatory and must be effective for the flight instant.';
comment on table resolver_token_decisions is 'Full audit trail for each token; ambiguity is preserved, never guessed.';
