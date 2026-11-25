export default async function(req,res){
res.setHeader("cache-control","no-store");
if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
const host=process.env.VERCEL_URL,key=process.env.ANY_FLIGHT_TEST_KEY,bypass=process.env.ANY_FLIGHT_AUTOMATION_BYPASS;
if(!host||!/^aevpath-us-any-flight-test-[a-z0-9-]+\.vercel\.app$/.test(host)||!key||!bypass)return res.status(503).json({error:"TEST_ENV_MISSING"});
const base="https://"+host,checks=[];
async function get(path,mode="correct",method="GET"){const headers={"x-vercel-protection-bypass":bypass};if(mode!=="missing")headers["x-aevpath-key"]=mode==="correct"?key:"wrong";const r=await fetch(base+path,{headers,method,redirect:"manual",signal:AbortSignal.timeout(8000)});return {status:r.status,body:await r.json().catch(()=>null),cache:r.headers.get("cache-control"),retry:r.headers.get("retry-after")};}
const check=(name,pass)=>checks.push({name,pass:!!pass});
const id="TEST-FULL-DELIVERY-002",paths=["/api/chester-search?ident=TEST002","/api/chester-details?flight_id="+id,"/api/chester-package?flight_id="+id];
for(const [i,path] of paths.entries()){
for(const mode of ["missing","wrong"]){const r=await get(path,mode);check("auth "+i+" "+mode,r.status===401&&r.body?.error==="CHESTER_UNAUTHORIZED");}
const r=await get(path);const f=i===0?r.body?.flights?.find(x=>x.flight_id===id):i===1?r.body?.flight:r.body;
check("delivery "+i,r.status===200&&f?.flight_id===id&&f?.test_only===true&&(i===2?f?.candidate_metadata?.sellable===false:f?.sellable===false&&f?.downloadable===true)&&r.cache==="private, no-store");
}
const lock=await get("/api/chester-package?flight_id=TEST-ACTUAL-OFF-001");check("actual takeoff blocks download",lock.status===409&&lock.body?.error==="DEPARTED"&&!lock.body?.schema);
const details=await get("/api/chester-details?flight_id=TEST-ACTUAL-OFF-001");check("actual takeoff not downloadable",details.status===200&&details.body?.flight?.downloadable===false);
const bad=await get("/api/chester-search?origin=BAD");check("invalid search",bad.status===400);
const method=await get(paths[1],"correct","POST");check("non GET rejected",method.status===405);
const unknown=await get("/api/chester-package?flight_id=TEST-NOT-FOUND");check("unknown flight",unknown.status===404);
return res.status(200).json({checks,passed:checks.filter(x=>x.pass).length,total:checks.length});
}
