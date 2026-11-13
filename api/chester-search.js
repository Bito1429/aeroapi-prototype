import {chesterAuthorized} from "./chester-auth.js";
import {db} from "./db.js";
import {json} from "./lib.js";
import {saleState,nextCheckAfter} from "./chester-sale-state.js";
// Search stored US flight jobs and only the derived package table. No raw captures.
const toIcao=raw=>{const c=String(raw||"").trim().toUpperCase();return c.length===3?({ANC:"PANC",FAI:"PAFA",HNL:"PHNL",OGG:"PHOG",GUM:"PGUM"})[c]||"K"+c:c};
export default async function handler(req,res){
 if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});
 if(!chesterAuthorized(req,res))return;
 const ident=String(req.query?.ident||"").trim().toUpperCase(),origin=toIcao(req.query?.origin),destination=toIcao(req.query?.destination);
 if(ident.length>16||origin.length>4||destination.length>4||!/^[A-Z0-9]*$/.test(ident+origin+destination))return json(res,400,{error:"INVALID_SEARCH"});
 try{
  const sql=db();
  const rows=await sql`SELECT j.fa_flight_id AS flight_id,j.ident,j.origin,j.destination,
   j.scheduled_out_initial AS scheduled_out,j.scheduled_on_initial AS scheduled_on,
   j.status,j.final_actual_out,p.flight_id IS NOT NULL AS has_route,
   p.generated_at AS last_capture_at
   FROM public.flight_jobs j LEFT JOIN public.chester_ready_packages p
    ON p.flight_id=j.fa_flight_id AND p.expires_at>now()
   WHERE j.scheduled_out_initial>now()-interval '2 hours' AND j.scheduled_out_initial<now()+interval '48 hours'
    AND (${ident}='' OR upper(j.ident)=${ident})
    AND (${origin}='' OR j.origin=${origin})
    AND (${destination}='' OR j.destination=${destination})
   ORDER BY (p.flight_id IS NOT NULL) DESC,j.scheduled_out_initial,j.fa_flight_id LIMIT 30`;
  res.setHeader("cache-control","private, no-store");
  return json(res,200,{generated_at:new Date().toISOString(),source:"stored_us_flight_jobs_and_derived_packages",
   flights:rows.map(r=>{const state=saleState(r);return {...r,sale_state:state,sellable:state==="SELLABLE",
    package_status:r.has_route?"READY":"PENDING_CAPTURE",...(state==="PENDING_ROUTE"?{check_again_after:nextCheckAfter()}:{} )}})});
 }catch(e){console.error("chester-search",e);return json(res,500,{error:"SEARCH_UNAVAILABLE"});}
}
