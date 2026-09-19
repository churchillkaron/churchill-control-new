export const AVANTIQO_CAPABILITY_READINESS_EVIDENCE_CONTRACT =
  "AVANTIQO_CAPABILITY_READINESS_EVIDENCE_V1";

const text=(value,limit=6000)=>String(value??"").trim().slice(0,limit);
const object=(value)=>value&&typeof value==="object"&&!Array.isArray(value)?value:{};
const list=(value)=>Array.isArray(value)?value:[];

function exactCapability(row){
  const metadata=object(row?.metadata);
  return text(metadata.capability_key||metadata.binding_key||row?.subject,300);
}

export function assessCapabilityReadinessEvidence({outcomeRows=[],readinessRows=[],capabilityKey=null}={}){
  let successUnits=0;
  let liveSuccessCount=0;
  let historicalSuccessCount=0;
  for(const row of list(outcomeRows)){
    if(capabilityKey&&exactCapability(row)!==capabilityKey) continue;
    const metadata=object(row?.metadata);
    if(text(metadata.outcome,80).toUpperCase()!=="VERIFIED_SUCCESS") continue;
    const historical=metadata.backfilled_from_historical_verified_execution===true;
    successUnits+=historical?0.6:1;
    if(historical) historicalSuccessCount+=1; else liveSuccessCount+=1;
  }
  let prerequisiteFrictionUnits=0;
  let prerequisiteFailureFamilies=0;
  let prerequisiteFailureOccurrences=0;
  for(const row of list(readinessRows)){
    if(capabilityKey&&exactCapability(row)!==capabilityKey) continue;
    const metadata=object(row?.metadata);
    if(text(metadata.failure_class,80)!=="PREREQUISITE_FAILURE") continue;
    if(metadata.prerequisite_signal!==true) continue;
    const occurrences=Math.max(1,Number(metadata.failure_occurrence_count||metadata.observed_in_recent_turns||1)||1);
    prerequisiteFailureOccurrences+=occurrences;
    prerequisiteFailureFamilies+=1;
    prerequisiteFrictionUnits+=Math.min(5,occurrences)*0.5;
  }
  const evidenceUnits=successUnits+prerequisiteFrictionUnits;
  const score=evidenceUnits>0?(successUnits+1)/(evidenceUnits+2):null;
  return {
    contract:AVANTIQO_CAPABILITY_READINESS_EVIDENCE_CONTRACT,
    status:evidenceUnits>0?"MEASURED":"UNKNOWN",
    score:score===null?null:Number(score.toFixed(4)),
    success_evidence_units:Number(successUnits.toFixed(4)),
    prerequisite_friction_units:Number(prerequisiteFrictionUnits.toFixed(4)),
    evidence_units:Number(evidenceUnits.toFixed(4)),
    live_verified_success_count:liveSuccessCount,
    historical_verified_success_count:historicalSuccessCount,
    prerequisite_failure_family_count:prerequisiteFailureFamilies,
    prerequisite_failure_occurrence_count:prerequisiteFailureOccurrences,
    readiness_is_contextual_observation:true,
    readiness_is_not_capability_reliability:true,
    readiness_is_not_execution_authority:true,
    authority_effect:"NONE",
  };
}

export const AvantiqoCapabilityReadinessEvidenceRuntime=Object.freeze({
  contract:AVANTIQO_CAPABILITY_READINESS_EVIDENCE_CONTRACT,
  assess:assessCapabilityReadinessEvidence,
});
