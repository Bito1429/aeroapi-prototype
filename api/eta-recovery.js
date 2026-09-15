import {db} from './db.js';
import {flightById,json} from './lib.js';

export const maxDuration=60;

function pct(sorted,p){
  if(!sorted.length)return null;
  const i=(sorted.length-1)*p;
  const lo=Math.floor(i),hi=Math.ceil(i);
  if(lo===hi)return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);
}

async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  async function worker(){
    while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}

export default async function handler(req,res){
  try{
    const s=db();
    const jobs=await s`
      select j.id,j.fa_flight_id,j.ident,j.origin,j.destination,b.filed_ete_seconds
      from flight_jobs j
      left join lateral (
        select fc.filed_ete_seconds
        from method_a_scores m
        join flight_captures fc on fc.id=m.baseline_capture_id
        where m.flight_job_id=j.id
        order by m.scored_at desc,m.id desc
        limit 1
      ) b on true
      where j.created_at >= '2026-09-14T19:39:32Z'::timestamptz
        and j.created_at < '2026-09-14T19:45:33Z'::timestamptz
        and j.scheduled_out_initial between '2026-09-14T20:50:00Z'::timestamptz and '2026-09-14T21:20:00Z'::timestamptz
        and j.terminal_state='SCOREABLE'
        and j.scoreable=true
      order by j.fa_flight_id`;

    const rows=await mapLimit(jobs,12,async j=>{
      try{
        const f=await flightById(j.fa_flight_id);
        const match=f.fa_flight_id===j.fa_flight_id;
        const off=f.actual_off||null,on=f.actual_on||null,ete=j.filed_ete_seconds;
        if(!match||!off||!on||ete==null||!Number.isFinite(Number(ete))||Number(ete)<=0)return {ok:false,id:j.fa_flight_id,match,off:!!off,on:!!on,ete:ete??null};
        const pred=new Date(off).getTime()+Number(ete)*1000;
        const signed=(pred-new Date(on).getTime())/60000;
        return {ok:true,id:j.fa_flight_id,signed,abs:Math.abs(signed)};
      }catch(e){return {ok:false,id:j.fa_flight_id,error:e.message};}
    });

    const good=rows.filter(x=>x.ok),abs=good.map(x=>x.abs).sort((a,b)=>a-b),signed=good.map(x=>x.signed);
    const bad=rows.filter(x=>!x.ok);
    const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
    json(res,200,{ok:true,scoreable_cohort:jobs.length,evaluable:good.length,failures:bad.length,
      mae_min:mean(abs),median_abs_min:pct(abs,.5),p90_abs_min:pct(abs,.9),p95_abs_min:pct(abs,.95),max_abs_min:abs.at(-1)??null,
      mean_signed_min:mean(signed),within5:good.filter(x=>x.abs<=5).length,within10:good.filter(x=>x.abs<=10).length,
      within5_pct:good.length?100*good.filter(x=>x.abs<=5).length/good.length:null,
      within10_pct:good.length?100*good.filter(x=>x.abs<=10).length/good.length:null,
      failed:bad.slice(0,25)});
  }catch(e){json(res,500,{ok:false,error:e.message});}
}
