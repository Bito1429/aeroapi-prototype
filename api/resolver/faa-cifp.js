// Minimal FAA CIFP procedure parser for the ARINC-424-style 132-character FAACIFP18 records.
// Field slices are deliberately limited to identifiers needed for deterministic route expansion.
export function parseCifpProcedureRecord(line){
  if(typeof line!=="string"||line.length<49||!line.startsWith("SUSAP "))return null;
  const airport=line.slice(6,10).trim();
  const subsection=line.slice(12,13);
  if(subsection!=="D"&&subsection!=="E")return null;
  const procedure_id=line.slice(13,19).trim();
  const route_type=line.slice(19,20);
  const transition_id=line.slice(20,25).trim();
  const sequence=Number(line.slice(26,29));
  const fix_id=line.slice(29,34).trim();
  const path_terminator=line.slice(47,49).trim();
  return{airport,subsection,procedure_id,route_type,transition_id,sequence:Number.isFinite(sequence)?sequence:null,fix_id,path_terminator,raw:line};
}

export function procedureRecords(cifpText,{airport,procedure,subsection}){
  const apt=String(airport||"").toUpperCase(),proc=String(procedure||"").toUpperCase();
  return String(cifpText||"").split(/\r?\n/).map(parseCifpProcedureRecord).filter(r=>
    r&&r.airport===apt&&r.procedure_id===proc&&(!subsection||r.subsection===subsection)
  );
}

function groupRecords(records){
  const groups=new Map();
  for(const r of records){
    const key=`${r.route_type}|${r.transition_id}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(r);
  }
  for(const rows of groups.values())rows.sort((a,b)=>(a.sequence??0)-(b.sequence??0));
  return groups;
}
const fixesOf=rows=>rows.map(r=>r.fix_id).filter(Boolean);

export function selectDepartureByNextFix(cifpText,{airport,procedure,nextFix}){
  const records=procedureRecords(cifpText,{airport,procedure,subsection:"D"});
  const groups=groupRecords(records),next=String(nextFix||"").toUpperCase();
  const candidates=[];
  for(const [key,rows] of groups){
    const fixes=fixesOf(rows),transition_id=rows[0].transition_id;
    if(!transition_id.startsWith("RW")&&fixes.includes(next))candidates.push({key,route_type:rows[0].route_type,transition_id,fixes,rows});
  }
  // Prefer the explicitly named enroute transition. FAA CIFP departure route types
  // occur in parallel 1/2/3 and 4/5/6 families, so route_type alone is not a selector.
  const exact=candidates.filter(x=>x.transition_id===next);
  const pool=exact.length?exact:candidates;
  if(pool.length!==1){
    return{status:pool.length?"AMBIGUOUS":"UNRESOLVED",procedure,selector:{next_fix:next},candidates:pool.map(x=>({route_type:x.route_type,transition_id:x.transition_id,fixes:x.fixes}))};
  }
  const chosen=pool[0],idx=chosen.fixes.indexOf(next);
  return{status:"RESOLVED",procedure,selector:{next_fix:next},route_type:chosen.route_type,transition_id:chosen.transition_id,fixes:chosen.fixes.slice(0,idx+1)};
}

export function selectArrivalByEntryFix(cifpText,{airport,procedure,entryFix}){
  const records=procedureRecords(cifpText,{airport,procedure,subsection:"E"});
  const groups=groupRecords(records),entry=String(entryFix||"").toUpperCase();
  const all=[...groups.values()];

  // FAA CIFP STAR route-type families are parallel: 1/2/3 and 4/5/6
  // represent entry/common/runway branches respectively.
  let entryGroups=all.filter(rows=>{
    const fixes=fixesOf(rows),rt=rows[0]?.route_type;
    return ["1","4"].includes(rt)&&(rows[0]?.transition_id===entry||fixes[0]===entry);
  });
  let transition=[];
  if(entryGroups.length===1)transition=fixesOf(entryGroups[0]);
  else if(entryGroups.length>1)return{status:"AMBIGUOUS",procedure,selector:{entry_fix:entry},reason:"ENTRY_TRANSITION_NOT_UNIQUE"};

  const commonGroups=all.filter(rows=>["2","5"].includes(rows[0]?.route_type));
  let common=[];
  if(commonGroups.length){
    const tail=transition.at(-1)||entry;
    const matches=commonGroups.filter(g=>{
      const f=fixesOf(g); return f[0]===tail||rowsTransitionAll(g);
    });
    if(matches.length===1)common=fixesOf(matches[0]);
    else if(matches.length>1){
      const exact=matches.filter(g=>fixesOf(g)[0]===tail);
      if(exact.length===1)common=fixesOf(exact[0]);
      else return{status:"AMBIGUOUS",procedure,selector:{entry_fix:entry},reason:"COMMON_BODY_NOT_UNIQUE"};
    }
  }
  if(!transition.length&&common.length&&common[0]===entry)transition=[entry];
  if(!transition.length)return{status:"UNRESOLVED",procedure,selector:{entry_fix:entry},reason:"ENTRY_TRANSITION_NOT_FOUND"};

  const prefix=[...transition];
  for(const f of common)if(prefix.at(-1)!==f)prefix.push(f);
  const tail=prefix.at(-1);
  const runwayGroups=all
    .filter(rows=>["3","6"].includes(rows[0]?.route_type)&&rows[0]?.transition_id.startsWith("RW"))
    .map(rows=>({transition_id:rows[0].transition_id,fixes:fixesOf(rows)}))
    .filter(g=>!tail||g.fixes[0]===tail);

  if(runwayGroups.length===0)return{status:"RESOLVED",procedure,selector:{entry_fix:entry},fixes:prefix,runway_branch:null};
  if(runwayGroups.length===1){
    const full=[...prefix]; for(const f of runwayGroups[0].fixes.slice(1))if(full.at(-1)!==f)full.push(f);
    return{status:"RESOLVED",procedure,selector:{entry_fix:entry},fixes:full,runway_branch:runwayGroups[0].transition_id};
  }
  return{status:"PARTIAL_AMBIGUOUS_RUNWAY",procedure,selector:{entry_fix:entry},fixes:prefix,ambiguous_runway_branches:runwayGroups};
}
function rowsTransitionAll(rows){return String(rows?.[0]?.transition_id||"").toUpperCase()==="ALL";}


export function selectDepartureByRunwayAndNextFix(cifpText,{airport,procedure,runway,nextFix}){
  const records=procedureRecords(cifpText,{airport,procedure,subsection:"D"});
  const groups=groupRecords(records);
  const rwy=String(runway||"").toUpperCase().replace(/^RW/,"");
  const next=String(nextFix||"").toUpperCase();
  const runwayGroups=[...groups.values()].filter(rows=>rows[0]?.route_type==="4"&&rows[0]?.transition_id.startsWith("RW"));
  const exact=runwayGroups.filter(rows=>rows[0].transition_id===`RW${rwy}`);
  const num=rwy.match(/^([0-9]{2})/)?.[1]||"";
  const broad=runwayGroups.filter(rows=>rows[0].transition_id===`RW${num}B`);
  const chosenRunway=exact.length===1?exact:(exact.length===0&&broad.length===1?broad:[]);
  if(chosenRunway.length!==1){
    return{status:chosenRunway.length?"AMBIGUOUS":"UNRESOLVED",reason:"RUNWAY_TRANSITION_NOT_UNIQUE",runway:rwy};
  }
  const path=fixesOf(chosenRunway[0]).filter(Boolean);

  const commonGroups=[...groups.values()].filter(rows=>rows[0]?.route_type==="5");
  if(commonGroups.length){
    const tail=path.at(-1);
    const matches=commonGroups.filter(rows=>{
      const f=fixesOf(rows).filter(Boolean);
      return !tail||f[0]===tail;
    });
    if(matches.length===1){
      for(const x of fixesOf(matches[0]).filter(Boolean).slice(1))if(path.at(-1)!==x)path.push(x);
    }else if(matches.length>1){
      return{status:"AMBIGUOUS",reason:"COMMON_BODY_NOT_UNIQUE",runway:rwy};
    }
  }

  const tail=path.at(-1);
  const enrouteGroups=[...groups.values()].filter(rows=>rows[0]?.route_type==="6").filter(rows=>{
    const f=fixesOf(rows).filter(Boolean);
    return f.includes(next)&&(!tail||f[0]===tail||f.includes(tail));
  });
  if(enrouteGroups.length!==1){
    return{status:enrouteGroups.length?"AMBIGUOUS":"UNRESOLVED",reason:"ENROUTE_TRANSITION_NOT_UNIQUE",runway:rwy,next_fix:next};
  }
  const ef=fixesOf(enrouteGroups[0]).filter(Boolean);
  const start=tail?Math.max(0,ef.indexOf(tail)):0;
  for(const x of ef.slice(start+(tail?1:0))){
    if(path.at(-1)!==x)path.push(x);
    if(x===next)break;
  }
  if(path.at(-1)!==next)return{status:"UNRESOLVED",reason:"NEXT_FIX_NOT_REACHED",runway:rwy,next_fix:next};
  return{status:"RESOLVED",runway:rwy,next_fix:next,fixes:path};
}
