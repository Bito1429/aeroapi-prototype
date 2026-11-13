// Chester-only sale decision from stored US campaign records. No provider calls.
// Fail closed: a flight is not sellable without a usable persisted capture.
export function saleState(r){
  const flight=r.raw_capture?.flight||{};
  const status=String(flight.status||r.status||"");
  if(/cancel/i.test(status))return "CANCELLED";
  if(r.final_actual_out||r.actual_out_seen||flight.actual_out||flight.actual_off)return "DEPARTED";
  if(!String(r.origin||"").startsWith("K")||!String(r.destination||"").startsWith("K"))return "UNSUPPORTED_MARKET";
  if(!r.has_route||Number(r.canonical_fix_count)<2)return "PENDING_ROUTE";
  return "SELLABLE";
}
export function nextCheckAfter(now=new Date(),minutes=15){
  return new Date(now.getTime()+minutes*60000).toISOString();
}
