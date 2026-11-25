import {neon} from "@neondatabase/serverless";
import {randomUUID} from "node:crypto";
import {collect,buildPackage,selectFlight,eligibility,TIMING} from "../lib/policy.js";
import {equal,deliveryState,reply} from "../lib/http.js";
export default async function handler(req,res){
 if(req.method!=="GET")return reply(res,405,{error:"METHOD_NOT_ALLOWED"});
 const now="2026-11-27T15:00:00Z",flight={fa_flight_id:"TEST-AA2398-001",ident:"AAL2398",ident_icao:"AAL2398",origin:{code_icao:"KORD"},destination:{code_icao:"KSEA"},scheduled_out:"2026-11-27T17:30:00Z",estimated_out:"2026-11-27T17:30:00Z",estimated_off:"2026-11-27T17:50:00Z",scheduled_on:"2026-11-27T22:25:00Z",aircraft_type:"TEST",status:"Scheduled"};
 const fixes=[{name:"KORD",latitude:41.9786,longitude:-87.9048},{name:"TEST1",latitude:44.8,longitude:-100},{name:"TEST2",latitude:47.3,longitude:-113},{name:"KSEA",latitude:47.4479,longitude:-122.31}];
 const checks=[],check=(name,pass)=>checks.push({name,pass:!!pass});
 const p=buildPackage(flight,fixes,now,{synthetic:true});
 check("Chester shape",p.schema==="aevpath.package.v1"&&p.test_only===true&&p.flight.origin.icao==="KORD"&&p.flight.destination.icao==="KSEA"&&p.corridor.polygon.length>3);
 check("derived historical duration",p.eta.expected_airborne_min===TIMING.seconds/60&&p.eta.airborne_window_min.latest-p.eta.expected_airborne_min===16);
 check("original modeled profile",p.timeline[0].phase==="takeoff"&&p.timeline.at(-1).phase==="landing"&&p.timeline.some(x=>x.phase==="climb")&&p.timeline.some(x=>x.phase==="descent"));
 check("reverse flight refused",!selectFlight([{...flight,origin:flight.destination,destination:flight.origin}]).flight);
 check("wrong date refused",!selectFlight([{...flight,scheduled_out:"2026-11-26T17:30:00Z"}]).flight);
 check("duplicate flight refused",!selectFlight([flight,flight]).flight);
 check("actual off blocks",eligibility({...flight,actual_off:now},now)==="DEPARTED");
 check("missing estimates blocks",eligibility({...flight,estimated_off:null},now)==="PENDING_SOURCE");
 check("expired delivery denied",deliveryState({state:"READY",scheduled_out:flight.scheduled_out,expires_at:p.expires_at,package_json:p},Date.parse(p.expires_at))==="DEPARTED");
 check("date precision",deliveryState({state:"READY",scheduled_out:new Date(flight.scheduled_out),expires_at:new Date(p.expires_at),package_json:p},Date.parse(now))==="READY");
 check("auth rejects wrong key",!equal("wrong","a".repeat(64))&&equal("a".repeat(64),"a".repeat(64)));
 for(const [name,patch,want,calls] of [["disabled",{claim:async()=>"DISABLED"},"DISABLED",0],["cap",{reserve:async()=>"CAP_REACHED"},"CAP_REACHED",0],["wrong route",{lookup:async()=>({flights:[]})},"PENDING_SOURCE",1],["valid",{},"READY",2]]){
 let n=0;let saved=false;
 const base={claim:async()=>"CLAIMED",reserve:async()=>"RESERVED",lookup:async()=>({flights:[flight]}),route:async()=>({fixes}),mark:async()=>{},store:async()=>{saved=true;return "STORED"},now,requestId:randomUUID};
 const d={...base,...patch};for(const k of ["lookup","route"]){const fn=d[k];d[k]=async(...a)=>{n++;return fn(...a)}}
 const r=await collect(d);check(name,r.status===want&&n===calls&&(name!=="valid"||saved));
 }
 try{
 const w=neon(process.env.AA2398_RUNTIME_URL),d=neon(process.env.AA2398_DELIVERY_URL);
 const [c]=await w`SELECT aa2398.claim_slot() AS result`;check("real DB collector disabled",c.result==="DISABLED");
 const [r]=await w`SELECT aa2398.reserve(${randomUUID()}::uuid,'LOOKUP') AS result`;check("real DB reservation disabled",r.result==="DISABLED");
 const [s]=await d`SELECT state,package_json FROM aa2398.delivery`;check("real DB no package",s.state==="DISABLED"&&s.package_json===null);
 let denied=false;try{await d`SELECT * FROM aa2398.relay`}catch(e){denied=e.code==="42501"}check("direct table access denied",denied);
 }catch{check("restricted runtime database",false)}
 return reply(res,200,{passed:checks.filter(x=>x.pass).length,total:checks.length,checks,actualProviderCalls:0,syntheticPackage:{durationMinutes:p.eta.expected_airborne_min,waypoints:p.route.waypoints.length,timelinePoints:p.timeline.length,expiresAt:p.expires_at}});
}
