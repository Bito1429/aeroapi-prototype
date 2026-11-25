import {makeDelivery} from "../delivery.mjs";
export default async function(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="preview")return res.status(404).json({error:"NOT_AVAILABLE"});
 const key="synthetic-selftest-only-not-a-real-key",now=Date.now(),iso=n=>new Date(now+n).toISOString(),id="TEST-EXPIRY-001";
 const base={flight_id:id,ident:"TEST004",origin:"KPHL",destination:"KBOS",state:"READY",scheduled_out:iso(3600000),expires_at:iso(7200000),package_json:{schema:"aevpath.package.v1",market:"US",flight_id:id,test_only:true,expires_at:iso(7200000)}};
 const tests=[
 ["valid",{},200,null],
 ["expired READY",{scheduled_out:iso(-7200000),expires_at:iso(-1)},409,"EXPIRED"],
 ["exact expiry",{scheduled_out:iso(-7200000),expires_at:iso(0)},409,"EXPIRED"],
 ["expired cancelled",{state:"CANCELLED",scheduled_out:iso(-7200000),expires_at:iso(-1)},409,"EXPIRED"],
 ["departed",{scheduled_out:iso(-1)},409,"DEPARTED"],
 ["invalid row expiry",{expires_at:"bad"},503,"FAILED"],
 ["invalid departure",{scheduled_out:null},503,"FAILED"],
 ["expiry before departure",{expires_at:iso(1000)},503,"FAILED"],
 ["missing embedded expiry",{package_json:{...base.package_json,expires_at:undefined}},500,"INVALID_TEST_PACKAGE"],
 ["mismatched embedded expiry",{package_json:{...base.package_json,expires_at:iso(7300000)}},500,"INVALID_TEST_PACKAGE"],
 ["pending",{state:"PENDING_ROUTE"},202,null],
 ["cancelled",{state:"CANCELLED"},409,"CANCELLED"],
 ["unknown state",{state:"OTHER"},503,"FAILED"]
 ];
 const results=[];
 for(const [name,patch,wanted,err] of tests){
 let status,body,headers={};
 await makeDelivery({read:async()=>({...base,...patch}),rate:async()=>"ALLOWED",secret:key,clock:()=>now})("package")({method:"GET",headers:{"x-aevpath-key":key},query:{flight_id:id}},{set statusCode(v){status=v},setHeader(k,v){headers[k]=v},end(v){body=JSON.parse(v)}});
 results.push({name,status,pass:status===wanted&&(!err||body.error===err)&&headers["cache-control"]==="private, no-store"&&(wanted===200||!body.schema)});
 }
 let status,body,calls=0;
 await makeDelivery({read:async()=>base,rate:async()=>"ALLOWED",secret:key,clock:()=>calls++===0?now:now+7200000})("package")({method:"GET",headers:{"x-aevpath-key":key},query:{flight_id:id}},{set statusCode(v){status=v},setHeader(){},end(v){body=JSON.parse(v)}});
 results.push({name:"expiry during delivery",status,pass:status===409&&body.error==="EXPIRED"});
 return res.status(200).json({results,passed:results.filter(x=>x.pass).length,total:results.length});
}
