import {neon} from "@neondatabase/serverless";
import {equal,reply} from "../lib/http.js";
import {scoreTrack} from "../lib/score-policy.js";
export default async function(req,res){
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="production"||!process.env.CRON_SECRET||!equal(req.headers.authorization,"Bearer "+process.env.CRON_SECRET)||!String(req.headers["user-agent"]||"").startsWith("vercel-cron/"))return reply(res,401,{error:"UNAUTHORIZED"});
 if(!process.env.AA2398_PROVIDER_KEY||!process.env.AA2398_RUNTIME_URL)return reply(res,503,{status:"NOT_CONFIGURED"});
 const sql=neon(process.env.AA2398_RUNTIME_URL);let claimed=false;
 try{
 const [r]=await sql`SELECT aa2398.claim_score() AS result`;const c=r.result;
 if(c.status!=="CLAIMED")return reply(res,200,{status:c.status,providerCalls:0});
 claimed=true;let raw=null,score;
 try{
 const response=await fetch("https://aeroapi.flightaware.com/aeroapi/flights/"+encodeURIComponent(c.flight_id)+"/track",{headers:{"x-apikey":process.env.AA2398_PROVIDER_KEY},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("TRACK_FAILED");raw=await response.json();score=scoreTrack(c.package,raw,c.actual_off,c.actual_on);
 }finally{raw=null;}
 const [done]=await sql`SELECT aa2398.finish_score(${JSON.stringify(score)}::jsonb) AS result`;return reply(res,200,{status:done.result,providerCalls:1});
 }catch{if(claimed){try{await sql`SELECT aa2398.finish_score(NULL::jsonb)`}catch{}}return reply(res,503,{status:"SCORING_FAILED"});}
}
