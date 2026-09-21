import{db}from"./db.js";
import{createHash}from"node:crypto";
export default async function handler(req,res){
  try{
    const s=db();
    const rows=await s`
      select j.fa_flight_id,j.ident,j.origin,j.destination,
             j.scheduled_out_initial,j.scheduled_on_initial,
             fc.id::text as baseline_capture_id,fc.captured_at
      from flight_jobs j
      join lateral (
        select id,captured_at
        from flight_captures
        where flight_job_id=j.id
          and captured_at<j.scheduled_out_initial
        order by captured_at desc,id desc
        limit 1
      ) fc on true
      where j.scheduled_out_initial >= '2026-09-03T00:00:00Z'::timestamptz
        and j.scheduled_out_initial <  '2026-09-21T00:00:00Z'::timestamptz
        and j.scheduled_on_initial is not null
        and extract(epoch from (j.scheduled_on_initial-j.scheduled_out_initial))/60.0 > 240
        and (j.origin like 'K%' or j.origin like 'P%')
        and (j.destination like 'K%' or j.destination like 'P%')
      order by j.fa_flight_id asc
    `;
    const uniq=new Map();
    for(const r of rows)if(!uniq.has(r.fa_flight_id))uniq.set(r.fa_flight_id,r);
    const eligible=[...uniq.values()].map(r=>({
      fa_flight_id:r.fa_flight_id,ident:r.ident,origin:r.origin,destination:r.destination,
      scheduled_out_initial:r.scheduled_out_initial,scheduled_on_initial:r.scheduled_on_initial,
      scheduled_minutes:(new Date(r.scheduled_on_initial)-new Date(r.scheduled_out_initial))/60000,
      baseline_capture_id:r.baseline_capture_id,captured_at:r.captured_at,
      selection_hash:createHash("sha256").update(String(r.fa_flight_id)).digest("hex")
    })).sort((a,b)=>a.selection_hash.localeCompare(b.selection_hash)||String(a.fa_flight_id).localeCompare(String(b.fa_flight_id)));
    const dev=[],holdout=[];
    eligible.forEach((r,i)=>{const x={rank:i,...r};if(i%2===0){if(dev.length<100)dev.push(x)}else{if(holdout.length<100)holdout.push(x)}});
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ok:true,eligible_n:eligible.length,dev_n:dev.length,holdout_n:holdout.length,dev,holdout});
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
