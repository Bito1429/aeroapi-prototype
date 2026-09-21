import fs from"node:fs/promises";
import{execFileSync}from"node:child_process";
import crypto from"node:crypto";
const urls=[
 ["ENR_3.1","https://aipmexico.seneam.gob.mx/AIP/doc/ENR/ENR_3/ENR_3.1.pdf"],
 ["ENR_3.2","https://aipmexico.seneam.gob.mx/AIP/doc/ENR/ENR_3/ENR_3.2.pdf"],
 ["ENR_3.3","https://aipmexico.seneam.gob.mx/AIP/doc/ENR/ENR_3/ENR_3.3.pdf"],
 ["ENR_4.1","https://aipmexico.seneam.gob.mx/AIP/doc/ENR/ENR_4/ENR_4.1.pdf"],
 ["ENR_4.4","https://aipmexico.seneam.gob.mx/AIP/doc/ENR/ENR_4/ENR_4.4.pdf"],
 ["GEN_0.4","https://aipmexico.seneam.gob.mx/AIP/doc/GEN/GEN_0/GEN_0.4.pdf"]
];
for(const [name,url] of urls){
 try{
  const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0","accept":"application/pdf,*/*"}});
  const b=Buffer.from(await r.arrayBuffer()),path="/tmp/"+name+".pdf";
  await fs.writeFile(path,b);
  let text="";try{text=execFileSync("pdftotext",["-f","1","-l","3","-layout",path,"-"],{encoding:"utf8",maxBuffer:5e6})}catch(e){text="PDFTOTEXT_FAIL "+String(e)}
  console.log(JSON.stringify({name,status:r.status,type:r.headers.get("content-type"),bytes:b.length,sha256:crypto.createHash("sha256").update(b).digest("hex"),sample:text.slice(0,2200)}));
 }catch(e){console.log(JSON.stringify({name,error:String(e)}))}
}