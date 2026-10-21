import {aero,json} from './lib.js';
export default async function handler(req,res){
 if(!process.env.CRON_SECRET || req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)
  return json(res,401,{ok:false,error:'unauthorized'});
 try {
  const usage=await aero('/account/usage',{start:'2026-10-20',end:new Date().toISOString().slice(0,10),all_keys:false});
  return json(res,200,{ok:true,scope:'AeroAPI key usage since 2026-10-20 (not Europe-only)',usage});
 }catch(e){return json(res,502,{ok:false,error:e.message,detail:e.body||null});}
}
