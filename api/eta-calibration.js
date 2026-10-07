export const ETA_CALIBRATION={
 version:"eta-us-v1-2026-10-07",
 calibration_period:["2026-09-08","2026-09-22"],
 validation_period:["2026-09-23","2026-10-02"],
 baseline_source:"FILED_ETE",
 predeparture:{
  center_rule:"estimated_off_plus_filed_ete",
  half_width_minutes:17,
  calibration_p80_abs_error_minutes:16.8166666667,
  validation_coverage:0.8341110217
 },
 airborne:{
  center_rule:"detected_takeoff_plus_filed_ete",
  half_width_minutes:9,
  calibration_p80_abs_error_minutes:8.6666666667,
  validation_coverage:0.8242960579
 }
};

export function addSeconds(iso,seconds){
 if(!iso||!Number.isFinite(seconds))return null;
 const t=new Date(iso).getTime();if(!Number.isFinite(t))return null;
 return new Date(t+seconds*1000).toISOString();
}
export function windowAround(centerIso,halfWidthMinutes){
 if(!centerIso||!Number.isFinite(halfWidthMinutes))return null;
 const t=new Date(centerIso).getTime();if(!Number.isFinite(t))return null;
 const d=halfWidthMinutes*60000;
 return{early:new Date(t-d).toISOString(),late:new Date(t+d).toISOString()};
}
export function etaPackage({estimatedOff=null,filedEteSeconds=null}={}){
 const duration=Number(filedEteSeconds);
 const preCenter=estimatedOff&&Number.isFinite(duration)?addSeconds(estimatedOff,duration):null;
 return{
  calibration_version:ETA_CALIBRATION.version,
  baseline_source:ETA_CALIBRATION.baseline_source,
  duration_seconds:Number.isFinite(duration)?duration:null,
  predeparture:{
   center:preCenter,
   window:preCenter?windowAround(preCenter,ETA_CALIBRATION.predeparture.half_width_minutes):null,
   half_width_minutes:ETA_CALIBRATION.predeparture.half_width_minutes,
   center_rule:ETA_CALIBRATION.predeparture.center_rule,
   validated_coverage:ETA_CALIBRATION.predeparture.validation_coverage
  },
  airborne:{
   center:null,
   window:null,
   half_width_minutes:ETA_CALIBRATION.airborne.half_width_minutes,
   center_rule:ETA_CALIBRATION.airborne.center_rule,
   validated_coverage:ETA_CALIBRATION.airborne.validation_coverage
  }
 };
}
