import {referenceHandler} from "../lib/reference-aa1776-handler.js";
import {makeHandler} from "./chester-aa2398.js";
import {reply,equal} from "../lib/http.js";
import {buildPackage} from "../lib/policy.js";
export default async function(req,res){
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return reply(res,404,{error:"NOT_AVAILABLE"});
 const key="synthetic-contract-test-key-".repeat(3),now=Date.parse("2026-11-27T15:00:00Z"),oldNow=Date.parse("2026-11-26T15:00:00Z");
 const f={fa_flight_id:"TEST-AA2398-CONTRACT",ident:"AAL2398",ident_icao:"AAL2398",origin:{code_icao:"KORD"},destination:{code_icao:"KSEA"},scheduled_out:"2026-11-27T17:30:00Z",estimated_out:"2026-11-27T17:30:00Z",estimated_off:"2026-11-27T17:50:00Z",scheduled_on:"2026-11-27T22:25:00Z",aircraft_type:"TEST",status:"Scheduled"};
 const fixes=[{name:"KORD",latitude:41.9786,longitude:-87.9048},{name:"TEST",latitude:44.8,longitude:-100},{name:"KSEA",latitude:47.4479,longitude:-122.31}];
 const pkg=buildPackage(f,fixes,new Date(now).toISOString(),{synthetic:true});
 const oldPkg=JSON.parse(JSON.stringify(pkg));oldPkg.flight_id="TEST-AA1776-CONTRACT";oldPkg.flight.ident="AAL1776";oldPkg.flight.ident_icao="AAL1776";oldPkg.flight.origin.icao="KPHL";oldPkg.flight.destination.icao="KBOS";oldPkg.flight.scheduled_departure="2026-11-26T17:30:00Z";
 const shift=s=>new Date(Date.parse(s)-86400000).toISOString();
 const base={state:"READY",flight_id:pkg.flight_id,scheduled_out:f.scheduled_out,expires_at:pkg.expires_at,source_captured_at:new Date(now).toISOString(),package_json:pkg,ident:f.ident,scheduled_on:f.scheduled_on};
 const oldBase={upstream_state:"READY",fa_flight_id:oldPkg.flight_id,flight_date:"2026-11-26",scheduled_out:shift(f.scheduled_out),expires_at:shift(pkg.expires_at),source_captured_at:new Date(oldNow).toISOString(),package_json:oldPkg};
 oldPkg.flight.scheduled_arrival=shift(f.scheduled_on);
 const results=[];
 const call=async(h,req)=>{let out;const res={setHeader(){},status(code){return{json(body){out={code,body}}}}};await h(req,res);return out};
 const keys=o=>Object.keys(o).sort().join("|");
 const scenarios=[["ready",{},{}],["pending no row",null,null],["pending with row",{state:"PENDING_ROUTE",package_json:null},{upstream_state:"PENDING_ROUTE",package_json:null}],["departed",{state:"DEPARTED",package_json:null},{upstream_state:"DEPARTED"}],["scheduled departure passed",{scheduled_out:"2026-11-27T14:00:00Z",package_json:null},{scheduled_out:"2026-11-26T14:00:00Z"}],["expired after departure",{scheduled_out:"2026-11-27T13:00:00Z",expires_at:"2026-11-27T14:00:00Z",package_json:null},{scheduled_out:"2026-11-26T13:00:00Z",expires_at:"2026-11-26T14:00:00Z"}],["expired before departure (inconsistent fixture)",{expires_at:"2026-11-27T14:00:00Z",package_json:null},{expires_at:"2026-11-26T14:00:00Z"}],["cancelled",{state:"CANCELLED",package_json:null},{upstream_state:"CANCELLED"}],["missing key",{},{},"missing"],["wrong key",{},{},"wrong"],["unconfigured key",{},{},"unconfigured"],["bad method",{},{},"method"],["bad date",{},{},"date"],["bad mode",{},{},"mode"],["database failure",{},{},"db"]];
 for(const [name,n,o,special] of scenarios){
 for(const mode of special?["package"]:["package","status"]){
 const nr=n===null?null:{...base,...n},or=o===null?null:{...oldBase,...o};
 const newH=makeHandler({readRow:async()=>{if(special==="db")throw Error("synthetic");return nr},now:()=>now,key:()=>special==="unconfigured"?null:key});
 const oldH=referenceHandler({db:()=>async()=>{if(special==="db")throw Error("synthetic");return or?[or]:[]},now:()=>oldNow,json:reply,chesterAuthorized:(q,r)=>{if(special==="unconfigured"){reply(r,503,{error:"CHESTER_ACCESS_NOT_CONFIGURED"});return false}if(!equal(q.headers["x-aevpath-key"],key)){reply(r,401,{error:"CHESTER_UNAUTHORIZED"});return false}return true}});
 const headers=special==="missing"?{}:{"x-aevpath-key":special==="wrong"?"wrong":key};
 const request=date=>({method:special==="method"?"POST":"GET",headers,query:{date:special==="date"?"invalid":date,mode:special==="mode"?"invalid":mode}});
 const a=await call(oldH,request("2026-11-26")),b=await call(newH,request("2026-11-27"));
 const same=a.code===b.code&&keys(a.body)===keys(b.body)&&["status","sale_state","sellable","package_status","error"].every(k=>a.body[k]===b.body[k]);
 results.push({name,mode,aa1776:{http:a.code,keys:keys(a.body),status:a.body.status??null,sale_state:a.body.sale_state??null,error:a.body.error??null},aa2398:{http:b.code,keys:keys(b.body),status:b.body.status??null,sale_state:b.body.sale_state??null,error:b.body.error??null},pass:same});
 }}
 return reply(res,200,{passed:results.filter(x=>x.pass).length,total:results.length,results,actualProviderCalls:0,reference:"b1704ec416d9f8f53718c6c659b3401a4c9c35d4",scope:"Frozen source executed with synthetic fixtures; not live AA1776 requests"});
}
