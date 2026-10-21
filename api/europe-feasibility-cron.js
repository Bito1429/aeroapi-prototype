import {json} from './lib.js';
import {neon} from '@neondatabase/serverless';
import batch from './europe-feasibility-batch.js';
export default async function handler(req,res){
 if(!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer '+process.env.CRON_SECRET)return json(res,401,{ok:false,error:'Unauthorized'});
 if(!process.env.EUROPE_DATABASE_URL)return json(res,503,{ok:false,error:'Europe database not configured'});
 const sql=neon(process.env.EUROPE_DATABASE_URL);
 const [lease]=await sql`insert into europe_feasibility_progress(task_key,status,detail) values('ops:europe_cron','IDLE','{}'::jsonb) on conflict(task_key) do update set status='RUNNING',updated_at=now() where europe_feasibility_progress.status<>'RUNNING' or europe_feasibility_progress.updated_at<now()-interval '3 minutes' returning task_key`;
 if(!lease)return json(res,200,{ok:true,skipped:'prior invocation still holds lease'});
 try{return await batch(req,res)}finally{await sql`update europe_feasibility_progress set status='IDLE',updated_at=now() where task_key='ops:europe_cron'`;}
}
