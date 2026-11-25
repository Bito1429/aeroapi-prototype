import {buildTestPackage} from "../package-builder.mjs";
import {calibrateRoute} from "../model.mjs";
export default async function(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const origin={iata:"PHL",icao:"KPHL",name:"Philadelphia",lat:39.872,lon:-75.241,tz:"America/New_York"},destination={iata:"BOS",icao:"KBOS",name:"Boston",lat:42.365,lon:-71.01,tz:"America/New_York"};
 const flight={flight_id:"TEST-FULL-001",ident:"TEST001",airline:{code:"ZZ",name:"Synthetic Test Airline"},origin,destination,aircraft_type:"TEST",scheduled_departure:"2026-12-01T12:00:00Z",scheduled_arrival:"2026-12-01T13:30:00Z",estimated_out:"2026-12-01T12:00:00Z",estimated_off:"2026-12-01T12:10:00Z"};
 const fixes=[{name:"TEST-A",latitude:40.6,longitude:-74.2},{name:"TEST-B",latitude:41.4,longitude:-72.5}];
 const base={flight,fixes,filedEteSeconds:3600,generatedAt:"2026-12-01T11:00:00Z",expiresAt:"2026-12-02T01:00:00Z"};
 const timing=calibrateRoute({origin:"KPHL",destination:"KBOS",durationsSeconds:[3100,3200,3300,3400,3500,3600,3250,3350]});
 const checks=[];const check=(name,pass)=>checks.push({name,pass:!!pass});const throws=(name,fn)=>{try{fn();check(name,false);}catch{check(name,true);}};
 try{
 const h=buildTestPackage({...base,timing}),f=buildTestPackage(base);
 for(const [label,p] of [["history",h],["fallback",f]]){
 check(label+": contract keys",["schema","schema_minor","package_version","flight_id","market","generated_at","expires_at","frozen_after","attribution","flight","route","corridor","timeline","pois","eta","check_again_after"].every(k=>k in p));
 check(label+": marked unsellable",p.test_only===true&&p.candidate_metadata.sellable===false);
 check(label+": endpoints",p.route.line[0][0]===origin.lat&&p.route.line.at(-1)[1]===destination.lon);
 check(label+": timeline endpoints",p.timeline[0].t_min===0&&Math.abs(p.timeline.at(-1).t_min-p.eta.expected_airborne_min)<1e-5&&p.timeline[0].dist_km===0&&p.timeline.at(-1).dist_km===p.route.total_distance_km);
 check(label+": monotonic timeline",p.timeline.every((x,i,a)=>i===0||(x.t_min>a[i-1].t_min&&x.dist_km>=a[i-1].dist_km)));
 check(label+": two-minute resolution",p.timeline.every((x,i,a)=>i===0||x.t_min-a[i-1].t_min<=2.000001));
 check(label+": finite closed corridor",p.corridor.polygon.every(x=>x.every(Number.isFinite))&&JSON.stringify(p.corridor.polygon[0])===JSON.stringify(p.corridor.polygon.at(-1)));
 check(label+": check-back 30 min",Date.parse(p.flight.estimated_out)-Date.parse(p.check_again_after)===1800000);
 check(label+": movement explicitly unvalidated",p.candidate_metadata.position_status==="UNVALIDATED_CONSTANT_SPEED");
 }
 check("history selected",h.candidate_metadata.timing_source==="ROUTE_HISTORY_MEDIAN"&&h.eta.expected_airborne_min===timing.durationSeconds/60);
 check("Entry 762 selected",f.candidate_metadata.timing_source==="ENTRY_762_FILED_ETE_FALLBACK"&&f.eta.expected_airborne_min===60&&f.eta.airborne_window_min.earliest===51&&f.eta.airborne_window_min.latest===69);
 throws("missing ETE refused",()=>buildTestPackage({...base,filedEteSeconds:null}));
 throws("non-test flight ID refused",()=>buildTestPackage({...base,flight:{...flight,flight_id:"REAL-001"}}));
 throws("invalid times refused",()=>buildTestPackage({...base,expiresAt:"2026-12-01T12:00:00Z"}));
 throws("invalid coordinates refused",()=>buildTestPackage({...base,fixes:[{name:"BAD",latitude:999,longitude:0},{name:"TEST",latitude:40,longitude:-75}]}));
 return res.status(200).json({checks,passed:checks.filter(x=>x.pass).length,total:checks.length,summary:{history_minutes:h.eta.expected_airborne_min,fallback_minutes:f.eta.expected_airborne_min,history_points:h.timeline.length,fallback_points:f.timeline.length}});
 }catch(e){return res.status(500).json({error:"PACKAGE_BUILDER_TEST_FAILED",code:String(e.message).slice(0,80)});}
}
