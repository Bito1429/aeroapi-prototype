import {chesterAuthorized} from "./chester-auth.js";
import {db} from "./db.js";
import {json} from "./lib.js";
import {saleState,nextCheckAfter} from "./chester-sale-state.js";
// No raw provider capture reads. Details only use US job and derived package.
export default async function handler(req,res){
 if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});
 if(!chesterAuthorized(req,res))return;
 const id=String(req.query?.flight_id||"").trim();
 if(!/^[A-Za-z0-9_-]{1,90}$/.test(id))return json(res,400,{error:"FLIGHT_ID_REQUIRED"});
 try{
  const sql=db();
  const rows=await sql`SELECT j.fa_flight_id AS flight_id,j.ident,j.origin,j.destination,j.status,
    j.scheduled_out_initial AS scheduled_out,j.scheduled_on_initial AS scheduled_on,
    j.final_actual_out,p.package_json,p.generated_at AS last_capture_at,p.flight_id IS NOT NULL AS has_route
    FROM public.flight_jobs j LEFT JOIN public.chester_ready_packages p
    ON p.flight_id=j.fa_flight_id AND p.expires_at>now() WHERE j.fa_flight_id=${id} LIMIT 1`;
  if(!rows.length)return json(res,404,{error:"FLIGHT_NOT_FOUND"});
  const r=rows[0],state=saleState(r),p=r.package_json||{},flight=p.flight||{};
  const {package_json,...plain}=r;
  const output={...plain,estimated_out:flight.estimated_out||null,estimated_off:p.eta?.departure?.estimated_off||null,
   aircraft_type:flight.aircraft_type||null,filed_ete_seconds:Number.isFinite(p.eta?.expected_airborne_min)?Math.round(p.eta.expected_airborne_min*60):null,
   airline:flight.airline||null,sale_state:state,sellable:state==="SELLABLE",
   package_status:r.has_route?"READY":"PENDING_CAPTURE",
   check_again_after:state==="PENDING_ROUTE"?nextCheckAfter():null,
   package_url:"/api/chester-package?flight_id="+encodeURIComponent(id)};
  res.setHeader("cache-control","private, no-store");
  return json(res,200,{generated_at:new Date().toISOString(),source:"stored_us_flight_jobs_and_derived_packages",sale_state:state,flight:output});
 }catch(e){console.error("chester-details",e);return json(res,500,{error:"DETAILS_UNAVAILABLE"});}
}
