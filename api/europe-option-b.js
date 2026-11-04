import { runEurope } from "./europe-option-b-runner.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
 if(!process.env.EUROPE_RUNNER_TOKEN||req.headers.authorization!=="Bearer "+process.env.EUROPE_RUNNER_TOKEN)return res.status(404).json({error:"NOT_FOUND"});
 try{return res.status(200).json(await runEurope(String(req.query?.phase||"")))}
 catch(e){return res.status(503).json({error:String(e.message).replace(/[^A-Z0-9_]/g,"").slice(0,80)})}
}
