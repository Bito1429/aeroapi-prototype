import{resolveEnrouteNasr,resolvePoint}from"./faa-nasr.js";
import{classifyToken}from"../resolver-lib.js";
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
  const depIsProcedure=classifyToken(depToken)==="PROCEDURE_CANDIDATE";
  const arrIsProcedure=classifyToken(arrToken)==="PROCEDURE_CANDIDATE";
  const nextFix=depIsProcedure?tokens[1]:null;
  const entryFix=arrIsProcedure?tokens.at(-2):null;

  const dep=depIsProcedure
    ? selectDepartureByNextFix(cifpText,{airport:origin,procedure:depToken,nextFix})
    : {status:"NOT_FILED",procedure:null,fixes:[]};
  const arr=arrIsProcedure
    ? selectArrivalByEntryFix(cifpText,{airport:destination,procedure:arrToken,entryFix})
    : {status:"NOT_FILED",procedure:null,fixes:[]};
  const enroute=resolveEnrouteNasr(route,nasrIndex);

  const names=[];
  if(dep.status==="RESOLVED")for(const x of dep.fixes)if(names.at(-1)!==x)names.push(x);
  for(const p of enroute.geometry)if(names.at(-1)!==p.name)names.push(p.name);
  if(arr.fixes)for(const x of arr.fixes)if(names.at(-1)!==x)names.push(x);

  const corePts=pointSequence(nasrIndex,names);
  const originResult=resolvePoint(nasrIndex,origin),destinationResult=resolvePoint(nasrIndex,destination);
  const terminalAmbiguity={
    departure_runway_path: depIsProcedure ? (dep.status==="RESOLVED" ? "NOT_SELECTED_FROM_FILED_ROUTE" : dep.status) : null,
    arrival_runway_path: arrIsProcedure ? (arr.status==="PARTIAL_AMBIGUOUS_RUNWAY" ? "AMBIGUOUS" : arr.runway_branch||arr.status) : null
  };
  const problems=[
    ...enroute.unresolved.map(x=>({stage:"ENROUTE",...x})),
    ...corePts.unresolved.map(x=>({stage:"POINT_LOOKUP",...x}))
  ];
  if(originResult.status!=="RESOLVED")problems.push({stage:"ORIGIN_AIRPORT",name:origin,status:originResult.status});
  if(destinationResult.status!=="RESOLVED")problems.push({stage:"DESTINATION_AIRPORT",name:destination,status:destinationResult.status});
  if(depIsProcedure&&dep.status!=="RESOLVED")problems.push({stage:"DEPARTURE_PROCEDURE",status:dep.status});
  if(arrIsProcedure&&!["RESOLVED","PARTIAL_AMBIGUOUS_RUNWAY"].includes(arr.status))problems.push({stage:"ARRIVAL_PROCEDURE",status:arr.status});

  const fullyTerminalDetermined=
    (!depIsProcedure||dep.status==="RESOLVED") &&
    (!arrIsProcedure||arr.status==="RESOLVED") &&
    !terminalAmbiguity.departure_runway_path &&
    !terminalAmbiguity.arrival_runway_path;

  const fullRouteValid=problems.length===0&&fullyTerminalDetermined;
  const fullNames=fullRouteValid
    ? [origin,...names.filter(x=>x!==origin&&x!==destination),destination]
    : names;
  const fullPts=fullRouteValid?pointSequence(nasrIndex,fullNames):corePts;

  return{
    status:problems.length?"PARTIAL":fullRouteValid?"VALID":"PARTIAL",
    validity_reason:problems.length?"UNRESOLVED_COMPONENT":fullRouteValid?"DETERMINISTIC_FULL_FILED_ROUTE":"RUNWAY_DEPENDENT_TERMINAL_GEOMETRY_NOT_FILED",
    filed_core_valid:problems.length===0,
    scoring_valid:fullRouteValid,
    geometry:fullPts.geometry,
    names:fullNames,
    origin_point:originResult.point||null,
    destination_point:destinationResult.point||null,
    departure:dep,
    arrival:arr,
    terminal_ambiguity:terminalAmbiguity,
    problems
  };
}
