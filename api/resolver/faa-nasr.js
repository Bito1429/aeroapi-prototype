import{parse}from"csv-parse/sync";
import{unzipSync,strFromU8}from"fflate";
import{classifyToken}from"../resolver-lib.js";

export function parseCsv(bytes){
  return parse(strFromU8(bytes),{columns:true,skip_empty_lines:true,relax_column_count:true,bom:true,trim:true});
}

export function buildNasrIndexes({aptZip=null,fixZip,navZip,awyZip}){
  const aptFiles=aptZip?unzipSync(aptZip):null,fixFiles=unzipSync(fixZip),navFiles=unzipSync(navZip),awyFiles=unzipSync(awyZip);
  const airports=aptFiles?parseCsv(aptFiles["APT_BASE.csv"]):[];
  const fixes=parseCsv(fixFiles["FIX_BASE.csv"]);
  const navs=parseCsv(navFiles["NAV_BASE.csv"]);
  const airways=parseCsv(awyFiles["AWY_BASE.csv"]);

  const points=new Map();
  const add=(ident,p)=>{
    const k=String(ident||"").trim().toUpperCase();if(!k)return;
    if(!points.has(k))points.set(k,[]);
    points.get(k).push(p);
  };

  for(const r of airports){
    const lat=Number(r.LAT_DECIMAL),lon=Number(r.LONG_DECIMAL),icao=String(r.ICAO_ID||"").trim().toUpperCase();
    if(r.COUNTRY_CODE!=="US"||!icao||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    add(icao,{name:icao,type:"AIRPORT",latitude:lat,longitude:lon,country_code:r.COUNTRY_CODE,source:"FAA_NASR_APT",faa_id:r.ARPT_ID||null});
  }
  for(const r of fixes){
    const lat=Number(r.LAT_DECIMAL),lon=Number(r.LONG_DECIMAL);
    if(r.COUNTRY_CODE!=="US"||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    add(r.FIX_ID,{name:r.FIX_ID,type:"FIX",latitude:lat,longitude:lon,country_code:r.COUNTRY_CODE,icao_region_code:r.ICAO_REGION_CODE,source:"FAA_NASR_FIX"});
  }
  for(const r of navs){
    const lat=Number(r.LAT_DECIMAL),lon=Number(r.LONG_DECIMAL);
    if(r.COUNTRY_CODE!=="US"||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    add(r.NAV_ID,{name:r.NAV_ID,type:r.NAV_TYPE||"NAVAID",latitude:lat,longitude:lon,country_code:r.COUNTRY_CODE,source:"FAA_NASR_NAV"});
  }

  const airwayStrings=new Map();
  for(const r of airways){
    const id=String(r.AWY_ID||"").trim().toUpperCase();
    const seq=String(r.AIRWAY_STRING||"").trim().split(/\s+/).filter(Boolean).map(x=>x.toUpperCase());
    if(!id||seq.length<2)continue;
    if(!airwayStrings.has(id))airwayStrings.set(id,[]);
    airwayStrings.get(id).push({sequence:seq,regulatory:r.REGULATORY,location:r.AWY_LOCATION});
  }
  return{points,airwayStrings,counts:{airports:airports.length,fixes:fixes.length,navs:navs.length,airways:airways.length}};
}

export function resolvePoint(index,ident){
  const k=String(ident||"").toUpperCase();
  const candidates=index.points.get(k)||[];
  if(candidates.length===1)return{status:"RESOLVED",point:candidates[0],candidates};
  if(candidates.length===0)return{status:"UNRESOLVED",point:null,candidates:[]};
  const unique=new Map(candidates.map(c=>[`${c.latitude.toFixed(7)},${c.longitude.toFixed(7)}`,c]));
  if(unique.size===1)return{status:"RESOLVED",point:[...unique.values()][0],candidates};
  return{status:"AMBIGUOUS",point:null,candidates};
}

export function expandAirway(index,airwayId,entry,exit){
  const id=String(airwayId||"").toUpperCase(),a=String(entry||"").toUpperCase(),b=String(exit||"").toUpperCase();
  const rows=index.airwayStrings.get(id)||[];
  const paths=[];
  for(const row of rows){
    const seq=row.sequence;
    const ia=seq.indexOf(a),ib=seq.indexOf(b);
    if(ia<0||ib<0||ia===ib)continue;
    const slice=ia<ib?seq.slice(ia,ib+1):seq.slice(ib,ia+1).reverse();
    paths.push(slice);
  }
  const uniq=[...new Map(paths.map(p=>[p.join(" "),p])).values()];
  if(uniq.length===0)return{status:"UNRESOLVED",path:[]};
  if(uniq.length>1)return{status:"AMBIGUOUS",path:[],candidates:uniq};
  return{status:"RESOLVED",path:uniq[0]};
}

export function resolveEnrouteNasr(route,index){
  const raw=String(route||"").trim().split(/\s+/).filter(Boolean);
  const geometry=[],decisions=[];
  const pushPoint=(p)=>{if(!geometry.length||geometry[geometry.length-1].name!==p.name)geometry.push(p);};

  for(let i=0;i<raw.length;i++){
    const token=raw[i].toUpperCase(),cls=classifyToken(token);
    if(cls==="PROCEDURE_CANDIDATE"){
      decisions.push({token,class:cls,status:"DEFERRED",reason:"PROCEDURE_AUTHORITY_CIFP"});
      continue;
    }
    if(cls==="AIRWAY"){
      const entry=geometry.at(-1)?.name||null;
      const exitToken=raw[i+1]?.toUpperCase()||null;
      if(!entry||!exitToken){
        decisions.push({token,class:cls,status:"UNRESOLVED",reason:"AIRWAY_MISSING_ENTRY_OR_EXIT"});
        continue;
      }
      const ex=resolvePoint(index,exitToken);
      const aw=expandAirway(index,token,entry,exitToken);
      if(ex.status!=="RESOLVED"||aw.status!=="RESOLVED"){
        decisions.push({token,class:cls,status:aw.status==="AMBIGUOUS"||ex.status==="AMBIGUOUS"?"AMBIGUOUS":"UNRESOLVED",reason:"AIRWAY_EXPANSION_FAILED",entry,exit:exitToken});
        continue;
      }
      let ok=true;
      for(const name of aw.path.slice(1)){
        const rp=resolvePoint(index,name);
        if(rp.status!=="RESOLVED"){ok=false;decisions.push({token:name,class:"POINT_CANDIDATE",status:rp.status,reason:"AIRWAY_POINT_LOOKUP_FAILED"});break;}
        pushPoint(rp.point);
      }
      if(ok){
        decisions.push({token,class:cls,status:"RESOLVED",entry,exit:exitToken,expanded:aw.path});
        i++; // exit token consumed as part of airway expansion
      }
      continue;
    }
    const rp=resolvePoint(index,token);
    decisions.push({token,class:cls,status:rp.status,reason:rp.status==="RESOLVED"?"NASR_POINT_MATCH":"POINT_LOOKUP_FAILED"});
    if(rp.status==="RESOLVED")pushPoint(rp.point);
  }
  const unresolved=decisions.filter(d=>!["RESOLVED","DEFERRED"].includes(d.status));
  return{
    status:unresolved.length?"PARTIAL":"VALID_ENROUTE",
    geometry,
    decisions,
    unresolved,
    deferred_procedures:decisions.filter(d=>d.status==="DEFERRED").map(d=>d.token)
  };
}
