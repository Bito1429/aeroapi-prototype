// One-time disposal of isolated AA1776 derived relay records after midnight UTC.
// No raw provider information is ever held in this table. No other tables touched.
import{timingSafeEqual}from"node:crypto";
import{db}from"./db.js";
import{json}from"./lib.js";
export default async function handler(req,res){
 res.setHeader("cache-control","private, no-store");
 if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});
 if(process.env.VERCEL_ENV!=="production")return json(res,503,{error:"PRODUCTION_ONLY"});
 const expected=process.env.CRON_SECRET;
 const hdr=String(req.headers?.authorization||"");
 const given=hdr.startsWith("Bearer ")?hdr.slice(7):"";
 const a=Buffer.from(given),b=Buffer.from(typeof expected==="string"?expected:"");
 if(!expected||a.length!==b.length||!timingSafeEqual(a,b))return json(res,401,{error:"UNAUTHORIZED"});
 const today=new Date().toISOString().slice(0,10);
 if(today!=="2026-11-25"&&today!=="2026-11-27")
  return json(res,403,{error:"OUTSIDE_PURGE_DATE"});
 try{
  const sql=db();
  const rows=await sql`delete from aa1776_planb_relay where expires_at<=now() returning flight_date`;
  return json(res,200,{ok:true,deleted_derived_only:rows.length});
 }catch{
  return json(res,500,{ok:false,error:"DERIVED_RELAY_PURGE_FAILED"});
 }
}
