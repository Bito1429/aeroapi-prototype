import{chesterAuthorized}from"../lib/chester-auth.js";
import{db}from"../lib/db.js";
import{json}from"../lib/lib.js";
import{aa1776ByDate,aa1776SaleState,aa1776Summary,ALLOWED_DATES}from"../lib/aa1776-relay.js";
// Stable Chester-only test endpoint. GET /api/chester-aa1776?date=2026-11-24&mode=package
// Uses existing Chester shared key; reads only the temporary DERIVED US package.
export default async function handler(req,res){
 res.setHeader("cache-control","private, no-store");
 if(!chesterAuthorized(req,res))return;
 if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});
 const date=String(req.query?.date||"");
 const mode=String(req.query?.mode||"package");
 if(!ALLOWED_DATES.has(date)||!["package","status"].includes(mode))
  return json(res,400,{error:"AA1776_DATE_OR_MODE_INVALID"});
 try{
  const row=await aa1776ByDate(db(),date);
  if(!row)return json(res,202,{status:"PENDING_ROUTE",sale_state:"PENDING_ROUTE",
   sellable:false,flight_date:date,check_again_after:new Date(Date.now()+15*60000).toISOString()});
  const state=aa1776SaleState(row);
  if(mode==="status")return json(res,200,{flight_date:date,...aa1776Summary(row)});
  // One-off authenticated replay: 24 Nov only, direct package endpoint, until midnight UTC.
  const replayNow=Date.now();
  const pkg=row.package_json;
  if(date==="2026-11-24"&&mode==="package"&&state==="DEPARTED"&&
     replayNow<Date.parse("2026-11-26T00:00:00Z")&&
     row.upstream_state==="READY"&&
     Date.parse(row.scheduled_out)<=replayNow&&
     Date.parse(row.expires_at)>replayNow&&Date.parse(pkg?.expires_at)>replayNow&&
     row.fa_flight_id==="AAL1776-1795337810-airline-1217p"&&
     pkg?.flight_id===row.fa_flight_id&&pkg?.schema==="aevpath.package.v1"&&pkg?.market==="US"&&
     String(pkg?.flight?.scheduled_departure||"").slice(0,10)==="2026-11-24"&&
     pkg?.flight?.origin?.icao==="KPHL"&&pkg?.flight?.destination?.icao==="KBOS")
   return json(res,200,pkg);
  // One-off authenticated replay: 25 Nov only, direct package, until 18:00 UTC 26 Nov.
  if(date==="2026-11-25"&&mode==="package"&&state==="DEPARTED"&&
     replayNow<Date.parse("2026-11-26T18:00:00Z")&&
     row.upstream_state==="READY"&&
     Date.parse(row.scheduled_out)<=replayNow&&
     Date.parse(row.expires_at)>replayNow&&Date.parse(pkg?.expires_at)>replayNow&&
     row.fa_flight_id==="AAL1776-1795422387-airline-1404p"&&
     pkg?.flight_id===row.fa_flight_id&&pkg?.schema==="aevpath.package.v1"&&pkg?.market==="US"&&
     String(pkg?.flight?.scheduled_departure||"").slice(0,10)==="2026-11-25"&&
     pkg?.flight?.origin?.icao==="KPHL"&&pkg?.flight?.destination?.icao==="KBOS")
   return json(res,200,pkg);
  if(state==="DEPARTED"||state==="CANCELLED")
   return json(res,409,{status:state,sale_state:state,sellable:false,flight_date:date});
  if(state!=="SELLABLE")
   return json(res,202,{status:"PENDING_ROUTE",sale_state:state,sellable:false,
    flight_date:date,check_again_after:new Date(Date.now()+15*60000).toISOString()});
  return json(res,200,row.package_json);
 }catch(e){
  // No raw provider responses, secrets or database diagnostics in user-visible output.
  console.error("chester-aa1776",e?.message);
  return json(res,500,{error:"AA1776_PACKAGE_UNAVAILABLE"});
 }
}
