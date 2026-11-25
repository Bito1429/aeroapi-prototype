import {neon} from "@neondatabase/serverless";
import {equal,reply} from "../lib/http.js";
import {postflight} from "../lib/postflight.js";
export default async function(req,res){
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="production"||!process.env.CRON_SECRET||!equal(req.headers.authorization,"Bearer "+process.env.CRON_SECRET)||!String(req.headers["user-agent"]||"").startsWith("vercel-cron/"))return reply(res,401,{error:"UNAUTHORIZED"});
 if(!process.env.AA2398_PROVIDER_KEY||!process.env.AA2398_RUNTIME_URL)return reply(res,503,{status:"NOT_CONFIGURED"});
 const sql=neon(process.env.AA2398_RUNTIME_URL);
 const fetchRaw=async(path)=>{const r=await fetch("https://aeroapi.flightaware.com/aeroapi"+path,{headers:{"x-apikey":process.env.AA2398_PROVIDER_KEY},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error("PROVIDER_HTTP_ERROR");return r.json();};
 const result=await postflight({now:Date.now,claimStatus:async()=>(await sql`SELECT aa2398.claim_postflight_status() AS result`)[0].result,status:id=>fetchRaw("/flights/"+encodeURIComponent(id)+"?max_pages=1"),confirm:async(id,off,on)=>(await sql`SELECT aa2398.accept_postflight_status(${id},${off}::timestamptz,${on}::timestamptz) AS result`)[0].result,claimTrack:async()=>(await sql`SELECT aa2398.claim_score() AS result`)[0].result,track:id=>fetchRaw("/flights/"+encodeURIComponent(id)+"/track"),finish:async(score)=>(await sql`SELECT aa2398.finish_score(${score===null?null:JSON.stringify(score)}::jsonb) AS result`)[0].result,alert:async(code)=>{await sql`SELECT aa2398.record_event(${code},'SCORING',false)`;}});
 return reply(res,result.status==="POSTFLIGHT_FAILED"?503:200,result);
}
