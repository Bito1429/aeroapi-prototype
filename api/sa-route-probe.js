import { aero, json } from "./lib.js";

const OPS = ["SFR","LNK","SAA"];
const START = "2026-09-27T00:00:00Z";
const END = "2026-09-28T00:00:00Z";

function code(x){
  if(!x) return null;
  if(typeof x==="string") return x;
  return x.code_icao || x.code_iata || x.code || null;
}
function isSouthAfrica(f){
  const o=code(f.origin), d=code(f.destination);
  return o?.startsWith("FA") && d?.startsWith("FA");
}

export default async function handler(req,res){
  const out={ok:true,start:START,end:END,operators:{}};
  for(const op of OPS){
    try{
      const b=await aero(`/history/operators/${op}/flights`,{start:START,end:END,max_pages:1});
      const flights=(b.flights||b.arrivals||b.departures||[]);
      const f=flights.find(isSouthAfrica) || flights[0];
      if(!f){
        out.operators[op]={count:0};
        continue;
      }
      let route=null, routeError=null;
      try{
        route=await aero(`/history/flights/${encodeURIComponent(f.fa_flight_id)}/route`);
      }catch(e){
        routeError={status:e.status||null,message:e.message,detail:e.body||null};
      }
      out.operators[op]={
        count:flights.length,
        sample:{
          fa_flight_id:f.fa_flight_id,
          ident:f.ident,
          origin:code(f.origin),
          destination:code(f.destination),
          status:f.status,
          flight_route_field:f.route ?? null
        },
        route_endpoint: route ? {
          keys:Object.keys(route),
          route_distance:route.route_distance ?? null,
          fixes_count:(route.fixes||[]).length,
          fixes:(route.fixes||[]).slice(0,40).map(x=>({name:x.name,type:x.type,latitude:x.latitude,longitude:x.longitude}))
        } : null,
        route_error:routeError
      };
    }catch(e){
      out.operators[op]={error:e.message,status:e.status||null,detail:e.body||null};
    }
  }
  console.log("SA_ROUTE_PROBE_RESULT", JSON.stringify(out));\n  json(res,200,out);
}