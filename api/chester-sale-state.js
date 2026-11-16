// Chester-only sale decision using stored AevPath-owned derived packages.
// Fail closed: never sell from raw route presence alone, stale package, or unconfirmed departure.
export function saleState(r,now=new Date()){
  const flight=r.raw_capture?.flight||{};
  const status=String(flight.status||r.status||"");
  if(/cancel/i.test(status))return "CANCELLED";
  if(r.final_actual_out||r.actual_out_seen||flight.actual_out||flight.actual_off)return "DEPARTED";
  if(!String(r.origin||"").startsWith("K")||!String(r.destination||"").startsWith("K"))return "UNSUPPORTED_MARKET";
  const nowMs=+new Date(now);
  const outMs=Date.parse(r.estimated_out||r.scheduled_out||"");
  const packageMs=Date.parse(r.last_capture_at||"");
  // No confirmed future gate departure, no READY stored package, or package too old:
  // return the existing retryable state, never introduce a sixth state.
  if(!Number.isFinite(outMs)||outMs<=nowMs||
     !r.has_route||!Number.isFinite(packageMs)||packageMs>nowMs||
     nowMs-packageMs>30*60*1000)return "PENDING_ROUTE";
  return "SELLABLE";
}
export function nextCheckAfter(now=new Date(),minutes=15){
  return new Date(now.getTime()+minutes*60000).toISOString();
}
