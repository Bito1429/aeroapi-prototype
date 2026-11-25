import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {collect,START,END,DATE} from "../lib/policy.js";
import {equal,reply} from "../lib/http.js";
export default async function handler(req,res){
 if(req.method!=="GET")return reply(res,405,{error:"METHOD_NOT_ALLOWED"});
 if(process.env.VERCEL_ENV!=="production"||!equal(req.headers.authorization,"Bearer "+(process.env.CRON_SECRET||""))||!process.env.CRON_SECRET||!String(req.headers["user-agent"]||"").startsWith("vercel-cron/"))return reply(res,401,{error:"UNAUTHORIZED"});
 const now=new Date().toISOString();
 if(now<START||now>=END)return reply(res,200,{status:"OUTSIDE_WINDOW",providerCalls:0});
 if(!process.env.AA2398_RUNTIME_URL)return reply(res,503,{status:"DATABASE_NOT_CONFIGURED",providerCalls:0});
 const sql=neon(process.env.AA2398_RUNTIME_URL);
 const key=process.env.AA2398_PROVIDER_KEY;
 async function provider(path,params={}){
  if(!key)throw Error("PROVIDER_NOT_CONFIGURED");
  const url=new URL("https://aeroapi.flightaware.com/aeroapi"+path);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const r=await fetch(url,{headers:{"x-apikey":key},redirect:"error",signal:AbortSignal.timeout(8000),cache:"no-store"});
  if(!r.ok)throw Error("PROVIDER_HTTP_ERROR");
  return r.json();
 }
 try{
 const result=await collect({now,requestId:randomUUID,providerConfigured:!!key,claim:async()=>(await sql`SELECT aa2398.claim_slot() AS result`)[0].result,reserve:async(id,k)=>(await sql`SELECT aa2398.reserve(${id}::uuid,${k}) AS result`)[0].result,mark:async(s,r)=>{await sql`SELECT aa2398.mark(${s},${r})`;},store:async(p)=>(await sql`SELECT aa2398.store_package(${JSON.stringify(p)}::jsonb) AS result`)[0].result,lookup:()=>provider("/flights/AAL2398",{start:DATE+"T00:00:00Z",end:"2026-11-28T00:00:00Z",max_pages:"1"}),route:id=>provider("/flights/"+encodeURIComponent(id)+"/route")});
 return reply(res,200,result);
 }catch{return reply(res,503,{status:"COLLECTOR_FAILED"});}
}
