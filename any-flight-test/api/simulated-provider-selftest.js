import {makeSimulatedProvider} from "../simulated-provider.mjs";
export default async function(req,res){
res.setHeader("cache-control","no-store");
if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
const base={requestId:"b57f1014-08c1-4f82-87a4-10b0a60b5000",operation:"LOOKUP",unitMills:15};
const checks=[];
async function test(name,patch={},input={},expected="SUCCEEDED",calls=[1,1,1,1],extra=()=>true){
let actual=[0,0,0,0],outcome;
const a=makeSimulatedProvider({reserve:async()=>{actual[0]++;if(patch.reserveThrow)throw Error();return patch.reserve||"RESERVED"},claim:async()=>{actual[1]++;if(patch.claimThrow)throw Error();return patch.claim||"DISPATCH_GRANTED"},simulate:async p=>{actual[2]++;if(p.maxPages!==1||!Object.isFrozen(p))throw Error("INVALID_INPUT");if(patch.simThrow)throw Error();return {outcome:patch.outcome||"OK",nextPage:patch.nextPage}},settle:async(id,o)=>{actual[3]++;outcome=o;if(patch.settleThrow)throw Error();return patch.settle||"SETTLED"}});
const result=await a({...base,...input});checks.push({name,status:result.status,pass:result.status===expected&&actual.every((n,i)=>n===calls[i])&&extra(result,outcome)});
}
await test("valid");
await test("extra page requested",{},{maxPages:2},"INVALID_REQUEST",[0,0,0,0]);
await test("invalid request ID",{},{requestId:"bad"},"INVALID_REQUEST",[0,0,0,0]);
await test("underquote",{reserve:"PRICE_MISMATCH"},{},"RESERVATION_DENIED",[1,0,0,0]);
await test("disabled",{reserve:"PROVIDER_DISABLED"},{},"RESERVATION_DENIED",[1,0,0,0]);
await test("duplicate",{reserve:"DUPLICATE_REQUEST"},{},"RESERVATION_DENIED",[1,0,0,0]);
await test("reservation exception",{reserveThrow:true},{},"RESERVATION_UNCERTAIN",[1,0,0,0]);
await test("claim denied",{claim:"ALREADY_CLAIMED"},{},"DISPATCH_DENIED",[1,1,0,0]);
await test("claim exception",{claimThrow:true},{},"DISPATCH_UNCERTAIN",[1,1,0,0]);
await test("page pointer ignored",{nextPage:"synthetic-page"},{},"SUCCEEDED",[1,1,1,1],r=>r.additionalPagesBlocked===true);
await test("HTTP failure",{outcome:"HTTP_ERROR"},{},"FAILED",[1,1,1,1],(r,o)=>o==="HTTP_ERROR");
await test("timeout",{outcome:"TIMEOUT"},{},"UNCERTAIN",[1,1,1,1],(r,o)=>o==="TIMEOUT");
await test("network error",{outcome:"NETWORK_ERROR"},{},"UNCERTAIN",[1,1,1,1]);
await test("simulator exception",{simThrow:true},{},"UNCERTAIN",[1,1,1,1],(r,o)=>o==="UNKNOWN");
await test("unknown response",{outcome:"BOGUS"},{},"UNCERTAIN",[1,1,1,1],(r,o)=>o==="UNKNOWN");
await test("settlement exception",{settleThrow:true},{},"SETTLEMENT_UNCERTAIN",[1,1,1,1]);
await test("settlement denied",{settle:"NOT_DISPATCHED_OR_ALREADY_SETTLED"},{},"SETTLEMENT_UNCERTAIN",[1,1,1,1]);
return res.status(200).json({checks,passed:checks.filter(x=>x.pass).length,total:checks.length});
}
