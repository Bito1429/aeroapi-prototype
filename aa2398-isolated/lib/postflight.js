import {scoreTrack} from "./score-policy.js";
export function confirmedTimes(payload,id,now){
 const matches=Array.isArray(payload?.flights)?payload.flights.filter(f=>f?.fa_flight_id===id):[];
 if(matches.length!==1)throw Error("STATUS_ID_INVALID");
 const f=matches[0],off=Date.parse(f.actual_off),on=Date.parse(f.actual_on);
 if(f.ident_icao!=="AAL2398"||f.origin?.code_icao!=="KORD"||f.destination?.code_icao!=="KSEA"||!String(f.scheduled_out||"").startsWith("2026-11-27")||f.cancelled||f.diverted||!Number.isFinite(off)||!Number.isFinite(on)||on<=off||on>now-600000)throw Error("LANDING_UNCONFIRMED");
 return {off:new Date(off).toISOString(),on:new Date(on).toISOString()};
}
export async function postflight(d){
 let providerCalls=0,claimedTrack=false;
 try{
 const status=await d.claimStatus();
 if(status.status==="CLAIMED"){
 providerCalls++;const times=confirmedTimes(await d.status(status.flight_id),status.flight_id,d.now());
 const result=await d.confirm(status.flight_id,times.off,times.on);
 if(result!=="CONFIRMED")throw Error("LANDING_CONFIRMATION_FAILED");
 }else if(status.status!=="CAP_OR_DUPLICATE")return {status:status.status,providerCalls};
 const c=await d.claimTrack();
 if(c.status!=="CLAIMED")return {status:c.status,providerCalls};
 claimedTrack=true;providerCalls++;
 const score=scoreTrack(c.package,await d.track(c.flight_id),c.actual_off,c.actual_on);
 const done=await d.finish(score);if(done!=="RECORDED")throw Error("SCORE_STORAGE_FAILED");
 return {status:"SCORED",providerCalls};
 }catch{if(claimedTrack){try{await d.finish(null)}catch{}}try{await d.alert("POSTFLIGHT_FAILED")}catch{}return {status:"POSTFLIGHT_FAILED",providerCalls};}
}
