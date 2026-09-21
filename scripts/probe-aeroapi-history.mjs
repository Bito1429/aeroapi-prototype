const key=process.env.AEROAPI_KEY;
if(!key){console.error("AEROAPI_KEY_MISSING");process.exit(2);}
const u=new URL("https://aeroapi.flightaware.com/aeroapi/history/airports/KLAS/flights/arrivals");
u.searchParams.set("start","2026-09-20T12:00:00Z");
u.searchParams.set("end","2026-09-20T14:00:00Z");
u.searchParams.set("max_pages","1");
const r=await fetch(u,{headers:{"x-apikey":key}});
const txt=await r.text();
console.log(JSON.stringify({status:r.status,ok:r.ok,body_preview:txt.slice(0,1200)}));
if(!r.ok)process.exit(3);
