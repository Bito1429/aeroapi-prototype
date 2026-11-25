import { timingSafeEqual,randomUUID,createHmac } from "node:crypto";
export function makeDelivery({read,rate,secret,alert=()=>{},clock=()=>Date.now()}){
 return kind=>async(req,res)=>{
  const id=randomUUID();
  const send=(status,body)=>{res.statusCode=status;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","private, no-store");res.setHeader("x-request-id",id);res.end(JSON.stringify(body));};
  const fail=(status,error)=>send(status,{error,request_id:id});
  const report=async(code)=>{const event={code,request_id:id,component:kind};try{await alert(event);}catch{console.error(JSON.stringify({...event,alert_persistence:"FAILED"}));}};
  if(typeof secret!=="string"||secret.length<32){await report("TEST_KEY_NOT_CONFIGURED");return fail(503,"TEST_KEY_NOT_CONFIGURED");}
  const supplied=req.headers?.["x-aevpath-key"];
  const a=Buffer.from(typeof supplied==="string"&&supplied.length<=256?supplied:""),b=Buffer.from(secret);
  if(a.length!==b.length||!timingSafeEqual(a,b))return fail(401,"CHESTER_UNAUTHORIZED");
  // One shared key bucket across all delivery endpoints. Never store the key or client IP.
  try{
   if(typeof rate!=="function")throw Error("RATE_NOT_CONFIGURED");
   const client=createHmac("sha256",secret).update("any-flight-delivery-client-v1").digest("hex");
   const decision=await rate(client);
   if(decision==="CLIENT_RATE_LIMIT"||decision==="GLOBAL_RATE_LIMIT"){res.setHeader("retry-after","60");return fail(429,"RATE_LIMIT");}
   if(decision!=="ALLOWED")throw Error("RATE_DECISION_INVALID");
  }catch{await report("RATE_CONTROL_FAILED");return fail(503,"RATE_CONTROL_FAILED");}
  if(req.method!=="GET")return fail(405,"METHOD_NOT_ALLOWED");
  const q=req.query||{};
  // Neon may return native Date objects; Date.parse(Date) loses fractional seconds.
  const time=v=>v instanceof Date?v.getTime():typeof v==="string"?Date.parse(v):NaN;
  const state=r=>{
   const now=clock(),expires=time(r.expires_at),out=time(r.scheduled_out);
   if(!Number.isFinite(now)||!Number.isFinite(expires)||!Number.isFinite(out)||expires<=out)return "FAILED";
   if(expires<=now)return "EXPIRED";
   if(r.state==="CANCELLED"||r.state==="FAILED")return r.state;
   if(r.state==="DEPARTED"||out<=now)return "DEPARTED";
   return r.state==="READY"||r.state==="PENDING_ROUTE"?r.state:"FAILED";
  };
  const summary=r=>({flight_id:r.flight_id,ident:r.ident,origin:r.origin,destination:r.destination,scheduled_out:r.scheduled_out,sale_state:state(r),sellable:false,test_only:true,downloadable:state(r)==="READY",package_url:"/api/chester-package?flight_id="+encodeURIComponent(r.flight_id)});
  try{
   if(kind==="search"){
    const filters={};for(const [k,pattern] of Object.entries({ident:/^[A-Z0-9]{1,16}$/,origin:/^K[A-Z]{3}$/,destination:/^K[A-Z]{3}$/})){if(q[k]!==undefined){if(typeof q[k]!=="string"||!pattern.test(q[k].toUpperCase()))return fail(400,"INVALID_SEARCH");filters[k]=q[k].toUpperCase();}}
    const rows=await read("search",filters);return send(200,{source:"isolated_test_only",flights:rows.map(summary)});
   }
   if(typeof q.flight_id!=="string"||! /^[A-Za-z0-9_-]{1,160}$/.test(q.flight_id))return fail(400,"FLIGHT_ID_REQUIRED");
   const r=await read("id",q.flight_id);if(!r)return fail(404,"FLIGHT_NOT_FOUND");
   if(kind==="details")return send(200,{source:"isolated_test_only",flight:summary(r),sale_state:state(r)});
   const s=state(r);if(s==="PENDING_ROUTE")return send(202,{status:s,sellable:false,request_id:id});
   if(s!=="READY")return fail(s==="FAILED"?503:409,s);
   if(r.package_json?.schema!=="aevpath.package.v1"||r.package_json?.market!=="US"||r.package_json?.flight_id!==r.flight_id||r.package_json?.test_only!==true){await report("INVALID_TEST_PACKAGE");return fail(500,"INVALID_TEST_PACKAGE");}
   // The legacy transport-only fixture has no embedded expiry; all full packages must match the row.
   const legacy=r.flight_id==="TEST-DELIVERY-001"&&r.package_json.fixture_kind==="TRANSPORT_ONLY_NOT_NAVIGATION";
   const embedded=time(r.package_json.expires_at);
   if(!legacy&&(!Number.isFinite(embedded)||embedded!==time(r.expires_at))){await report("INVALID_TEST_PACKAGE");return fail(500,"INVALID_TEST_PACKAGE");}
   // Recheck immediately before sending, including time spent reading the database.
   const finalState=state(r);if(finalState!=="READY")return fail(finalState==="FAILED"?503:409,finalState);
   return send(200,r.package_json);
  }catch{await report("DELIVERY_READ_FAILED");return fail(503,"DELIVERY_READ_FAILED");}
 };
}
