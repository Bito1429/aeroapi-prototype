import {neon} from "@neondatabase/serverless";
import {equal,reply,deliveryState} from "../lib/http.js";
export default async function handler(req,res){
 if(!process.env.AA2398_CHESTER_KEY)return reply(res,503,{error:"CHESTER_ACCESS_NOT_CONFIGURED"});
 if(!equal(req.headers["x-aevpath-key"],process.env.AA2398_CHESTER_KEY))return reply(res,401,{error:"CHESTER_UNAUTHORIZED"});
 if(req.method!=="GET")return reply(res,405,{error:"METHOD_NOT_ALLOWED"});
 const q=req.query||{};if(q.date!=="2026-11-27"||!["status","package"].includes(q.mode))return reply(res,400,{error:"INVALID_QUERY"});
 try{
 const sql=neon(process.env.AA2398_DELIVERY_URL),[r]=await sql`SELECT * FROM aa2398.delivery`;
 const state=deliveryState(r);if(q.mode==="status")return reply(res,200,{flight:"AA2398",date:q.date,origin:"ORD",destination:"SEA",status:state,reason:r?.reason,sellable:false,downloadable:state==="READY"});
 if(state==="READY")return reply(res,200,r.package_json);
 return reply(res,["DEPARTED","CANCELLED","EXPIRED"].includes(state)?409:202,{status:state,sellable:false,reason:r?.reason});
 }catch{return reply(res,503,{error:"DELIVERY_UNAVAILABLE"});}
}
