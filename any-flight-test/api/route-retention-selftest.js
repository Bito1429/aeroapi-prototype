import {buildTestPackage} from "../package-builder.mjs";
import {rawReceiptPolicy,RAW_LIMIT_MS,SAFETY_MARGIN_MS} from "../raw-retention.mjs";
export default function(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const now=Date.now(),iso=m=>new Date(now+m*60000).toISOString();
 const origin={iata:"PHL",icao:"KPHL",name:"Philadelphia",lat:39.872,lon:-75.241,tz:"America/New_York"},destination={iata:"BOS",icao:"KBOS",name:"Boston",lat:42.365,lon:-71.01,tz:"America/New_York"};
 const flight={flight_id:"TEST-ROUTE-REVISION-001",ident:"TEST005",airline:{code:"ZZ",name:"Synthetic Test Airline"},origin,destination,aircraft_type:"TEST",scheduled_departure:iso(180),scheduled_arrival:iso(270),estimated_out:iso(180),estimated_off:iso(190)};
 const base={flight,filedEteSeconds:3600,expiresAt:iso(990)};
 const a=buildTestPackage({...base,generatedAt:iso(-2),fixes:[{name:"TEST-A",latitude:40.6,longitude:-74.2},{name:"TEST-B",latitude:41.4,longitude:-72.5}]});
 const b=buildTestPackage({...base,generatedAt:iso(-1),fixes:[{name:"TEST-A",latitude:40.75,longitude:-74.35},{name:"TEST-B",latitude:41.55,longitude:-72.65}]});
 const checks=[],test=(name,pass)=>checks.push({name,pass:!!pass});
 test("route changed",JSON.stringify(a.route.line)!==JSON.stringify(b.route.line));
 test("timeline regenerated",JSON.stringify(a.timeline)!==JSON.stringify(b.timeline));
 test("corridor regenerated",JSON.stringify(a.corridor.polygon)!==JSON.stringify(b.corridor.polygon));
 test("version changed",a.package_version!==b.package_version);
 test("identity and expiry preserved",a.flight_id===b.flight_id&&a.expires_at===b.expires_at);
 test("both unsellable",a.test_only&&b.test_only&&!a.candidate_metadata.sellable&&!b.candidate_metadata.sellable);
 const p=(source,age)=>rawReceiptPolicy({source,receivedAt:new Date(now-age).toISOString(),now});
 test("fresh synthetic memory only",p("SYNTHETIC_ONLY",0).allowed&&!p("SYNTHETIC_ONLY",0).persistRaw);
 test("one-hour safety margin",p("SYNTHETIC_ONLY",RAW_LIMIT_MS-SAFETY_MARGIN_MS-1).allowed&&!p("SYNTHETIC_ONLY",RAW_LIMIT_MS-SAFETY_MARGIN_MS).allowed);
 test("24h refused",!p("SYNTHETIC_ONLY",RAW_LIMIT_MS).allowed);
 test("older than 24h refused",!p("SYNTHETIC_ONLY",RAW_LIMIT_MS+1).allowed);
 test("future receipt refused",!p("SYNTHETIC_ONLY",-1).allowed);
 test("unknown receipt refused",!rawReceiptPolicy({source:"SYNTHETIC_ONLY",now}).allowed);
 test("FlightAware refused",!p("FLIGHTAWARE",0).allowed);
 test("unknown source refused",!p("UNKNOWN",0).allowed);
 return res.status(200).json({checks,passed:checks.filter(x=>x.pass).length,total:checks.length,versions:[a,b]});
}
