import{lookup,captureFlight,addMin,json}from"./lib.js";import{createJob,addCheckpoint,saveCapture,checkpointState,jobSummary}from"./db.js";
export default async function handler(req,res){try{
 const ident=String(req.query.ident||req.body?.ident||"").trim(),date=String(req.query.date||req.body?.date||"").trim(),fid=String(req.query.id||req.body?.id||"").trim();let f;
 if(fid){const c=await captureFlight(fid);f={...c.flight,origin:{code_icao:c.flight.origin},destination:{code_icao:c.flight.destination}}}
 else{if(!ident||!date)return json(res,400,{ok:false,error:"ident and date required, or id"});const fs=await lookup(ident,date);if(fs.length!==1)return json(res,409,{ok:false,error:"flight selection not unique",matches:fs.map(x=>({fa_flight_id:x.fa_flight_id,ident:x.ident,scheduled_out:x.scheduled_out,origin:x.origin?.code_icao||x.origin?.code,destination:x.destination?.code_icao||x.destination?.code}))});f=fs[0];}
 if(!f.scheduled_out)return json(res,422,{ok:false,error:"scheduled_out unavailable"});
 const j=await createJob(f),s=f.scheduled_out,now=Date.now(),t120=new Date(s).getTime()-120*60000,t60=new Date(s).getTime()-60*60000;
 let initState="PENDING",initDue=addMin(s,-90);if(now>=t60)initState="MISSING";else if(now>=t120)initDue=new Date().toISOString();
 const init=await addCheckpoint(j.id,"INITIAL",initDue,1,initState,initDue);
 async function required(label,offset){const nominal=addMin(s,offset),state=now>=new Date(nominal).getTime()?"MISSING":"PENDING";return addCheckpoint(j.id,label,nominal,1,state,nominal);}
 await required("T-60",-60);await required("T-30",-30);await required("T-15",-15);await required("T-10",-10);
 await addCheckpoint(j.id,"DELAY",addMin(s,-5),1,"PENDING",addMin(s,-5));
 const postBase=f.scheduled_on||addMin(s,(f.filed_ete?f.filed_ete/60:180));await addCheckpoint(j.id,"POSTFLIGHT",addMin(postBase,15),1,"PENDING",addMin(postBase,15));
 if(initState==="PENDING"&&new Date(initDue)<=new Date()){const c=await captureFlight(j.fa_flight_id);await saveCapture(j.id,init.id,c);await checkpointState(init.id,"CAPTURED",c.captured_at);}
 json(res,200,{ok:true,...await jobSummary(j.id)});
}catch(e){json(res,e.status||500,{ok:false,error:e.message,detail:e.body})}}
