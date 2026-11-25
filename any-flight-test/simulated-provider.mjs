// Synthetic-only adapter. No network imports, provider URL, or provider credentials.
const outcomes=new Set(["OK","HTTP_ERROR","TIMEOUT","NETWORK_ERROR","UNKNOWN"]);
const operations=new Set(["LOOKUP","ROUTE","TRACK","FLIGHT"]);
export function makeSimulatedProvider({reserve,claim,settle,simulate}){
 if([reserve,claim,settle,simulate].some(x=>typeof x!=="function"))throw Error("SIMULATION_DEPENDENCY_MISSING");
 return async ({requestId,operation,unitMills,maxPages=1})=>{
  if(typeof requestId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)||!operations.has(operation)||!Number.isSafeInteger(unitMills)||unitMills<=0||maxPages!==1)return {status:"INVALID_REQUEST",attempts:0};
  let reserved;
  try{reserved=await reserve(requestId,operation,unitMills);}catch{return {status:"RESERVATION_UNCERTAIN",attempts:0};}
  if(reserved!=="RESERVED")return {status:"RESERVATION_DENIED",reason:reserved,attempts:0};
  let claimed;
  try{claimed=await claim(requestId);}catch{return {status:"DISPATCH_UNCERTAIN",attempts:0};}
  if(claimed!=="DISPATCH_GRANTED")return {status:"DISPATCH_DENIED",reason:claimed,attempts:0};
  // Exactly one simulator invocation. Do not follow next-page pointers or retry.
  let result,outcome;
  try{result=await simulate(Object.freeze({requestId,operation,maxPages:1}));outcome=outcomes.has(result?.outcome)?result.outcome:"UNKNOWN";}catch{outcome="UNKNOWN";}
  let settled;
  try{settled=await settle(requestId,outcome);}catch{return {status:"SETTLEMENT_UNCERTAIN",outcome,attempts:1};}
  if(settled!=="SETTLED")return {status:"SETTLEMENT_UNCERTAIN",outcome,attempts:1};
  return {status:outcome==="OK"?"SUCCEEDED":outcome==="HTTP_ERROR"?"FAILED":"UNCERTAIN",outcome,attempts:1,additionalPagesBlocked:!!result?.nextPage};
 };
}
