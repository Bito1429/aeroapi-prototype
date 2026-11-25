import {buildPackage} from "../lib/policy.js";
import {reply} from "../lib/http.js";
import {createHash} from "node:crypto";
export default async function(req,res){
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview"||!process.env.AA2398_LIFECYCLE_DELIVERY_URL)return reply(res,404,{error:"NOT_AVAILABLE"});
 if(req.query?.action==="fixture"){
 const now=new Date().toISOString(),f={fa_flight_id:"TEST-AA2398-LIFECYCLE",ident:"AAL2398",ident_icao:"AAL2398",origin:{code_icao:"KORD"},destination:{code_icao:"KSEA"},scheduled_out:"2026-11-27T17:30:00Z",estimated_out:"2026-11-27T17:30:00Z",estimated_off:"2026-11-27T17:50:00Z",scheduled_on:"2026-11-27T22:25:00Z",aircraft_type:"TEST",status:"Scheduled"};
 const fixes=[{name:"KORD",latitude:41.9786,longitude:-87.9048},{name:"TEST1",latitude:44.8,longitude:-100},{name:"TEST2",latitude:47.3,longitude:-113},{name:"KSEA",latitude:47.4479,longitude:-122.31}];
 return reply(res,200,{package:buildPackage(f,fixes,now,{synthetic:true})});
 }
 const host=process.env.VERCEL_URL;if(!/^aevpath-aa2398-test-20261127-[a-z0-9-]+\.vercel\.app$/.test(host||""))return reply(res,503,{error:"INVALID_HOST"});
 const key=process.env.AA2398_CHESTER_KEY,bypass=process.env.AA2398_LIFECYCLE_BYPASS;
 if(!key||!bypass)return reply(res,503,{error:"TEST_NOT_CONFIGURED"});
 const url="https://"+host+"/api/chester-aa2398?date=2026-11-27&mode=package";
 try{
 const r=await fetch(url,{headers:{"x-aevpath-key":key,"x-vercel-protection-bypass":bypass},redirect:"manual",signal:AbortSignal.timeout(10000)});
 const p=await r.json();const ok=r.status===200&&p.flight_id==="TEST-AA2398-LIFECYCLE"&&p.candidate_metadata?.synthetic===true;
 return reply(res,200,{actualHttpStatus:r.status,packageReturned:ok,flightId:p.flight_id||null,state:p.status||null,saleState:p.sale_state||null,bodyKeys:Object.keys(p).sort(),packageHash:ok?createHash("sha256").update(JSON.stringify(p)).digest("hex"):null,durationMinutes:ok?p.eta.expected_airborne_min:null,window:ok?p.eta.airborne_window_min:null});
 }catch{return reply(res,503,{error:"HTTP_TEST_FAILED"});}
}
