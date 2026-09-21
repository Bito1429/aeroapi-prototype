const TOKEN="mxprobe_3a7d0fd47f5a4ab68f63e9e2f6f6f4c1";
export default async function handler(req,res){
 if(String(req.query?.k||"")!==TOKEN)return res.status(403).json({ok:false});
 const names=[];
 for(let m=1;m<=12;m++) names.push("AMDT_AIRAC_"+String(m).padStart(2,"0")+"_26.pdf");
 const out=[];
 for(const name of names){
   const url="https://aipmexico.seneam.gob.mx/assets/archivos/"+name;
   try{
     const r=await fetch(url,{method:"HEAD",redirect:"follow"});
     out.push({name,status:r.status,content_type:r.headers.get("content-type"),content_length:r.headers.get("content-length"),last_modified:r.headers.get("last-modified")});
   }catch(e){out.push({name,error:String(e?.message||e)})}
 }
 res.setHeader("Cache-Control","no-store");
 return res.status(200).json({ok:true,out});
}