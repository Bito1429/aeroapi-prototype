// Chester-format system package endpoint. No live provider requests: uses persisted capture only.
// GET /api/chester-package?flight_id=<fa_flight_id>
// Fail closed rather than fabricate missing provider fields.
import {buildDraftPackage} from "./package-core.js";
import {toChesterV1} from "./chester-schema.js";
import {json} from "./lib.js";
export default async function handler(req,res){
 if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});
 const id=typeof req.query?.flight_id==="string"?req.query.flight_id.trim():"";
 if(!id||id.length>160)return json(res,400,{error:"FLIGHT_ID_REQUIRED"});
 try{
  const result=await buildDraftPackage(id);
  if(result.status!==200||result.body?.status!=="READY")return json(res,result.status,result.body);
  const draft=result.body,flight=draft.flight;
  // The gate, takeoff and airport fields come only from persisted AeroAPI capture.
  const origin=flight.origin_airport,destination=flight.destination_airport;
  const airline=flight.airline;
  const aircraftType=flight.aircraft_type;
  // Policy: expire at the first UTC midnight after scheduled landing, as in accepted v3.
  // This is a derived expiry policy, not a provider-observed field.
  const arrivalMs=flight.scheduled_arrival?Date.parse(flight.scheduled_arrival):NaN;
  const expiry=Number.isFinite(arrivalMs)?new Date(Math.floor(arrivalMs/86400000)*86400000+86400000).toISOString():null;
  const packageBody=toChesterV1(draft,{
   airports:{origin,destination},airline,aircraftType,expiresAt:expiry
  });
  res.setHeader("cache-control","private, no-store");
  return json(res,200,packageBody);
 }catch(err){
  if(String(err?.message||"").startsWith("CHESTER_REQUIRED_FIELD:"))
   return json(res,422,{error:"CHESTER_SOURCE_INCOMPLETE",field:err.message.split(":")[1]});
  console.error("chester-package",err);
  return json(res,500,{error:"CHESTER_PACKAGE_BUILD_FAILED"});
 }
}
