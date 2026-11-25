import {chesterAuthorized} from "../lib/chester-auth.js";
// Read-only Chester search over already-enrolled US flight jobs.
// No provider calls, no campaign changes, no secrets returned.
import {db} from "../lib/db.js";
import {json} from "../lib/lib.js";
import {saleState,nextCheckAfter} from "../lib/chester-sale-state.js";
import {aa1776ByDate,aa1776Summary} from "../lib/aa1776-relay.js";
export default async function handler(req,res){
 if(!chesterAuthorized(req,res))return;
 if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});
 const ident=String(req.query?.ident||"").trim().toUpperCase();
 const origin=String(req.query?.origin||"").trim().toUpperCase();
 const destination=String(req.query?.destination||"").trim().toUpperCase();
 if(ident.length>16||origin.length>4||destination.length>4||!(/^[A-Z0-9]*$/.test(ident+origin+destination))) return json(res,400,{error:"INVALID_SEARCH"});
 try{
  const sql=db();
  const rows=await sql`select j.fa_flight_id as flight_id,j.ident,j.origin,j.destination,j.scheduled_out_initial as scheduled_out,j.scheduled_on_initial as scheduled_on,j.status,j.final_actual_out,
    c.captured_at as last_capture_at,c.estimated_out,c.canonical_fix_count,c.actual_out_seen,
    c.raw_capture, (c.raw_capture->'protocol'->>'canonical_route') is not null as has_route
   from flight_jobs j
   left join lateral (select captured_at,estimated_out,canonical_fix_count,actual_out_seen,raw_capture from flight_captures c where c.flight_job_id=j.id order by captured_at desc limit 1) c on true
   where j.scheduled_out_initial > now()-interval '2 hours' and j.scheduled_out_initial < now()+interval '48 hours'
     and (${ident}='' or upper(j.ident)=${ident})
     and (${origin}='' or j.origin=${origin})
     and (${destination}='' or j.destination=${destination})
   order by j.scheduled_out_initial asc,j.fa_flight_id asc limit 30`;
  const flights=rows.map(({raw_capture,...r})=>{const state=saleState({...r,raw_capture});return {...r,sale_state:state,sellable:state==="SELLABLE",package_status:r.has_route?"CAPTURE_AVAILABLE":"PENDING_CAPTURE",...(state==="PENDING_ROUTE"?{check_again_after:nextCheckAfter()}: {})}});
  // Include only a genuine AA1776 that the separate US collector has already captured.
  // No invented flight/date and no provider call from Chester.
  if((!ident||ident==="AA1776"||ident==="AAL1776")&&(!origin||origin==="KPHL")&&(!destination||destination==="KBOS")){
   const now=Date.now();
   for(const day of ["2026-11-24","2026-11-25","2026-11-26"]){
    const a=await aa1776ByDate(sql,day);
    if(!a)continue;
    const out=Date.parse(a.scheduled_out);
    if(out<=now-2*3600000||out>=now+48*3600000)continue;
    if(!flights.some(f=>f.flight_id===a.fa_flight_id))flights.push(aa1776Summary(a));
   }
   flights.sort((a,b)=>Date.parse(a.scheduled_out)-Date.parse(b.scheduled_out));
  }
  res.setHeader("cache-control","private, no-store");
  return json(res,200,{generated_at:new Date().toISOString(),source:"stored_us_flight_jobs_and_aa1776_derived_relay",flights:flights.slice(0,30)});
 }catch(e){console.error("chester-search",e);return json(res,500,{error:"SEARCH_UNAVAILABLE"});}
}
