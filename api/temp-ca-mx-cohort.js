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
export default async function handler(req,res){
  if(String(req.query?.k||"")!==TOKEN)return res.status(403).json({ok:false});
  const key=process.env.AEROAPI_KEY;if(!key)return res.status(500).json({ok:false,error:"AEROAPI_KEY missing"});
  const airport=String(req.query?.airport||"").toUpperCase();
  const direction=req.query?.direction==="departures"?"departures":"arrivals";
  if(!/^[A-Z0-9]{3,4}$/.test(airport))return res.status(400).json({ok:false,error:"bad airport"});
  const u=new URL(BASE+"/history/airports/"+airport+"/flights/"+direction);
  u.searchParams.set("start","2026-09-20T00:00:00Z");
  u.searchParams.set("end","2026-09-20T23:59:59Z");
  u.searchParams.set("max_pages","100");
  const j=await call(u,key);
  const arr=j?.[direction]||[];
  const rows=arr.map(slim).filter(x=>x.fa_flight_id&&x.ident&&x.origin&&x.destination&&x.scheduled_out&&x.route&&x.status&&!/cancel/i.test(x.status));
  res.setHeader("Cache-Control","no-store");
  return res.status(200).json({ok:true,airport,direction,raw_count:arr.length,kept_count:rows.length,rows});
}