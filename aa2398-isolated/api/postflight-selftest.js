import {postflight} from "../lib/postflight.js";
import {reply} from "../lib/http.js";
export default async function(req,res){
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return reply(res,404,{error:"NOT_AVAILABLE"});
 const id="TEST-POSTFLIGHT-AA2398",off="2026-11-27T17:50:00Z",on="2026-11-27T21:50:00Z",now=()=>Date.parse("2026-11-27T23:15:00Z");
 const f={fa_flight_id:id,ident_icao:"AAL2398",origin:{code_icao:"KORD"},destination:{code_icao:"KSEA"},scheduled_out:"2026-11-27T17:30:00Z",actual_off:off,actual_on:on};
 const pkg={schema:"aevpath.package.v1",market:"US",flight_id:id,package_version:"test",generated_at:"2026-11-27T15:00:00Z",flight:{ident_icao:"AAL2398",origin:{icao:"KORD"},destination:{icao:"KSEA"}},route:{line:[[41.98,-87.9],[44.8,-100],[47.45,-122.31]]},eta:{expected_airborne_min:235.7,airborne_window_min:{earliest:219.7,latest:251.7},departure:{estimated_off:off}}};
 const track={fa_flight_id:id,positions:pkg.route.line.map(([latitude,longitude],i)=>({latitude,longitude,timestamp:new Date(Date.parse(off)+i*7200000).toISOString()}))};
 const tests=[];
 for(const [name,patch,expected,calls] of [["valid",{},"SCORED",2],["disabled",{claim:"DISABLED"},"DISABLED",0],["no landing",{f:{...f,actual_on:null}},"POSTFLIGHT_FAILED",1],["wrong route",{f:{...f,destination:{code_icao:"KBOS"}}},"POSTFLIGHT_FAILED",1],["wrong id",{f:{...f,fa_flight_id:"WRONG"}},"POSTFLIGHT_FAILED",1],["future landing",{f:{...f,actual_on:"2026-11-28T01:00Z"}},"POSTFLIGHT_FAILED",1],["unknown arrival equal times",{f:{...f,actual_on:off}},"POSTFLIGHT_FAILED",1],["confirm denied",{confirm:"DISABLED"},"POSTFLIGHT_FAILED",1],["track denied",{trackClaim:"DISABLED"},"DISABLED",1],["track failure",{trackFailure:true},"POSTFLIGHT_FAILED",2],["duplicate",{claim:"CAP_OR_DUPLICATE",trackClaim:"NO_CONFIRMED_LANDING"},"NO_CONFIRMED_LANDING",0]]){
 let n=0,confirmed=false,saved=null,alert=0;
 const result=await postflight({now,claimStatus:async()=>({status:patch.claim||"CLAIMED",flight_id:id}),status:async()=>{n++;return {flights:[patch.f||f]}},confirm:async()=>{confirmed=true;return patch.confirm||"CONFIRMED"},claimTrack:async()=>({status:patch.trackClaim||(confirmed?"CLAIMED":"NO_CONFIRMED_LANDING"),flight_id:id,package:pkg,actual_off:off,actual_on:on}),track:async()=>{n++;if(patch.trackFailure)throw Error("synthetic");return track},finish:async(s)=>{saved=s;return "RECORDED"},alert:async()=>{alert++}});
 tests.push({name,actual:result.status,calls:n,pass:result.status===expected&&n===calls&&(name!=="valid"||saved?.mean_total_km===0)&&(expected!=="POSTFLIGHT_FAILED"||alert===1)});
 }
 return reply(res,200,{passed:tests.filter(t=>t.pass).length,total:tests.length,tests,actualProviderCalls:0});
}
