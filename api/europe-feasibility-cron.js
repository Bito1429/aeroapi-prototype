import {json,aero} from './lib.js';
import {randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import batch from './europe-feasibility-batch.js';
export default async function handler(req,res){
 if(!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer '+process.env.CRON_SECRET)return json(res,401,{ok:false,error:'Unauthorized'});
 if(!process.env.EUROPE_DATABASE_URL)return json(res,503,{ok:false,error:'Europe database not configured'});

 const sql=neon(process.env.EUROPE_DATABASE_URL),owner=randomUUID();
 const usage=await aero('/account/usage',{start:'2026-10-20',end:new Date().toISOString().slice(0,10),all_keys:false}).catch(e=>({error:e.message}));
 // Never run paid jobs while supplier cost is unavailable or cannot be interpreted.
 const reported=Number(usage?.total_cost_usd??usage?.total_cost??usage?.total_amount_usd);
 if(!Number.isFinite(reported))return json(res,503,{ok:false,blocked:'FlightAware billing figure unavailable/unparsed'});
 if(reported>=450)return json(res,503,{ok:false,blocked:'Account usage >= $450 conservative ceiling',account_cost_usd:reported});
 const [lease]=await sql`insert into europe_feasibility_progress(task_key,status,detail) values('ops:europe_cron','RUNNING',${JSON.stringify({owner,account_cost_usd:reported})}::jsonb) on conflict(task_key) do update set status='RUNNING',detail=${JSON.stringify({owner,account_cost_usd:reported})}::jsonb,updated_at=now() where europe_feasibility_progress.status<>'RUNNING' or europe_feasibility_progress.updated_at<now()-interval '3 minutes' returning task_key`;
 if(!lease)return json(res,200,{ok:true,skipped:'prior invocation still holds lease'});
 try{return await batch(req,res)}finally{await sql`update europe_feasibility_progress set status='IDLE',updated_at=now() where task_key='ops:europe_cron' and detail->>'owner'=${owner}`;}

}
