export default async function(req,res){
 res.setHeader("cache-control","private, no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const key=process.env.AA2398_CHESTER_KEY;
 if(typeof key!=="string"||key.length<32)return res.status(503).json({error:"KEY_NOT_CONFIGURED"});
 const url="https://aevpath-aa2398-test-20261127.vercel.app/api/chester-aa2398?date=2026-11-27&mode=";
 const checks=[];
 for(const mode of ["missing","wrong","correct"]){
  try{
   const headers=mode==="missing"?{}:{"x-aevpath-key":mode==="correct"?key:"deliberately-invalid-key"};
   const r=await fetch(url+"package",{headers,redirect:"manual",signal:AbortSignal.timeout(8000)});
   const b=await r.json().catch(()=>null);
   checks.push({name:mode,status:r.status,appResponse:b?.error||b?.status||null,pass:mode==="correct"?r.status===202&&b?.status==="PENDING_ROUTE"&&b?.sale_state==="PENDING_ROUTE"&&b?.sellable===false:r.status===401&&b?.error==="CHESTER_UNAUTHORIZED"});
  }catch{checks.push({name:mode,pass:false,error:"FETCH_FAILED"});}
 }
 return res.status(200).json({checks,passed:checks.filter(x=>x.pass).length,total:checks.length});
}
