import{resolveEnrouteNasr,resolvePoint}from"./faa-nasr.js";
import{selectDepartureByNextFix,selectArrivalByEntryFix}from"./faa-cifp.js";

function pointSequence(index,names){
  const geometry=[],unresolved=[];
  for(const name of names){
    const r=resolvePoint(index,name);
    if(r.status==="RESOLVED")geometry.push(r.point);
    else unresolved.push({name,status:r.status,candidates:r.candidates?.length||0});
  }
  return{geometry,unresolved};
}

export function resolveFiledRouteUS({route,origin,destination,nasrIndex,cifpText}){
  const tokens=String(route||"").trim().split(/\s+/).filter(Boolean).map(x=>x.toUpperCase());
  if(tokens.length<2)return{status:"INVALID",reason:"ROUTE_TOO_SHORT"};

  const depToken=tokens[0],arrToken=tokens.at(-1);
  const nextFix=tokens[1],entryFix=tokens.at(-2);

  const dep=selectDepartureByNextFix(cifpText,{airport:origin,procedure:depToken,nextFix});
  const arr=selectArrivalByEntryFix(cifpText,{airport:destination,procedure:arrToken,entryFix});
  const enroute=resolveEnrouteNasr(route,nasrIndex);

  const names=[];
  if(dep.status==="RESOLVED")for(const x of dep.fixes)if(names.at(-1)!==x)names.push(x);
  for(const p of enroute.geometry)if(names.at(-1)!==p.name)names.push(p.name);
  if(arr.fixes)for(const x of arr.fixes)if(names.at(-1)!==x)names.push(x);

  const pts=pointSequence(nasrIndex,names);
  const terminalAmbiguity={
    departure_runway_path: dep.status==="RESOLVED" ? "NOT_SELECTED_FROM_FILED_ROUTE" : dep.status,
    arrival_runway_path: arr.status==="PARTIAL_AMBIGUOUS_RUNWAY" ? "AMBIGUOUS" : arr.runway_branch||null
  };
  const problems=[
    ...enroute.unresolved.map(x=>({stage:"ENROUTE",...x})),
    ...pts.unresolved.map(x=>({stage:"POINT_LOOKUP",...x}))
  ];
  if(dep.status!=="RESOLVED")problems.push({stage:"DEPARTURE_PROCEDURE",status:dep.status});
  if(!["RESOLVED","PARTIAL_AMBIGUOUS_RUNWAY"].includes(arr.status))problems.push({stage:"ARRIVAL_PROCEDURE",status:arr.status});

  const fullyTerminalDetermined=
    dep.status==="RESOLVED" &&
    arr.status==="RESOLVED" &&
    !terminalAmbiguity.departure_runway_path &&
    !terminalAmbiguity.arrival_runway_path;

  return{
    status:problems.length?"PARTIAL":fullyTerminalDetermined?"VALID":"PARTIAL",
    validity_reason:problems.length?"UNRESOLVED_COMPONENT":"RUNWAY_DEPENDENT_TERMINAL_GEOMETRY_NOT_FILED",
    filed_core_valid:problems.length===0,
    scoring_valid:false,
    geometry:pts.geometry,
    names,
    departure:dep,
    arrival:arr,
    terminal_ambiguity:terminalAmbiguity,
    problems
  };
}
