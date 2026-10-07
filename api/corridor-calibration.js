export const CORRIDOR_CALIBRATION={
 version:"corridor-us-v1-2026-10-07",
 calibration_period:["2026-09-08","2026-09-22"],
 validation_period:["2026-09-23","2026-10-02"],
 metric:"checkpoint_cross_track_error_km",
 target_coverage:0.80,
 confidence_half_width_km:18,
 calibration_p80_xtd_km:17.9942,
 validation_coverage:0.8420917136,
 display_half_width_km:null
};

export function corridorMeta(){
 return{
  calibration_version:CORRIDOR_CALIBRATION.version,
  metric:CORRIDOR_CALIBRATION.metric,
  target_coverage:CORRIDOR_CALIBRATION.target_coverage,
  confidence_half_width_km:CORRIDOR_CALIBRATION.confidence_half_width_km,
  validated_coverage:CORRIDOR_CALIBRATION.validation_coverage,
  display_half_width_km:CORRIDOR_CALIBRATION.display_half_width_km
 };
}
