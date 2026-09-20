export default async function handler(req,res){
  try{
    const station=String(req.query.station||"KDSM").toUpperCase();
    const date=String(req.query.date||"2026-09-17");
    const d=new Date(date+"T00:00:00Z");
    const e=new Date(d.getTime()+86400000);
    const qs=new URLSearchParams({
      station,
      sts:d.toISOString().replace(".000Z","Z"),
      ets:e.toISOString().replace(".000Z","Z"),
      format:"json",
      tz:"UTC"
    });
    const u="https://mesonet.agron.iastate.edu/cgi-bin/request/tempwind_aloft.py?"+qs;
    const r=await fetch(u,{headers:{"user-agent":"AEVPATH-research/1.0"}});
    const t=await r.text();
    res.status(r.status).setHeader("content-type","application/json; charset=utf-8");
    let parsed; try{parsed=JSON.parse(t)}catch{parsed={raw:t.slice(0,5000)}}
    res.end(JSON.stringify({ok:r.ok,url:u,status:r.status,data:parsed}));
  }catch(e){res.status(500).json({ok:false,error:String(e?.stack||e)})}
}