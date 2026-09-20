export default async function handler(req,res){
  try{
    const mode=String(req.query.mode||"wind");
    if(mode==="stationinfo"){
      const ids=String(req.query.ids||"KDSM,KDEN");
      const u="https://aviationweather.gov/api/data/stationinfo?ids="+encodeURIComponent(ids)+"&format=json";
      const r=await fetch(u,{headers:{"user-agent":"AEVPATH-research/1.0"}});
      const t=await r.text(); let data; try{data=JSON.parse(t)}catch{data={raw:t.slice(0,5000)}}
      return res.status(r.status).json({ok:r.ok,status:r.status,url:u,data});
    }
    if(mode==="fdlist"){
      const u="https://forecast.weather.gov/product.php?site=NWS&issuedby=US1&product=FD1&format=txt";
      const r=await fetch(u,{headers:{"user-agent":"AEVPATH-research/1.0"}});
      const t=await r.text();
      const plain=t.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ");
      const codes=[...plain.matchAll(/(?:^|\n)\s*([A-Z]{3})\s+(?:\d|9900)/g)].map(m=>m[1]);
      return res.status(r.status).json({ok:r.ok,status:r.status,count:[...new Set(codes)].length,codes:[...new Set(codes)].slice(0,250),sample:plain.slice(0,3000)});
    }
    const station=String(req.query.station||"KDSM").toUpperCase();
    const date=String(req.query.date||"2026-09-17");
    const d=new Date(date+"T00:00:00Z"),e=new Date(d.getTime()+86400000);
    const qs=new URLSearchParams({station,sts:d.toISOString().replace(".000Z","Z"),ets:e.toISOString().replace(".000Z","Z"),format:"json",tz:"UTC"});
    const url="https://mesonet.agron.iastate.edu/cgi-bin/request/tempwind_aloft.py?"+qs;
    const r=await fetch(url,{headers:{"user-agent":"AEVPATH-research/1.0"}});
    const t=await r.text(); let data; try{data=JSON.parse(t)}catch{data={raw:t.slice(0,5000)}}
    res.status(r.status).json({ok:r.ok,status:r.status,data});
  }catch(e){res.status(500).json({ok:false,error:String(e?.stack||e)})}
}