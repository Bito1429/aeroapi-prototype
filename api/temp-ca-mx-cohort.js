import crypto from "node:crypto";
const TOKEN="camx_6c197ee18ae54f26a8d71fa958194667";
const BASE="https://aeroapi.flightaware.com/aeroapi";
function slim(f){
  return {
    fa_flight_id:f.fa_flight_id||null,
    ident:f.ident||null,
    origin:f.origin?.code_icao||f.origin?.code||null,
    destination:f.destination?.code_icao||f.destination?.code||null,
    scheduled_out:f.scheduled_out||null,
    scheduled_on:f.scheduled_on||null,
    route:f.route||null,
    aircraft_type:f.aircraft_type||null,
    status:f.status||null
  };
}
async function call(url,key){
  const r=await fetch(url,{headers:{"x-apikey":key}});
  const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}
  if(!r.ok)throw new Error("AeroAPI "+r.status+" "+t.slice(0,300));
  return j;
}
async function collectAirport(airport,direction,key){
  const u=new URL(BASE+"/history/airports/"+airport+"/flights/"+direction);
  u.searchParams.set("start","2026-09-20T00:00:00Z");
  u.searchParams.set("end","2026-09-20T23:59:59Z");
  u.searchParams.set("max_pages","100");
  const j=await call(u,key),arr=j?.[direction]||[];
  const rows=arr.map(slim).filter(x=>x.fa_flight_id&&x.ident&&x.origin&&x.destination&&x.scheduled_out&&x.route&&x.status&&!/cancel/i.test(x.status));
  return {airport,direction,raw_count:arr.length,rows};
}
function splitRows(rows,prefix){
  const uniq=[...new Map(rows.map(x=>[x.fa_flight_id,x])).values()].filter(x=>x.origin?.startsWith(prefix)||x.destination?.startsWith(prefix));
  const ranked=uniq.map(x=>({...x,selection_hash:crypto.createHash("sha256").update(x.fa_flight_id).digest("hex")})).sort((a,b)=>a.selection_hash.localeCompare(b.selection_hash));
  const dev=[],hold=[];for(let i=0;i<ranked.length;i++){const row={rank:i+1,...ranked[i]};((i+1)%2?dev:hold).push(row)}
  return {eligible_n:ranked.length,development:dev.slice(0,100),holdout:hold.slice(0,100)};
}
export default async function handler(req,res){
  if(String(req.query?.k||"")!==TOKEN)return res.status(403).json({ok:false});
  const key=process.env.AEROAPI_KEY;if(!key)return res.status(500).json({ok:false,error:"AEROAPI_KEY missing"});
  const country=String(req.query?.country||"").toUpperCase();
  if(country==="CA"||country==="MX"){
    const airports=country==="CA"?["CYYZ","CYVR","CYUL","CYYC","CYEG","CYOW","CYWG","CYHZ","CYQB","CYYJ"]:["MMMX","MMUN","MMMY","MMGL","MMTJ","MMSD","MMSM","MMPR","MMSL","MMCZ"];
    const prefix=country==="CA"?"C":"MM";
    const pulls=await Promise.all(airports.flatMap(a=>["arrivals","departures"].map(d=>collectAirport(a,d,key))));
    const all=pulls.flatMap(x=>x.rows),split=splitRows(all,prefix);
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ok:true,country,window:["2026-09-20T00:00:00Z","2026-09-20T23:59:59Z"],airport_counts:pulls.map(x=>({airport:x.airport,direction:x.direction,raw_count:x.raw_count,kept_count:x.rows.length})),...split});
  }
  const airport=String(req.query?.airport||"").toUpperCase(),direction=req.query?.direction==="departures"?"departures":"arrivals";
  if(!/^[A-Z0-9]{3,4}$/.test(airport))return res.status(400).json({ok:false,error:"bad airport"});
  const out=await collectAirport(airport,direction,key);
  res.setHeader("Cache-Control","no-store");
  return res.status(200).json({ok:true,airport,direction,raw_count:out.raw_count,kept_count:out.rows.length,rows:out.rows});
}