import {chesterAuthorized} from "./chester-auth.js";
// Read-only Chester flight details. Capture state is genuine; no invented readiness.
import {db} from "./db.js";
import {json} from "./lib.js";
export default async function handler(req,res){
 if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});
 if(!chesterAuthorized(req,res))return;
 const id=String(req.query?.flight_id||"").trim();
 if(!id||id.length>160)return json(res,400,{error:"FLIGHT_ID_REQUIRED"});
 try{
  const sql=db();
  const rows=await sql`select j.fa_flight_id as flight_id,j.ident,j.origin,j.destination,
   j.scheduled_out_initial as scheduled_out,j.scheduled_on_initial as scheduled_on,j.status,
   c.captured_at as last_capture_at,c.estimated_out,c.estimated_off,c.canonical_fix_count,
   (c.raw_capture->'protocol'->>'canonical_route') is not null as has_route
   from flight_jobs j left join lateral
    (select captured_at,estimated_out,estimated_off,canonical_fix_count,raw_capture
     from flight_captures where flight_job_id=j.id order by captured_at desc limit 1) c on true
   where j.fa_flight_id=${id} limit 1`;
  if(!rows.length)return json(res,404,{error:"FLIGHT_NOT_FOUND"});
  const r=rows[0];res.setHeader("cache-control","private, no-store");
  return json(res,200,{generated_at:new Date().toISOString(),source:"stored_us_flight_jobs",flight:{...r,package_status:r.has_route?"CAPTURE_AVAILABLE":"PENDING_CAPTURE",package_url:"/api/chester-package?flight_id="+encodeURIComponent(id)}});
 }catch(e){console.error("chester-details",e);return json(res,500,{error:"DETAILS_UNAVAILABLE"});}
}
