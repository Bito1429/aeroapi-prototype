const names=Array.from({length:12},(_,i)=>"AMDT_AIRAC_"+String(i+1).padStart(2,"0")+"_26.pdf");
for(const name of names){
 const url="https://aipmexico.seneam.gob.mx/assets/archivos/"+name;
 try{
  const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 AevPath/1.0","accept":"application/pdf,*/*"}});
  const b=new Uint8Array(await r.arrayBuffer());
  console.log(JSON.stringify({name,status:r.status,type:r.headers.get("content-type"),bytes:b.length,prefix:Array.from(b.slice(0,8))}));
 }catch(e){console.log(JSON.stringify({name,error:String(e)}))}
}