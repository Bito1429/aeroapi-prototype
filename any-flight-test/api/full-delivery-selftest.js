export default async function(req,res){
res.setHeader("cache-control","no-store");
if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
const key=process.env.ANY_FLIGHT_TEST_KEY,bypass=process.env.ANY_FLIGHT_AUTOMATION_BYPASS;
if(!key||!bypass)return res.status(503).json({error:"TEST_ENV_MISSING"});
const base="https://aevpath-us-any-flight-test-11ci49yug-benitogaldo-5827.vercel.app",id="TEST-FULL-DELIVERY-002";
const paths=["/api/chester-search?ident=TEST002","/api/chester-details?flight_id="+id,"/api/chester-package?flight_id="+id];
const cases=[];
for(let i=0;i<paths.length;i++){
const r=await fetch(base+paths[i],{headers:{"x-vercel-protection-bypass":bypass,"x-aevpath-key":key},redirect:"manual",signal:AbortSignal.timeout(8000)});
const b=await r.json().catch(()=>null);
const f=i===0?b?.flights?.find(x=>x.flight_id===id):b?.flight;
const pass=r.status===200&&(i<2?f?.flight_id===id&&f?.sellable===false&&f?.downloadable===true&&f?.test_only===true:b?.flight_id===id&&b?.test_only===true&&b?.candidate_metadata?.sellable===false&&b?.timeline?.length===31&&b?.route?.line?.length>=2&&b?.eta?.expected_airborne_min===60);
cases.push({endpoint:["search","details","package"][i],status:r.status,pass:!!pass});
}
return res.status(200).json({cases,passed:cases.every(x=>x.pass)});
}
