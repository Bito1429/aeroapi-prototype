import {collect} from "../lib/policy.js";
import {scoreTrack} from "../lib/score-policy.js";
import {reply} from "../lib/http.js";
import {randomUUID} from "node:crypto";
export default async function(req,res){
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return reply(res,404,{error:"NOT_AVAILABLE"});
 const marker="RAW_ONLY_"+randomUUID(),now="2026-11-27T15:00:00Z",off="2026-11-27T17:50:00Z",on="2026-11-27T21:50:00Z";
 const f={fa_flight_id:"TEST-RAW-AA2398",ident:"AAL2398",ident_icao:"AAL2398",origin:{code_icao:"KORD",raw:marker},destination:{code_icao:"KSEA",raw:marker},scheduled_out:"2026-11-27T17:30:00Z",estimated_out:"2026-11-27T17:30:00Z",estimated_off:off,scheduled_on:"2026-11-27T22:25:00Z",aircraft_type:"TEST",status:"Scheduled",raw:marker};
 const fixes=[{name:"KORD",latitude:41.9786,longitude:-87.9048,raw:marker},{name:"TEST",latitude:44.8,longitude:-100,raw:marker},{name:"KSEA",latitude:47.4479,longitude:-122.31,raw:marker}];
 const writes=[],checks=[],check=(name,pass)=>checks.push({name,pass:!!pass});
 const run=async patch=>collect({now,requestId:randomUUID,claim:async()=>"CLAIMED",reserve:async()=>"RESERVED",lookup:async()=>({flights:[f],raw:marker}),route:async()=>({fixes,raw:marker}),mark:async(s,r)=>writes.push({state:s,reason:r}),store:async p=>{writes.push(p);return "STORED"},...patch});
 const r=await run({});const pkg=writes[0];check("collection derives package",r.status==="READY"&&r.providerCalls===2&&pkg.schema==="aevpath.package.v1");check("raw lookup and route sentinel absent from stored package",!JSON.stringify(writes).includes(marker));
 const rawTrack={fa_flight_id:pkg.flight_id,raw:marker,positions:pkg.route.line.map(([latitude,longitude],i)=>({latitude,longitude,timestamp:new Date(Date.parse(off)+i*7200000).toISOString(),raw:marker}))};
 const score=scoreTrack(pkg,rawTrack,off,on);check("derived score only",score.checkpoints.length===5&&score.mean_total_km===0&&!JSON.stringify(score).includes(marker)&&!Object.hasOwn(score,"positions"));
 writes.length=0;const failed=await run({route:async()=>{throw Error(marker)}});check("provider failure does not leak raw error",failed.status==="PENDING_SOURCE"&&!JSON.stringify([writes,failed]).includes(marker));
 writes.length=0;const invalid=await run({route:async()=>({fixes:[{name:marker,latitude:null,longitude:null}]})});check("malformed route not stored",invalid.status==="PENDING_ROUTE"&&writes.every(x=>!x.schema)&&!JSON.stringify(writes).includes(marker));
 writes.length=0;const disabled=await run({claim:async()=>"DISABLED"});check("disabled no provider calls or storage",disabled.providerCalls===0&&writes.length===0);
 return reply(res,200,{passed:checks.filter(x=>x.pass).length,total:checks.length,checks,actualProviderCalls:0,scope:"Synthetic provider bodies through production collect and score functions; storage callback capture, not live raw data"});
}
