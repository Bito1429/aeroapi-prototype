import {buildTestPackage} from "../package-builder.mjs";
export default function(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const origin={iata:"PHL",icao:"KPHL",name:"Philadelphia",lat:39.872,lon:-75.241,tz:"America/New_York"},destination={iata:"BOS",icao:"KBOS",name:"Boston",lat:42.365,lon:-71.01,tz:"America/New_York"};
 const now=Date.now(),iso=m=>new Date(now+m*60000).toISOString();
 const flight={flight_id:"TEST-FULL-DELIVERY-002",ident:"TEST002",airline:{code:"ZZ",name:"Synthetic Test Airline"},origin,destination,aircraft_type:"TEST",scheduled_departure:iso(180),scheduled_arrival:iso(270),estimated_out:iso(180),estimated_off:iso(190)};
 const p=buildTestPackage({flight,fixes:[{name:"TEST-A",latitude:40.6,longitude:-74.2},{name:"TEST-B",latitude:41.4,longitude:-72.5}],filedEteSeconds:3600,generatedAt:iso(0),expiresAt:iso(990)});
 return res.status(200).json(p);
}
