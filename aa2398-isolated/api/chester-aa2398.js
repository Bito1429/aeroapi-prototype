import {neon} from "@neondatabase/serverless";
import {equal,reply,deliveryState} from "../lib/http.js";
export function makeHandler({readRow,now=()=>Date.now(),key=()=>process.env.AA2398_CHESTER_KEY}={}){return async function handler(req,res){
 if(!key())return reply(res,503,{error:"CHESTER_ACCESS_NOT_CONFIGURED"});
 if(!equal(req.headers["x-aevpath-key"],key()))return reply(res,401,{error:"CHESTER_UNAUTHORIZED"});
 if(req.method!=="GET")return reply(res,405,{error:"METHOD_NOT_ALLOWED"});
 const date=String(req.query?.date||""),mode=String(req.query?.mode||"package");
 if(date!=="2026-11-27"||!["status","package"].includes(mode))return reply(res,400,{error:"AA1776_DATE_OR_MODE_INVALID"});
 let sql;
 try{
 if(!readRow)sql=neon(process.env.VERCEL_ENV==='preview'&&process.env.AA2398_LIFECYCLE_DELIVERY_URL?process.env.AA2398_LIFECYCLE_DELIVERY_URL:process.env.AA2398_DELIVERY_URL);const r=readRow?await readRow():(await sql`SELECT * FROM aa2398.delivery`)[0];
 const raw=deliveryState(r,now()),state=raw==="READY"?"SELLABLE":raw==="DEPARTED"||raw==="CANCELLED"?raw:"PENDING_ROUTE";
 const again=new Date(now()+15*60000).toISOString();
 if(!r?.flight_id)return reply(res,202,{status:"PENDING_ROUTE",sale_state:"PENDING_ROUTE",sellable:false,flight_date:date,check_again_after:again});
 if(mode==="status"){const f=r.package_json?.flight||{};return reply(res,200,{flight_date:date,flight_id:r.flight_id,ident:r.ident||f.ident||"AAL2398",origin:"KORD",destination:"KSEA",scheduled_out:r.scheduled_out,scheduled_on:r.scheduled_on||f.scheduled_arrival||null,status:state==="SELLABLE"?"SCHEDULED":state,sale_state:state,sellable:state==="SELLABLE",package_status:state==="SELLABLE"?"CAPTURE_AVAILABLE":"NOT_SELLABLE",last_capture_at:r.source_captured_at??null,...(state==="PENDING_ROUTE"?{check_again_after:again}:{})});}
 if(state==="DEPARTED"||state==="CANCELLED")return reply(res,409,{status:state,sale_state:state,sellable:false,flight_date:date});
 if(state!=="SELLABLE")return reply(res,202,{status:"PENDING_ROUTE",sale_state:state,sellable:false,flight_date:date,check_again_after:again});
 return reply(res,200,r.package_json);
 }catch{try{await sql`SELECT aa2398.record_event('DELIVERY_FAILED','DELIVERY',false)`}catch{}console.error("AA2398_DELIVERY_FAILED");return reply(res,500,{error:"AA1776_PACKAGE_UNAVAILABLE"});}
}
}
export default makeHandler();
