// Derived (not observed) trajectory. Shape calibrated to Chester-accepted
// handmade-20261016-v3: takeoff 290, climb to 860 at 22.95/318 min,
// cruise to 291.2/318 min, descend to 250 at landing.
// Source v3 alone does NOT establish the original generation algorithm.
import {havKm,polyKm} from "./lib.js";
const KNOTS=[
 [0,290,"takeoff"],[1.95/318,369,"climb"],[3.9/318,447,"climb"],
 [5.85/318,521,"climb"],[7.8/318,591,"climb"],[9.75/318,656,"climb"],
 [11.7/318,713,"climb"],[13.65/318,762,"climb"],[15.6/318,802,"climb"],
 [17.5/318,831,"climb"],[19.35/318,850,"climb"],
 [21.15/318,859,"climb"],[22.95/318,860,"cruise"],
 [291.2/318,819,"descent"],[304.85/318,409,"descent"],
 [308.75/318,330,"descent"],[312.65/318,277,"descent"],
 [316.55/318,252,"descent"],[1,250,"landing"]
];
function speedAt(f){
 let i=1;while(i<KNOTS.length-1&&KNOTS[i][0]<f)i++;
 const a=KNOTS[i-1],b=KNOTS[i],w=(f-a[0])/(b[0]-a[0]);
 return a[1]+w*(b[1]-a[1]);
}
function phaseAt(f){
 if(f===0)return "takeoff";if(f>=1)return "landing";
 if(f<22.95/318)return "climb";if(f<291.2/318)return "cruise";
 return "descent";
}
function atDistance(points,target){
 let walked=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],leg=havKm(a,b);
  if(walked+leg>=target){
   const w=leg>0?(target-walked)/leg:0;
   return {latitude:a.latitude+w*(b.latitude-a.latitude),longitude:a.longitude+w*(b.longitude-a.longitude)};
  }
  walked+=leg;
 }
 return points.at(-1);
}
export function modelFiledTimeline(points,{durationSeconds,distanceKm}={}){
 if(!Array.isArray(points)||points.length<2||!Number.isFinite(durationSeconds)||durationSeconds<=0||!Number.isFinite(distanceKm)||distanceKm<=0)return [];
 const geomKm=polyKm(points);if(!Number.isFinite(geomKm)||geomKm<=0)return [];
 const durationHours=durationSeconds/3600;
 const steps=Math.max(1,Math.ceil(durationSeconds/120),Math.ceil(distanceKm/25));
 const raw=[],dt=1/steps;let area=0;
 for(let i=0;i<=steps;i++){
  const f=i/steps,v=speedAt(f);
  if(i)area+=(speedAt((i-1)*dt)+v)*dt/2;
  raw.push({f,v,area});
 }
 if(!(area>0))return [];
 return raw.map(({f,v,area:part},i)=>{
  const fraction=part/area;
  const p=atDistance(points,geomKm*fraction);
  return {
   fraction,latitude:+p.latitude.toFixed(6),longitude:+p.longitude.toFixed(6),
   t_min:+(f*durationSeconds/60).toFixed(3),
   dist_km:+(fraction*distanceKm).toFixed(3),
   phase:phaseAt(f),
   gs_kmh:+(v*distanceKm/(durationHours*area)).toFixed(3),
   source:"DERIVED_FILED_ROUTE_TIME_V3_PROFILE"
  };
 });
}
