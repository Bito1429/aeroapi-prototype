// Fixed test destination, preview only, no secrets in output.
export default async function(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const key=process.env.ANY_FLIGHT_TEST_KEY,bypass=process.env.ANY_FLIGHT_AUTOMATION_BYPASS;
 if(!key||!bypass)return res.status(503).json({error:"TEST_ENV_MISSING"});
 const base="https://aevpath-us-any-flight-test-m5hf1ufti-benitogaldo-5827.vercel.app";
 const paths=["/api/chester-search?ident=TEST001","/api/chester-details?flight_id=TEST-DELIVERY-001","/api/chester-package?flight_id=TEST-DELIVERY-001"];
 const start=Date.now(), minute=Math.floor(start/60000);
 if(start%60000>40000)return res.status(200).json({error:"MINUTE_BOUNDARY_TOO_CLOSE",passed:false});
 const headers={"x-vercel-protection-bypass":bypass,"x-aevpath-key":key};
 const cases=await Promise.all(Array.from({length:31},async(_,i)=>{
  try{const r=await fetch(base+paths[i%3],{headers,redirect:"manual",signal:AbortSignal.timeout(10000)});
  const b=await r.json().catch(()=>null);
  return {status:r.status,valid:r.status===200?(i%3===0?b?.flights?.some(x=>x.flight_id==="TEST-DELIVERY-001"):i%3===1?b?.flight?.flight_id==="TEST-DELIVERY-001":b?.flight_id==="TEST-DELIVERY-001"&&b?.test_only===true):r.status===429&&b?.error==="RATE_LIMIT"&&r.headers.get("retry-after")==="60"};
  }catch{return {status:0,valid:false};}
 }));
 const ok=cases.filter(x=>x.status===200&&x.valid).length,limited=cases.filter(x=>x.status===429&&x.valid).length;
 const sameMinute=Math.floor(Date.now()/60000)===minute;
 return res.status(200).json({total:cases.length,ok,limited,other:cases.length-ok-limited,sameMinute,passed:ok===30&&limited===1&&sameMinute});
}
