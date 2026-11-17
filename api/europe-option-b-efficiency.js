// Europe trial request efficiency. Does not alter the frozen prediction or scoring method.
export const MAX_PROVIDER_REQUESTS=300;
export const OPERATING_REQUESTS=280; // 20-request safety reserve
export const COLLECT_REQUESTS=96;
export function cooldownMinutes(phase,status=200){
 if(status===503)return 90;
 return phase==="score"?50:75;
}
export function chooseDiscoveryRoutes(seeded,unseeded,slot,limit=2){
 const out=[];
 const add=(pool,n,offset)=>{for(let i=0;i<Math.min(n,pool.length)&&out.length<limit;i++){
  const key=pool[(offset+i)%pool.length];
  if(!out.includes(key))out.push(key);
 }};
 if(slot%8===0&&unseeded.length){add(seeded,1,slot);add(unseeded,1,slot);}
 else add(seeded,2,slot*2);
 if(out.length<limit)add(unseeded,limit-out.length,slot);
 return out;
}
