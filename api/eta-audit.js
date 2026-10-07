import{db}from"./db.js";
import{ETA_CALIBRATION}from"./eta-calibration.js";

export async function persistEtaAudit({
 flightJobId,
 cutoffAt,
 predictedAt=new Date().toISOString(),
 predictedOn=null,
 windowEarly=null,
 windowLate=null,
 baselineSource=ETA_CALIBRATION.baseline_source,
 baselineAtCutoff=null,
 finalActualOn=null,
 predictionVersion=ETA_CALIBRATION.version
}){
 const sql=db();
 const rows=await sql`
   insert into eta_prediction_audit(
     flight_job_id,cutoff_at,prediction_version,predicted_at,predicted_on,
     window_early,window_late,baseline_source,baseline_at_cutoff,final_actual_on
   ) values(
     ${flightJobId}::uuid,${cutoffAt}::timestamptz,${predictionVersion},
     ${predictedAt}::timestamptz,${predictedOn}::timestamptz,
     ${windowEarly}::timestamptz,${windowLate}::timestamptz,${baselineSource},
     ${baselineAtCutoff}::timestamptz,${finalActualOn}::timestamptz
   )
   on conflict(flight_job_id,prediction_version,cutoff_at)
   do update set
     predicted_at=excluded.predicted_at,
     predicted_on=excluded.predicted_on,
     window_early=excluded.window_early,
     window_late=excluded.window_late,
     baseline_source=excluded.baseline_source,
     baseline_at_cutoff=excluded.baseline_at_cutoff,
     final_actual_on=coalesce(excluded.final_actual_on,eta_prediction_audit.final_actual_on)
   returning *
 `;
 return rows[0];
}

export async function finalizeEtaAudit(flightJobId,finalActualOn){
 const sql=db();
 return await sql`
   update eta_prediction_audit
   set final_actual_on=${finalActualOn}::timestamptz
   where flight_job_id=${flightJobId}::uuid
   returning id,prediction_version,cutoff_at,predicted_on,window_early,window_late,final_actual_on
 `;
}
