import { neon } from "@neondatabase/serverless";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  select
    j.id as flight_job_id,
    j.fa_flight_id,
    j.ident,
    j.flight_date,
    j.origin,
    j.destination,
    j.scheduled_out_initial,
    j.scheduled_on_initial,
    j.created_at,
    j.closed_at,
    j.final_actual_out,
    j.final_actual_off,
    j.final_actual_on,
    j.final_actual_in,
    j.route_resolution,
    j.terminal_state,
    j.terminal_reason,
    j.scoreable,
    j.actual_runway_on,
    j.branch_validity,
    j.method_a_mean_total_km,
    j.method_a_mean_xtd_km,
    j.method_a_mean_atd_km,
    s.id as method_a_score_id,
    s.baseline_capture_id,
    s.track_id,
    s.checkpoint_pct,
    s.total_error_km,
    s.xtd_km,
    s.atd_km,
    s.scored_at
  from flight_jobs j
  join method_a_scores s on s.flight_job_id = j.id
  order by j.flight_date, j.fa_flight_id, s.checkpoint_pct
`;

const headers = [
  "flight_job_id","fa_flight_id","ident","flight_date","origin","destination",
  "scheduled_out_initial","scheduled_on_initial","created_at","closed_at",
  "final_actual_out","final_actual_off","final_actual_on","final_actual_in",
  "route_resolution","terminal_state","terminal_reason","scoreable","actual_runway_on",
  "branch_validity","method_a_mean_total_km","method_a_mean_xtd_km","method_a_mean_atd_km",
  "method_a_score_id","baseline_capture_id","track_id","checkpoint_pct","total_error_km",
  "xtd_km","atd_km","scored_at"
];

function cell(value) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csv = [
  headers.join(","),
  ...rows.map(row => headers.map(h => cell(row[h])).join(","))
].join("\n") + "\n";

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = resolve(process.argv[2] || "../aevpath-exports");
await mkdir(outputDir, { recursive: true });
const outputPath = resolve(outputDir, `aevpath-scored-method-a-${stamp}.csv`);
await writeFile(outputPath, csv, "utf8");

const uniqueFlights = new Set(rows.map(r => r.flight_job_id)).size;
console.log(JSON.stringify({
  ok: true,
  outputPath,
  scoreRows: rows.length,
  scoredFlights: uniqueFlights
}, null, 2));
