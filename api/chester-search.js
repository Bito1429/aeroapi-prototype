import {chesterAuthorized} from "./chester-auth.js";
// Read-only Chester search over already-enrolled US flight jobs.
// No provider calls, no campaign changes, no secrets returned.
import {db} from "./db.js";
import {json} from "./lib.js";
import {saleState,nextCheckAfter} from "./chester-sale-state.js";
export default async function handler(req,res){
 if(req.method!=="GET") return json(res,405,{error:"METHOD_NOT_ALLOWED"});
 if(!chesterAuthorized(req,res))return;
 const ident=String(req.query?.ident||"").trim().toUpperCase();
 const normalizeAirport=raw=>{const code=String(raw||"").trim().toUpperCase();if(code.length!==3)return code;return ({ANC:"PANC",FAI:"PAFA",HNL:"PHNL",OGG:"PHOG",GUM:"PGUM"})[code]||"K"+code;};
 const origin=normalizeAirport(req.query?.origin);
 const destination=normalizeAirport(req.query?.destination);
 if(ident.length>16||origin.length>4||destination.length>4||!(/^[A-Z0-9]*$/.test(ident+origin+destination))) return json(res,400,{error:"INVALID_SEARCH"});
 try{
  const sql=db();
  const rows=await sql`select j.fa_flight_id as flight_id,j.ident,j.origin,j.destination,j.scheduled_out_initial as scheduled_out,j.scheduled_on_initial as scheduled_on,j.status,j.final_actual_out,
    c.captured_at as last_capture_at,c.canonical_fix_count,c.actual_out_seen,c.raw_capture,
    (c.raw_capture->'protocol'->>'canonical_route') is not null as has_route
   from flight_jobs j
   left join lateral (select captured_at,canonical_fix_count,actual_out_seen,raw_capture from flight_captures c where c.flight_job_id=j.id order by captured_at desc limit 1) c on true
   where j.scheduled_out_initial > now()-interval '2 hours' and j.scheduled_out_initial < now()+interval '48 hours'
     and (${ident}='' or upper(j.ident)=${ident})
     and (${origin}='' or j.origin=${origin})
     and (${destination}='' or j.destination=${destination})
   order by j.scheduled_out_initial asc,j.fa_flight_id asc limit 30`;
  res.setHeader("cache-control","private, no-store");
  return json(res,200,{generated_at:new Date().toISOString(),source:"stored_us_flight_jobs",flights:rows.map(({raw_capture,...r})=>{const state=saleState({...r,raw_capture});return {...r,sale_state:state,sellable:state==="SELLABLE",package_status:r.has_route?"CAPTURE_AVAILABLE":"PENDING_CAPTURE",...(state==="PENDING_ROUTE"?{check_again_after:nextCheckAfter()}:{} )}})});
 }catch(e){console.error("chester-search",e);return json(res,500,{error:"SEARCH_UNAVAILABLE"});}
}
