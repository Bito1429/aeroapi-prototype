import{db}from'./db.js';import{json}from'./lib.js';
const TEST_ID=4698;
export default async function handler(req,res){try{const s=db();const r=await s`update flight_checkpoints set state='PROCESSING',claimed_at=now(),attempt_count=attempt_count+1,error_text='ENTRY658_FORCED_STRAND' where id=${TEST_ID} and state='PENDING' returning id,flight_job_id,label,state,claimed_at,attempt_count`;json(res,200,{ok:true,stranded:r[0]||null});}catch(e){json(res,500,{ok:false,error:e.message})}}
