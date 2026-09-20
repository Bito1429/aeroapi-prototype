import {db} from "./db.js";

const R=6371.0088, NMKM=1.852, MAX_STN_KM=400*NMKM, LEVELS=[24000,30000,34000,39000];

function rad(x){return x*Math.PI/180}
function deg(x){return x*180/Math.PI}
function hav(a,b){
  const p1=rad(a.lat),p2=rad(b.lat),dp=rad(b.lat-a.lat),dl=rad(b.lon-a.lon);
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function bearing(a,b){
  const p1=rad(a.lat),p2=rad(b.lat),dl=rad(b.lon-a.lon);
  const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return (deg(Math.atan2(y,x))+360)%360;
}
function gcInterp(a,b,f){
  if(f<=0)return {...a}; if(f>=1)return {...b};
  const d=hav(a,b)/R; if(d<1e-12)return {...a};
  const A=Math.sin((1-f)*d)/Math.sin(d),B=Math.sin(f*d)/Math.sin(d);
  const p1=rad(a.lat),l1=rad(a.lon),p2=rad(b.lat),l2=rad(b.lon);
  const x=A*Math.cos(p1)*Math.cos(l1)+B*Math.cos(p2)*Math.cos(l2);
  const y=A*Math.cos(p1)*Math.sin(l1)+B*Math.cos(p2)*Math.sin(l2);
  const z=A*Math.sin(p1)+B*Math.sin(p2);
  return {lat:deg(Math.atan2(z,Math.sqrt(x*x+y*y))),lon:deg(Math.atan2(y,x))};
}
function resample(fixes,step=50){
  const pts=fixes.map(f=>({lat:+f.latitude,lon:+f.longitude})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  if(pts.length<2)return null;
  const seg=[],cum=[0]; let total=0;
  for(let i=1;i<pts.length;i++){const d=hav(pts[i-1],pts[i]);seg.push(d);total+=d;cum.push(total)}
  if(!(total>0))return null;
  const targets=[0]; for(let x=step;x<total;x+=step)targets.push(x); targets.push(total);
  const out=[]; let j=0;
  for(const t of targets){
    while(j<seg.length-1 && cum[j+1]<t)j++;
    const d=seg[j],f=d>0?(t-cum[j])/d:0;
    out.push(gcInterp(pts[j],pts[j+1],Math.max(0,Math.min(1,f))));
  }
  const intervals=[];
  for(let i=0;i<out.length-1;i++)intervals.push({d:hav(out[i],out[i+1]),bearing:bearing(out[i],out[i+1])});
  const finalBearing=intervals.length?intervals[intervals.length-1].bearing:0;
  return {samples:out,intervals,finalBearing,total};
}
function windVec(dirFrom,speed){
  const th=rad(dirFrom);
  return {u:-speed*Math.sin(th),v:-speed*Math.cos(th)};
}
function interpAlt(row,alt){
  let lo=LEVELS[0],hi=LEVELS[LEVELS.length-1];
  for(let i=0;i<LEVELS.length;i++){
    if(alt===LEVELS[i]){lo=hi=LEVELS[i];break}
    if(alt>LEVELS[i])lo=LEVELS[i];
    if(alt<LEVELS[i]){hi=LEVELS[i];break}
  }
  const d1=row["drct"+lo],s1=row["sknt"+lo],d2=row["drct"+hi],s2=row["sknt"+hi];
  if(!Number.isFinite(+d1)||!Number.isFinite(+s1)||!Number.isFinite(+d2)||!Number.isFinite(+s2))return null;
  const a=windVec(+d1,+s1),b=windVec(+d2,+s2);
  if(lo===hi)return a;
  const f=(alt-lo)/(hi-lo);
  return {u:a.u+(b.u-a.u)*f,v:a.v+(b.v-a.v)*f};
}
function parseIemTime(s){return new Date(String(s).replaceAll("/","-").replace(" ","T")+":00Z")}
function keyCycle(station,ob,ft){return station+"|"+ob.toISOString()+"|"+ft.toISOString()}
function median(a){if(!a.length)return null; const x=[...a].sort((p,q)=>p-q),m=Math.floor(x.length/2); return x.length%2?x[m]:(x[m-1]+x[m])/2}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function normalCdf(x){return 0.5*(1+erf(x/Math.SQRT2))}
function erf(x){
  const sign=x<0?-1:1,z=Math.abs(x),a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911;
  const t=1/(1+p*z),y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-z*z); return sign*y;
}
function wilcoxonOneSided(diffs){
  const vals=diffs.filter(x=>Number.isFinite(x)&&Math.abs(x)>1e-12).map(x=>({abs:Math.abs(x),pos:x>0}));
  const n=vals.length;if(!n)return {n:0,wplus:null,z:null,p:null};
  vals.sort((a,b)=>a.abs-b.abs);
  let i=0,wplus=0,tieSum=0;
  while(i<n){
    let j=i+1;while(j<n&&Math.abs(vals[j].abs-vals[i].abs)<1e-12)j++;
    const rank=((i+1)+j)/2, t=j-i; if(t>1)tieSum+=t*(t+1)*(2*t+1);
    for(let k=i;k<j;k++)if(vals[k].pos)wplus+=rank;
    i=j;
  }
  const mu=n*(n+1)/4;
  const variance=n*(n+1)*(2*n+1)/24 - tieSum/48;
  const z=variance>0?(wplus-mu-0.5)/Math.sqrt(variance):0;
  return {n,wplus,z,p:1-normalCdf(z)};
}
function dateFromDDHHMM(code,year=2026,month=8){
  const d=+code.slice(0,2),h=+code.slice(2,4),m=+code.slice(4,6);
  return new Date(Date.UTC(year,month,d,h,m));
}
function useWindow(valid,startHHMM,endHHMM){
  const sh=+startHHMM.slice(0,2),sm=+startHHMM.slice(2),eh=+endHHMM.slice(0,2),em=+endHHMM.slice(2);
  for(const off of [-1,0,1]){
    const s=new Date(Date.UTC(valid.getUTCFullYear(),valid.getUTCMonth(),valid.getUTCDate()+off,sh,sm));
    let e=new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth(),s.getUTCDate(),eh,em));
    if(e<=s)e=new Date(e.getTime()+86400000);
    if(valid>=s&&valid<=e)return {start:s,end:e};
  }
  const s=new Date(Date.UTC(valid.getUTCFullYear(),valid.getUTCMonth(),valid.getUTCDate(),sh,sm));
  let e=new Date(Date.UTC(valid.getUTCFullYear(),valid.getUTCMonth(),valid.getUTCDate(),eh,em)); if(e<=s)e=new Date(e.getTime()+86400000);
  return {start:s,end:e};
}
function parseProducts(txt){
  const out=[];
  const re=/(FBUS3[123]\s+KWNO\s+(\d{6})[\s\S]*?\n(FD[123]US1)\s*\n[\s\S]*?DATA BASED ON\s+(\d{6})Z[\s\S]*?VALID\s+(\d{6})Z\s+FOR USE\s+(\d{4})-(\d{4})Z)/g;
  for(const m of txt.matchAll(re)){
    const issue=dateFromDDHHMM(m[2]),base=dateFromDDHHMM(m[4]),valid=dateFromDDHHMM(m[5]);
    const w=useWindow(valid,m[6],m[7]);
    out.push({pil:m[3],issue,base,valid,useStart:w.start,useEnd:w.end,horizon:m[3][2]==="1"?6:m[3][2]==="2"?12:24});
  }
  return out;
}
function chooseProduct(products,cutoff,tmid){
  const eligible=products.filter(p=>p.issue.getTime()<=cutoff.getTime()-15*60000 && tmid>=p.useStart && tmid<=p.useEnd);
  eligible.sort((a,b)=>{
    const da=Math.abs(a.valid-tmid),db=Math.abs(b.valid-tmid); if(da!==db)return da-db;
    if(a.base.getTime()!==b.base.getTime())return b.base-a.base;
    return a.horizon-b.horizon;
  });
  return eligible[0]||null;
}
async function fetchJson(url){
  const r=await fetch(url,{headers:{"user-agent":"AEVPATH-research/1.0"}});
  const t=await r.text(); if(!r.ok)throw new Error("fetch "+r.status+" "+url+" "+t.slice(0,200));
  try{return JSON.parse(t)}catch{throw new Error("non-json "+url+" "+t.slice(0,200))}
}
async function fetchText(url){
  const r=await fetch(url,{headers:{"user-agent":"AEVPATH-research/1.0"}});
  const t=await r.text(); if(!r.ok)throw new Error("fetch "+r.status+" "+url+" "+t.slice(0,200)); return t;
}
function flightDir(f){
  const fixes=f.fixes||[]; if(fixes.length<2)return null;
  const a=fixes.find(x=>Number.isFinite(+x.longitude)),b=[...fixes].reverse().find(x=>Number.isFinite(+x.longitude));
  if(!a||!b)return null; return (+b.longitude>+a.longitude)?"E":"W";
}

export default async function handler(req,res){
  try{
    const s=db();
    const rows=await s`
      with sb as (
        select flight_job_id,min(baseline_capture_id) baseline_capture_id from method_a_scores group by flight_job_id
      ), ini as (
        select distinct on(fc.flight_job_id) fc.flight_job_id,fc.filed_ete_seconds
        from flight_captures fc join flight_checkpoints cp on cp.id=fc.checkpoint_id
        where cp.label='INITIAL' and fc.filed_ete_seconds is not null
        order by fc.flight_job_id,fc.captured_at asc
      )
      select j.id::text,j.fa_flight_id,j.ident,j.flight_date::text,j.origin,j.destination,j.scheduled_out_initial,
             j.method_a_mean_total_km,j.method_a_mean_xtd_km,j.postflight_track_km,
             bc.captured_at baseline_captured_at,bc.estimated_off,bc.filed_altitude,bc.baseline_km,
             bc.raw_capture->'protocol'->'fixes' fixes,ini.filed_ete_seconds
      from flight_jobs j
      join sb on sb.flight_job_id=j.id
      join flight_captures bc on bc.id=sb.baseline_capture_id
      join ini on ini.flight_job_id=j.id
      where ini.filed_ete_seconds>=12600
        and bc.baseline_km>0 and j.postflight_track_km is not null
        and j.method_a_mean_total_km is not null and j.method_a_mean_xtd_km is not null
        and j.postflight_track_km/bc.baseline_km between 0.95 and 1.05
        and (j.method_a_mean_total_km>100 or j.method_a_mean_xtd_km<=30)
      order by j.flight_date,j.scheduled_out_initial,j.id
    `;
    const flights=rows.map(r=>{
      const alt=Number(r.filed_altitude)*100,fixes=Array.isArray(r.fixes)?r.fixes:[];
      const rr=resample(fixes);
      return {...r,alt,fixes,rr,dir:flightDir({fixes}),eteMin:Number(r.filed_ete_seconds)/60,
        sched:new Date(r.scheduled_out_initial),cutoff:new Date(r.baseline_captured_at),
        tmid:new Date((r.estimated_off?new Date(r.estimated_off):new Date(r.scheduled_out_initial)).getTime()+Number(r.filed_ete_seconds)*500)};
    }).filter(f=>f.alt>=24000&&f.alt<=39000&&f.rr&&f.dir);
    const A=flights.filter(f=>Number(f.method_a_mean_total_km)>100);
    const C=flights.filter(f=>Number(f.method_a_mean_xtd_km)<=30);
    const used=new Set(),pairs=[];
    for(const a of A){
      const pool=C.filter(c=>!used.has(c.id)&&c.flight_date===a.flight_date&&c.dir===a.dir);
      pool.sort((x,y)=>{
        const tx=Math.abs(x.sched-a.sched),ty=Math.abs(y.sched-a.sched);if(tx!==ty)return tx-ty;
        const ex=Math.abs(x.eteMin-a.eteMin),ey=Math.abs(y.eteMin-a.eteMin);if(ex!==ey)return ex-ey;
        return String(x.id).localeCompare(String(y.id));
      });
      if(pool[0]){used.add(pool[0].id);pairs.push({a,c:pool[0]})}
    }

    const rawUrl="https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?limit=9999&pil=FD1US1,FD2US1,FD3US1&fmt=text&sdate=2026-09-10T00:00Z&edate=2026-09-21T23:59Z&order=asc";
    const raw=await fetchText(rawUrl),products=parseProducts(raw);
    for(const p of pairs){
      p.a.product=chooseProduct(products,p.a.cutoff,p.a.tmid); p.c.product=chooseProduct(products,p.c.cutoff,p.c.tmid);
    }

    const fdHtml=await fetchText("https://forecast.weather.gov/product.php?site=NWS&issuedby=US1&product=FD1&format=txt");
    const plain=fdHtml.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ");
    const codes=[...new Set([...plain.matchAll(/(?:^|\n)\s*([A-Z]{3})\s+(?:\d|9900)/g)].map(m=>m[1]))];
    const stationIds=codes.map(x=>"K"+x);
    const meta=[];
    for(let i=0;i<stationIds.length;i+=80){
      const ids=stationIds.slice(i,i+80).join(",");
      const arr=await fetchJson("https://aviationweather.gov/api/data/stationinfo?ids="+encodeURIComponent(ids)+"&format=json");
      meta.push(...arr);
    }
    const stations=meta.filter(x=>Number.isFinite(+x.lat)&&Number.isFinite(+x.lon)).map(x=>({id:x.id,lat:+x.lat,lon:+x.lon}));

    const byDate=new Map();
    for(const pair of pairs){
      if(!pair.a.product||!pair.c.product)continue;
      const d=pair.a.flight_date;
      if(!byDate.has(d))byDate.set(d,[]);
      byDate.get(d).push(pair.a,pair.c);
    }

    const wxRows=[];
    for(const [date,fs] of byDate){
      const need=new Set();
      for(const f of fs){
        for(const sp of f.rr.samples){
          const near=stations.map(st=>({id:st.id,d:hav(sp,st)})).filter(x=>x.d<=MAX_STN_KM).sort((a,b)=>a.d-b.d).slice(0,8);
          near.forEach(x=>need.add(x.id));
        }
      }
      const ids=[...need],d0=new Date(date+"T00:00:00Z"),d1=new Date(d0.getTime()-86400000),d2=new Date(d0.getTime()+2*86400000);
      for(let i=0;i<ids.length;i+=30){
        const qs=new URLSearchParams({station:ids.slice(i,i+30).join(","),sts:d1.toISOString().replace(".000Z","Z"),ets:d2.toISOString().replace(".000Z","Z"),format:"json",tz:"UTC"});
        const arr=await fetchJson("https://mesonet.agron.iastate.edu/cgi-bin/request/tempwind_aloft.py?"+qs);
        wxRows.push(...arr);
      }
    }
    const wxMap=new Map();
    for(const r of wxRows){
      const ob=parseIemTime(r.obtime),ft=parseIemTime(r.ftime);
      wxMap.set(keyCycle(String(r.station),ob,ft),r);
    }

    function features(f){
      const prod=f.product;if(!prod)return {ok:false,reason:"no_product"};
      const windAt=[];
      for(let i=0;i<f.rr.samples.length;i++){
        const sp=f.rr.samples[i];
        const near=stations.map(st=>({st,d:hav(sp,st)})).filter(x=>x.d<=MAX_STN_KM).sort((a,b)=>a.d-b.d);
        const usable=[];
        for(const x of near){
          const row=wxMap.get(keyCycle(x.st.id,prod.base,prod.valid)); if(!row)continue;
          const v=interpAlt(row,f.alt); if(!v)continue;
          usable.push({d:x.d,v}); if(usable.length===3)break;
        }
        if(!usable.length)return {ok:false,reason:"no_station"};
        let u,v;
        if(usable[0].d<1e-6){u=usable[0].v.u;v=usable[0].v.v}
        else{
          let sw=0,su=0,sv=0;for(const x of usable){const w=1/(x.d*x.d);sw+=w;su+=w*x.v.u;sv+=w*x.v.v}u=su/sw;v=sv/sw;
        }
        windAt.push({u,v});
      }
      let crossNum=0,total=0,gradSum=0;
      for(let i=0;i<f.rr.intervals.length;i++){
        const it=f.rr.intervals[i],phi=rad(it.bearing),w=windAt[i];
        const perp={u:Math.cos(phi),v:-Math.sin(phi)};
        const cross=Math.abs(w.u*perp.u+w.v*perp.v);
        crossNum+=it.d*cross;total+=it.d;
        const w2=windAt[i+1],dv=Math.hypot(w2.u-w.u,w2.v-w.v);
        gradSum+=dv;
      }
      return {ok:true,cross:crossNum/total,gradient:100*gradSum/total};
    }

    const scored=[],fail={};
    for(const p of pairs){
      const fa=features(p.a),fc=features(p.c);
      if(fa.ok&&fc.ok)scored.push({a:fa,c:fc});
      else{
        const k=(fa.ok?"":("A_"+fa.reason))+"|"+(fc.ok?"":("C_"+fc.reason));fail[k]=(fail[k]||0)+1;
      }
    }
    const dc=scored.map(x=>x.a.cross-x.c.cross),dg=scored.map(x=>x.a.gradient-x.c.gradient);
    const wx=wilcoxonOneSided(dc),wg=wilcoxonOneSided(dg);
    const result={
      frozen_definition:"Entry 723",
      candidate_group_a:A.length,
      control_pool:C.length,
      matched_pairs:pairs.length,
      products_parsed:products.length,
      station_codes:codes.length,
      station_coords:stations.length,
      scored_pairs:scored.length,
      failures:fail,
      crosswind:{
        group_a_median_kt:median(scored.map(x=>x.a.cross)),
        control_median_kt:median(scored.map(x=>x.c.cross)),
        paired_diff_median_kt:median(dc),
        paired_diff_mean_kt:mean(dc),
        wilcoxon_one_sided_p:wx.p,
        confirm_threshold_kt:10,
        confirms:median(dc)!==null&&median(dc)>=10
      },
      gradient:{
        group_a_median_kt_per_100km:median(scored.map(x=>x.a.gradient)),
        control_median_kt_per_100km:median(scored.map(x=>x.c.gradient)),
        paired_diff_median_kt_per_100km:median(dg),
        paired_diff_mean_kt_per_100km:mean(dg),
        wilcoxon_one_sided_p:wg.p,
        confirms:wg.p!==null&&wg.p<0.05&&median(dg)>0
      }
    };
    res.status(200).json({ok:true,result});
  }catch(e){
    res.status(500).json({ok:false,error:String(e?.stack||e)});
  }
}