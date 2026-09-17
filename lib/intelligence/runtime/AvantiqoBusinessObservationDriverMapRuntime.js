export const AVANTIQO_BUSINESS_OBSERVATION_DRIVER_MAP_CONTRACT = "AVANTIQO_BUSINESS_OBSERVATION_DRIVER_MAP_V1";

const MEASURE_DRIVER = Object.freeze({
  cash_position:"cash",
  scheduled_position_7d:"cash",
  scheduled_position_30d:"cash",
  receivables_overdue:"receivables_collection",
  payables_overdue:"payables_timing",
  inventory_quantity:"inventory_availability",
  inventory_item_count:"inventory_health",
  staff_count:"staff_coverage",
  scheduled_shifts:"staff_coverage",
  worked_shifts:"attendance_reliability",
  attendance_records:"attendance_reliability",
  late_shifts:"attendance_reliability",
  pending_shifts:"attendance_reliability",
  booking_count:"volume",
  customer_count:"repeat_customer_rate",
  quotation_count:"lead_volume",
});

export function mapBusinessObservationsToDriverRows({observations=[],allowed_driver_ids=[]}={}){
  const allowed = new Set(Array.isArray(allowed_driver_ids)?allowed_driver_ids:[]);
  const mapped=[]; const unmapped=[];
  for(const row of Array.isArray(observations)?observations:[]){
    const driver_id=MEASURE_DRIVER[row?.measure_id]||null;
    if(!driver_id || (allowed.size && !allowed.has(driver_id))){unmapped.push({...row,reason:driver_id?"DRIVER_OUTSIDE_DIAGNOSIS":"NO_EXPLICIT_MEASURE_DRIVER_MAPPING"});continue;}
    mapped.push({driver_id,baseline_value:row.baseline_value,actual_value:row.actual_value,source_capability_key:row.source_capability_key,evidence_status:"OBSERVED_INTERNAL",dimension_key:row.dimension_key||null,measure_id:row.measure_id,authority_effect:"NONE"});
  }
  return {contract:AVANTIQO_BUSINESS_OBSERVATION_DRIVER_MAP_CONTRACT,driver_rows:mapped,unmapped_observations:unmapped,policy:{explicit_mapping_only:true,ambiguous_measure_not_promoted:true,diagnosis_scope_respected:true,authority_effect:"NONE"},authority_effect:"NONE"};
}

export const AvantiqoBusinessObservationDriverMapRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_OBSERVATION_DRIVER_MAP_CONTRACT,map:mapBusinessObservationsToDriverRows});
