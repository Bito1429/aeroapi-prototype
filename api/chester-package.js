import {chesterAuthorized} from "./chester-auth.js";
import {db} from "./db.js";
import {json} from "./lib.js";
import {nextCheckAfter} from "./chester-sale-state.js";
// Read ONLY finished AevPath-owned derived US packages. No FlightAware calls,
// no reads of FlightAware raw-capture columns or the Europe trial.
export default async function handler(req,res){
 if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});
 if(!chesterAuthorized(req,res))return;
 const id=typeof req.query?.flight_id==="string"?req.query.flight_id.trim():"";
 if(!/^[A-Za-z0-9_-]{1,90}$/.test(id))return json(res,400,{error:"FLIGHT_ID_REQUIRED"});
 try{
  const sql=db();
  const rows=await sql`SELECT package_json,etag,expires_at FROM public.chester_ready_packages WHERE flight_id=${id} LIMIT 1`;
  if(rows.length){
   const row=rows[0];
   if(Date.parse(row.expires_at)<=Date.now())return json(res,410,{error:"PACKAGE_EXPIRED",flight_id:id});
   res.setHeader("etag",row.etag);
   res.setHeader("cache-control","private, max-age=300, must-revalidate");
   if(req.headers["if-none-match"]===row.etag){res.statusCode=304;return res.end();}
   return json(res,200,row.package_json);
  }
  const jobs=await sql`SELECT status,final_actual_out,origin,destination,scheduled_on_initial FROM public.flight_jobs WHERE fa_flight_id=${id} LIMIT 1`;
  if(!jobs.length)return json(res,404,{error:"FLIGHT_NOT_FOUND"});
  const j=jobs[0];
  if(j.scheduled_on_initial&&Date.parse(j.scheduled_on_initial)+7*86400000<Date.now())return json(res,410,{error:"PACKAGE_EXPIRED",flight_id:id});
  let state="PENDING_ROUTE";
  if(/cancel/i.test(String(j.status||"")))state="CANCELLED";
  else if(j.final_actual_out)state="DEPARTED";
  else if(!String(j.origin).startsWith("K")||!String(j.destination).startsWith("K"))state="UNSUPPORTED_MARKET";
  if(state!=="PENDING_ROUTE")return json(res,200,{status:state,sale_state:state,sellable:false,flight_id:id});
  res.setHeader("cache-control","private, no-store");
  return json(res,202,{status:"PENDING_ROUTE",sale_state:"PENDING_ROUTE",sellable:false,
   retryable:true,flight_id:id,check_again_after:nextCheckAfter()});
 }catch(e){console.error("chester-stored-package",e);return json(res,500,{error:"PACKAGE_STORE_UNAVAILABLE"});}
}
