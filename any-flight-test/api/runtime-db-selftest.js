import {neon} from "@neondatabase/serverless";
import {makeSimulatedProvider} from "../simulated-provider.mjs";
import {randomUUID} from "node:crypto";
export default async function(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const url=process.env.ANY_FLIGHT_SIM_RUNTIME_URL;if(!url)return res.status(503).json({error:"RUNTIME_NOT_CONFIGURED"});
 try{
 const sql=neon(url),[identity]=await sql`SELECT current_user AS role`;
 if(identity.role!=="any_flight_sim_runtime_login")return res.status(503).json({error:"WRONG_RUNTIME_ROLE"});
 let calls=0;const adapter=makeSimulatedProvider({reserve:async(i,o,m)=>(await sql`SELECT any_flight.reserve_provider_request(${i}::uuid,${o},${m}) AS result`)[0].result,claim:async i=>(await sql`SELECT any_flight.claim_provider_dispatch(${i}::uuid) AS result`)[0].result,settle:async(i,o)=>(await sql`SELECT any_flight.settle_provider_request(${i}::uuid,${o}) AS result`)[0].result,simulate:async()=>{calls++;return {outcome:"OK"}}});
 const result=await adapter({requestId:randomUUID(),operation:"LOOKUP",unitMills:15});
 const checks=[{name:"restricted runtime identity",pass:true},{name:"disabled provider blocks dispatch",pass:result.status==="RESERVATION_DENIED"&&result.reason==="PROVIDER_DISABLED"&&calls===0}];
 for(const [name,probe] of [["prices",()=>sql`SELECT 1 FROM any_flight.provider_prices LIMIT 1`],["budgets",()=>sql`SELECT 1 FROM any_flight.test_control LIMIT 1`],["ledger",()=>sql`SELECT 1 FROM any_flight.request_reservations LIMIT 1`]]){let denied=false;try{await probe()}catch(e){denied=e.code==="42501"}checks.push({name:"direct "+name+" denied",pass:denied});}
 return res.status(200).json({checks,passed:checks.filter(x=>x.pass).length,total:checks.length,simulatorCalls:calls});
 }catch{return res.status(503).json({error:"RUNTIME_TEST_FAILED"});}
}
