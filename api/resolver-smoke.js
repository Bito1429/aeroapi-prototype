import{json}from"./lib.js";
import{classifyToken,tokenizeRoute,resolverEnvelope}from"./resolver-lib.js";

export default async function handler(req,res){
  const cases=[
    {name:"mexico_viva",route:"MXL3B MXL UJ7 PPE UT11 RUDLO UJ38 SLW SLW1B",origin:"MMML",destination:"MMMY"},
    {name:"canada",route:"AVSEP7 MUSIT SSM AGLIN UDBOX EMLIK SHAWI Q874 ILADA BIRKO6",origin:"CYYZ",destination:"CYYC"},
    {name:"dominican",route:"SKPPR L455 SAVIK YAALE Y495 CAMRN",origin:"MDSD",destination:"KJFK"},
    {name:"costa_rica",route:"AVOMA DUTNA L208 PEGLG NNCEE2",origin:"MROC",destination:"KIAH"}
  ];
  const results=cases.map(c=>{
    const r=resolverEnvelope({...c,nav_cycle_code:"SMOKE"});
    return{
      name:c.name,
      status:r.status,
      tokens:r.tokens.map(t=>({token:t.normalized_token,class:t.token_class,decision:t.decision,reason:t.reason_code})),
      unresolved:r.unresolved_tokens
    };
  });
  const assertions={
    UT11:classifyToken("UT11")==="AIRWAY",
    J70:classifyToken("J70")==="AIRWAY",
    L455:classifyToken("L455")==="AIRWAY",
    L208:classifyToken("L208")==="AIRWAY",
    CANUC7:classifyToken("CANUC7")==="PROCEDURE_CANDIDATE",
    AGLIN:classifyToken("AGLIN")==="POINT_CANDIDATE",
    mexico_token_count:tokenizeRoute(cases[0].route).length===9
  };
  return json(res,200,{ok:Object.values(assertions).every(Boolean),engine:"R2_ENGINE_V0_2026-09-21",assertions,results});
}
