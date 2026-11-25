import {neon} from "@neondatabase/serverless";
import {scoreTrack} from "../lib/score-policy.js";
import {reply} from "../lib/http.js";
export default async function(req,res){
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return reply(res,404,{error:"NOT_AVAILABLE"});
 const off="2026-11-27T17:50:00Z",on="2026-11-27T21:50:00Z",pkg={schema:"aevpath.package.v1",market:"US",flight_id:"TEST-AA2398-SCORE",package_version:"synthetic-v1",generated_at:"2026-11-27T15:00:00Z",flight:{ident_icao:"AAL2398",origin:{icao:"KORD"},destination:{icao:"KSEA"}},route:{line:[[41.98,-87.9],[44.8,-100],[47.45,-122.31]]},eta:{expected_airborne_min:235.7,airborne_window_min:{earliest:219.7,latest:251.7},departure:{estimated_off:off}}};
 const track={fa_flight_id:pkg.flight_id,positions:pkg.route.line.map(([latitude,longitude],i)=>({latitude,longitude,timestamp:new Date(Date.parse(off)+i*7200000).toISOString()}))};
 const checks=[],check=(name,pass)=>checks.push({name,pass:!!pass});
 const score=scoreTrack(pkg,track,off,on);check("matching route zero errors",score.mean_total_km===0&&score.mean_xtd_km===0&&score.mean_atd_km===0&&score.checkpoints.length===5);check("timing recorded",score.timing.actual_airborne_min===240&&score.timing.takeoff_anchored_window_contains_touchdown===true);
 for(const [name,p,t,a,b] of [["wrong flight",pkg,{...track,fa_flight_id:"WRONG"},off,on],["incomplete track",pkg,{...track,positions:[]},off,on],["unterminated track",pkg,{...track,positions:track.positions.slice(0,2)},off,on],["capture after takeoff",{...pkg,generated_at:on},track,off,on],["wrong airport",{...pkg,flight:{...pkg.flight,destination:{icao:"KBOS"}}},track,off,on],["invalid landing",pkg,track,off,off]]){let denied=false;try{scoreTrack(p,t,a,b)}catch{denied=true}check(name,denied);}
 const sql=neon(process.env.AA2398_RUNTIME_URL);const [r]=await sql`SELECT aa2398.claim_score() AS result`;check("live gate disabled",r.result.status==="DISABLED");let denied=false;try{await sql`SELECT * FROM aa2398.score_gate`}catch(e){denied=e.code==="42501"}check("runtime cannot directly read landing gate",denied);
 const [f]=await sql`SELECT aa2398.finish_score(NULL::jsonb) AS result`;check("unclaimed settlement denied",f.result==="NOT_CLAIMED");
 return reply(res,200,{checks,passed:checks.filter(x=>x.pass).length,total:checks.length,actualProviderCalls:0});
}
