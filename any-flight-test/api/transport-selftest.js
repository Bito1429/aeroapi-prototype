// Vercel-protected test runner, fixed destination, no secrets in output.
export default async function(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const key=process.env.ANY_FLIGHT_TEST_KEY,bypass=process.env.ANY_FLIGHT_AUTOMATION_BYPASS;
 if(!key||!bypass)return res.status(503).json({error:"TEST_ENV_MISSING"});
 const base="https://aevpath-us-any-flight-test-m5hf1ufti-benitogaldo-5827.vercel.app";
 const cases=[];
 for(const [name,path] of Object.entries({search:"/api/chester-search?ident=TEST001",details:"/api/chester-details?flight_id=TEST-DELIVERY-001",package:"/api/chester-package?flight_id=TEST-DELIVERY-001"})){
  for(const mode of ["missing","wrong","correct"]){
   try{
    const headers={"x-vercel-protection-bypass":bypass};
    if(mode!=="missing")headers["x-aevpath-key"]=mode==="correct"?key:"deliberately-invalid-key";
    const r=await fetch(base+path,{headers,redirect:"manual",signal:AbortSignal.timeout(5000)});
    const b=await r.json().catch(()=>null);
    const valid=mode==="correct"?(name==="search"?b?.flights?.some(x=>x.flight_id==="TEST-DELIVERY-001"):name==="details"?b?.flight?.flight_id==="TEST-DELIVERY-001":b?.flight_id==="TEST-DELIVERY-001"&&b?.test_only===true):b?.error==="CHESTER_UNAUTHORIZED"&&typeof b?.request_id==="string";
    cases.push({endpoint:name,mode,status:r.status,pass:!!valid&&r.status===(mode==="correct"?200:401),appError:mode!=="correct"&&b?.error==="CHESTER_UNAUTHORIZED"});
   }catch{cases.push({endpoint:name,mode,pass:false,error:"HTTP_TEST_FAILED"});}
  }
 }
 return res.status(200).json({cases,passed:cases.filter(x=>x.pass).length,total:cases.length});
}
