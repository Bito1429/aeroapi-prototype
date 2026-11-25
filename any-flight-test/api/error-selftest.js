import {makeDelivery} from "../delivery.mjs";
import {alert} from "../read-db.mjs";
export default async function(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const key=process.env.ANY_FLIGHT_TEST_KEY;
 if(typeof key!=="string"||key.length<32)return res.status(503).json({error:"TEST_ENV_MISSING"});
 const cases=[];
 for(const mode of ["read","rate","package"]){
  let body,status,headers={};
  const handler=makeDelivery({secret:key,rate:async()=>{if(mode==="rate")throw Error("SIMULATED");return "ALLOWED";},read:async()=>{if(mode==="read")throw Error("SIMULATED");return {flight_id:"SYNTHETIC-ERROR",state:"READY",scheduled_out:new Date(Date.now()+3600000).toISOString(),expires_at:new Date(Date.now()+7200000).toISOString(),package_json:{}};},alert})(mode==="package"?"package":"search");
  await handler({method:"GET",headers:{"x-aevpath-key":key},query:{flight_id:"SYNTHETIC-ERROR"}},{set statusCode(v){status=v;},setHeader(k,v){headers[k]=v;},end(v){body=JSON.parse(v);}});
  cases.push({mode,status,error:body?.error,request_id:body?.request_id,matched:headers["x-request-id"]===body?.request_id});
 }
 return res.status(200).json({synthetic:true,cases});
}
