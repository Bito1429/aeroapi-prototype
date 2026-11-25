// Test-only boundary. No provider payload is permitted in this service.
export const RAW_LIMIT_MS=24*60*60*1000;
export const SAFETY_MARGIN_MS=60*60*1000;
export function rawReceiptPolicy({source,receivedAt,now=Date.now()}={}){
 if(source!=="SYNTHETIC_ONLY")return {allowed:false,reason:"RAW_SOURCE_NOT_AUTHORISED"};
 if(typeof receivedAt!=="string"||!receivedAt.endsWith("Z")||!Number.isFinite(now))return {allowed:false,reason:"UNKNOWN_RECEIPT"};
 const t=Date.parse(receivedAt);
 if(!Number.isFinite(t)||t>now)return {allowed:false,reason:"UNKNOWN_RECEIPT"};
 const deadline=t+RAW_LIMIT_MS-SAFETY_MARGIN_MS;
 return {allowed:now<deadline,reason:now<deadline?"SYNTHETIC_MEMORY_ONLY":"RETENTION_DEADLINE",deadline:new Date(deadline).toISOString(),persistRaw:false};
}
