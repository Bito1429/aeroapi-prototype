export default async function handler(req,res){
  try{
    const key=process.env.AEROAPI_KEY;
    if(!key)return res.status(500).json({ok:false,error:"AEROAPI_KEY_MISSING"});
    const u=new URL("https://aeroapi.flightaware.com/aeroapi/history/airports/KLAS/flights/arrivals");
    u.searchParams.set("start","2026-09-20T12:00:00Z");
    u.searchParams.set("end","2026-09-20T14:00:00Z");
    u.searchParams.set("max_pages","1");
    const r=await fetch(u,{headers:{"x-apikey":key}});
    const j=await r.json().catch(()=>null);
    const flights=Array.isArray(j?.arrivals)?j.arrivals:[];
    return res.status(r.ok?200:r.status).json({
      ok:r.ok,status:r.status,count:flights.length,
      sample:flights.slice(0,3).map(f=>({
        fa_flight_id:f.fa_flight_id,ident:f.ident,
        actual_on:f.actual_on,scheduled_on:f.scheduled_on,
        origin:f.origin?.code_icao,destination:f.destination?.code_icao
      })),
      error:r.ok?null:j
    });
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)});}
}