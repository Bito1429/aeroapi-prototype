const BASE="https://aeroapi.flightaware.com/aeroapi";
const key=process.env.AEROAPI_KEY;
if(!key) throw new Error("AEROAPI_KEY missing");
async function aero(path,params={}){
  const u=new URL(BASE+path);
  for(const [k,v] of Object.entries(params)) u.searchParams.set(k,String(v));
  const r=await fetch(u,{headers:{"x-apikey":key}});
  const t=await r.text(); let b; try{b=JSON.parse(t)}catch{b={raw:t}};
  if(!r.ok) throw new Error("AeroAPI "+r.status+" "+JSON.stringify(b));
  return b;
}
function code(x){if(!x)return null;if(typeof x==="string")return x;return x.code_icao||x.code_iata||x.code||null;}
const start="2026-09-27T00:00:00Z", end="2026-09-28T00:00:00Z";
const b=await aero("/history/operators/LNK/flights",{start,end,max_pages:1});
const flights=(b.flights||b.arrivals||b.departures||[]);
const f=flights.find(x=>code(x.origin)?.startsWith("FA")&&code(x.destination)?.startsWith("FA"))||flights[0];
if(!f){console.log("SA_ROUTE_PROBE "+JSON.stringify({ok:false,reason:"no LNK flights"}));process.exit(0);}
let route=null,err=null;
try{route=await aero("/history/flights/"+encodeURIComponent(f.fa_flight_id)+"/route");}
catch(e){err=e.message;}
console.log("SA_ROUTE_PROBE "+JSON.stringify({
  ok:true,
  flight:{fa_flight_id:f.fa_flight_id,ident:f.ident,origin:code(f.origin),destination:code(f.destination),route_field:f.route??null,status:f.status},
  route_error:err,
  route:route?{route_distance:route.route_distance??null,fixes_count:(route.fixes||[]).length,fixes:(route.fixes||[]).slice(0,30).map(x=>({name:x.name,type:x.type,latitude:x.latitude,longitude:x.longitude}))}:null
}));