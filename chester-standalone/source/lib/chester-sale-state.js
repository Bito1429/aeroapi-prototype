// Chester-only, stored US records; no provider calls.
// Five agreed states. Fail closed when departure status is stale or unknown.
export function saleState(r, now=new Date()){
 const f=r.raw_capture?.flight||{};
 const status=String(f.status||r.flight_status||r.status||"");
 if(/cancel/i.test(status))return "CANCELLED";
 if(r.final_actual_out||r.actual_out_seen||f.actual_out||f.actual_off)return "DEPARTED";
 if(!String(r.origin||"").startsWith("K")||!String(r.destination||"").startsWith("K"))return "UNSUPPORTED_MARKET";
 const current=now.getTime();
 const scheduled=Date.parse(r.scheduled_out||r.scheduled_out_initial||"");
 const estimated=Date.parse(r.estimated_out||f.estimated_out||"");
 const captured=Date.parse(r.last_capture_at||"");
 // If departure time has passed, a recent explicit future gate estimate is required.
 if(!Number.isFinite(scheduled))return "PENDING_ROUTE";
 if(scheduled<=current && !(Number.isFinite(estimated)&&estimated>current&&Number.isFinite(captured)&&current-captured>=0&&current-captured<=30*60000))return "PENDING_ROUTE";
 if(!r.has_route||Number(r.canonical_fix_count)<2)return "PENDING_ROUTE";
 return "SELLABLE";
}
export function nextCheckAfter(now=new Date(),minutes=15){return new Date(now.getTime()+minutes*60000).toISOString();}
