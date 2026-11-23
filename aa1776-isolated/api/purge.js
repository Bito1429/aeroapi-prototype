import{timingSafeEqual}from"node:crypto";
import{db}from"../lib/db.js";
import{json}from"../lib/lib.js";
export default async function handler(req,res){
 res.setHeader("cache-control","private,no-store");
 const auth=String(req.headers?.authorization||"");
 const token=auth.startsWith("Bearer ")?auth.slice(7):"";
 const expected=process.env.CRON_SECRET||"";
 const a=Buffer.from(token),b=Buffer.from(expected);
 if(!expected||!String(req.headers?.["user-agent"]||"").startsWith("vercel-cron/")||a.length!==b.length||!timingSafeEqual(a,b))return json(res,401,{error:"UNAUTHORIZED"});
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="production")return json(res,403,{error:"CRON_PRODUCTION_ONLY"});
 const now=new Date().toISOString();
 const date=now.slice(0,10);
 if(!["2026-11-24","2026-11-25","2026-11-27"].includes(date))return json(res,403,{error:"PURGE_DATE_CLOSED"});
 try{const sql=db();const rows=await sql`delete from aa1776_planb_relay where expires_at<=now() returning flight_date`;return json(res,200,{ok:true,derived_records_purged:rows.length});}
 catch{return json(res,500,{error:"AA1776_PURGE_FAILED"});}
}
