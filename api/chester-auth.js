import {timingSafeEqual} from "node:crypto";
import {json} from "./lib.js";
// Preview is protected by Vercel Authentication. Production requires a
// dedicated Chester key and never accepts the FlightAware provider key.
export function chesterAuthorized(req,res){
 if(process.env.VERCEL_ENV!=="production")return true;
 const expected=process.env.CHESTER_SHARED_KEY;
 if(!expected){json(res,503,{error:"CHESTER_ACCESS_NOT_CONFIGURED"});return false;}
 const given=req.headers["x-aevpath-key"];
 const a=Buffer.from(typeof given==="string"?given:""),b=Buffer.from(expected);
 if(a.length!==b.length||!timingSafeEqual(a,b)){
  json(res,401,{error:"CHESTER_UNAUTHORIZED"});return false;
 }
 return true;
}
