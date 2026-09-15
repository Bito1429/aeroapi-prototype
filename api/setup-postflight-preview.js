import{db}from'./db.js';import{json}from'./lib.js';
export default async function handler(req,res){try{const s=db();const jobs=await s`
select j.id,j.fa_flight_id,j.branch_validity,
       (select count(*)::int from postflight_tracks p where p.flight_job_id=j.id) track_rows_before,
       (select count(*)::int from method_a_scores m where m.flight_job_id=j.id) score_rows_before
from flight_jobs j
where j.created_at>='2026-09-14T19:39:00Z'::timestamptz and j.created_at<'2026-09-14T19:46:00Z'::timestamptz
  and j.scheduled_out_initial>='2026-09-14T20:50:00Z'::timestamptz and j.scheduled_out_initial<='2026-09-14T21:20:00Z'::timestamptz
  and j.terminal_state='SCOREABLE' and j.scoreable=true
  and j.final_actual_off is not null and j.final_actual_on is not null
order by (j.branch_validity='CAVEATED_RUNWAY_UNKNOWN') desc,j.fa_flight_id
limit 10`;
for(const j of jobs){await s`update flight_jobs set status='ACTIVE',closed_at=null,final_actual_off=null,final_actual_on=null,final_actual_in=null where id=${j.id}::uuid`;await s`update flight_checkpoints set state='PENDING',due_after='2000-01-01T00:00:00Z'::timestamptz,captured_at=null,claimed_at=null,error_text=null where flight_job_id=${j.id}::uuid and label='POSTFLIGHT'`;}
json(res,200,{ok:true,selected:jobs.length,jobs});}catch(e){json(res,500,{ok:false,error:e.message})}}
