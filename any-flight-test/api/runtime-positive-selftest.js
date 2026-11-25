import {neon} from "@neondatabase/serverless";
import {makeSimulatedProvider} from "../simulated-provider.mjs";
export default async function(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const url=process.env.ANY_FLIGHT_SIM_RUNTIME_URL;if(!url)return res.status(503).json({error:"RUNTIME_NOT_CONFIGURED"});
 try{
 const sql=neon(url),[identity]=await sql`SELECT current_user AS role`;
 if(identity.role!=="any_flight_sim_runtime_login")return res.status(503).json({error:"WRONG_RUNTIME_ROLE"});
 const id=i=>"b57f1014-08c1-4f82-87a4-10b0a60b8"+String(i).padStart(3,"0");
 let calls=0;const adapter=makeSimulatedProvider({reserve:async(i,o,m)=>(await sql`SELECT any_flight.reserve_provider_request(${i}::uuid,${o},${m}) AS result`)[0].result,claim:async i=>(await sql`SELECT any_flight.claim_provider_dispatch(${i}::uuid) AS result`)[0].result,settle:async(i,o)=>(await sql`SELECT any_flight.settle_provider_request(${i}::uuid,${o}) AS result`)[0].result,simulate:async p=>{calls++;return {outcome:p.requestId===id(2)?"HTTP_ERROR":p.requestId===id(3)?"TIMEOUT":"OK",nextPage:"synthetic"}}});
 const cases=[["underquote",4,{unitMills:1},"RESERVATION_DENIED","PRICE_MISMATCH"],["extra pages",5,{maxPages:2},"INVALID_REQUEST"],["success",1,{},"SUCCEEDED"],["failure",2,{},"FAILED"],["timeout",3,{},"UNCERTAIN"],["duplicate",3,{},"RESERVATION_DENIED","DUPLICATE_REQUEST"],["cap",6,{},"RESERVATION_DENIED","DAILY_CAP_REACHED"]];
 const checks=[];
 for(const [name,i,extra,want,reason] of cases){const r=await adapter({requestId:id(i),operation:"LOOKUP",unitMills:15,...extra});checks.push({name,status:r.status,reason:r.reason,pass:r.status===want&&(!reason||r.reason===reason)&&(name!=="success"||r.additionalPagesBlocked===true)});}
 return res.status(200).json({checks,passed:checks.filter(x=>x.pass).length,total:checks.length,simulatorCalls:calls});
 }catch{return res.status(503).json({error:"RUNTIME_TEST_FAILED"});}
}
