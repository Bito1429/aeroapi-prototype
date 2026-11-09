import {timingSafeEqual} from "node:crypto";
import {json} from "./lib.js";
export function chesterAuthorized(req,res){
 const secret=process.env.CHESTER_SHARED_KEY;
 if(!secret){json(res,503,{error:"CHESTER_ACCESS_NOT_CONFIGURED"});return false;}
 const given=req.headers["x-aevpath-key"];
 const a=Buffer.from(typeof given==="string"?given:""), b=Buffer.from(secret);
 if(a.length!==b.length||!timingSafeEqual(a,b)){json(res,401,{error:"CHESTER_UNAUTHORIZED"});return false;}
 return true;
}