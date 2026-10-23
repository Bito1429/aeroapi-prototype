import {json,aero} from './lib.js';
import {randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import batch from './europe-feasibility-batch.js';
export default async function handler(req,res){
 if(!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer '+process.env.CRON_SECRET)return json(res,401,{ok:false,error:'Unauthorized'});
 if(!process.env.EUROPE_DATABASE_URL)return json(res,503,{ok:false,error:'Europe database not configured'});

 const sql=neon(process.env.EUROPE_DATABASE_URL),owner=randomUUID();
 // FlightAware's screenshot reports $13.40 of Europe enumeration on 21 Oct.
 // Provider account totals also contain US spend, so never use account-wide totals as Europe spend.
 const [{enum_pages,track_requests}]=await sql`
 select
 (select coalesce(sum(page_count),0)::int from europe_feasibility_progress where task_key like 'enum:%') as enum_pages,
 (select coalesce(max(flight_count),0)::int from europe_feasibility_progress where task_key='budget:track_requests') as track_requests`;
 const estimatedUsd=0.02*Number(enum_pages)+0.06*(Number(track_requests)+10);
 // Conservative estimates (not supplier invoices); retain a $25 safety buffer.
 if(estimatedUsd>=425)return json(res,503,{ok:false,blocked:'Europe estimated spend reached $425 reserve threshold',estimated_spend_usd:estimatedUsd});
  const [lease]=await sql`insert into europe_feasibility_progress(task_key,status,detail) values('ops:europe_cron','RUNNING',${JSON.stringify({owner,estimated_spend_usd:estimatedUsd})}::jsonb) on conflict(task_key) do update set status='RUNNING',detail=${JSON.stringify({owner,estimated_spend_usd:estimatedUsd})}::jsonb,updated_at=now() where europe_feasibility_progress.status<>'RUNNING' or europe_feasibility_progress.updated_at<now()-interval '3 minutes' returning task_key`;
 if(!lease)return json(res,200,{ok:true,skipped:'prior invocation still holds lease'});
 try{return await batch(req,res)}finally{await sql`update europe_feasibility_progress set status='IDLE',updated_at=now() where task_key='ops:europe_cron' and detail->>'owner'=${owner}`;}

}
