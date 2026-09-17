import { validateBusinessExternalEvidence } from "./AvantiqoBusinessExternalResearchRuntime.js";
import { executeBusinessDiagnosisOrchestration } from "./AvantiqoBusinessDiagnosisOrchestratorRuntime.js";

export const AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_CONTRACT = "AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_V1";
const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=180)=>String(v??"").trim().slice(0,n);

export function closeBusinessDiagnosisWithExternalEvidence({
  metric="profit", industry="general", solution_ids=[], internal_evidence_batch=null,
  target_dimension_key=null, factor_observations=[], external_collection=null,
  external_assessments=[], residual_materiality_threshold=0.05,
}={}){
  const assessments=list(external_assessments);
  const assessmentCounts=new Map();
  const byContext=new Map();
  for(const row of assessments){
    const contextId=text(row?.context_id,160);
    if(!contextId) continue;
    assessmentCounts.set(contextId,(assessmentCounts.get(contextId)||0)+1);
    if(!byContext.has(contextId)) byContext.set(contextId,row);
  }
  const packets=list(external_collection?.packets);
  const expectedContextIds=new Set(packets.map((packet)=>text(packet?.context_id,160)).filter(Boolean));
  const duplicateContextIds=[...assessmentCounts.entries()].filter(([,count])=>count>1).map(([contextId])=>contextId);
  const duplicateContextSet=new Set(duplicateContextIds);
  const unknownContextIds=[...assessmentCounts.keys()].filter((contextId)=>!expectedContextIds.has(contextId));
  const validations=[];
  const causalEvidence=[];
  const assessedExpectedContextIds=new Set();
  for(const packet of packets){
    const contextId=text(packet?.context_id,160);
    if(!contextId||packet?.status!=="SOURCES_COLLECTED") continue;
    if(duplicateContextSet.has(contextId)){
      validations.push({context_id:contextId,status:"ASSESSMENT_DUPLICATE_REJECTED",reason:"DUPLICATE_CONTEXT_ASSESSMENTS",causal_evidence:null,authority_effect:"NONE"});
      continue;
    }
    const assessment=byContext.get(contextId);
    if(!assessment){
      validations.push({context_id:contextId,status:"ASSESSMENT_REQUIRED",causal_evidence:null,authority_effect:"NONE"});
      continue;
    }
    assessedExpectedContextIds.add(contextId);
    const validated=validateBusinessExternalEvidence({
      request:packet.request,
      evidence:{...assessment,sources:list(packet.sources)},
    });
    validations.push(validated);
    if(validated.status==="CAUSAL_EVIDENCE_READY"&&validated.causal_evidence) causalEvidence.push(validated.causal_evidence);
  }
  const diagnosis=executeBusinessDiagnosisOrchestration({
    metric,industry,solution_ids,internal_evidence_batch,target_dimension_key,
    factor_observations:list(factor_observations),external_evidence:causalEvidence,
    residual_materiality_threshold,
  });
  return {
    contract:AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_CONTRACT,
    status:causalEvidence.length?"DIAGNOSIS_REASSESSED_WITH_VALIDATED_EXTERNAL_EVIDENCE":"DIAGNOSIS_REASSESSED_WITHOUT_VALIDATED_EXTERNAL_EVIDENCE",
    validation_results:validations,
    assessment_integrity:{
      expected_context_ids:[...expectedContextIds],
      missing_context_ids:[...expectedContextIds].filter((contextId)=>!assessedExpectedContextIds.has(contextId)&&!duplicateContextSet.has(contextId)),
      duplicate_context_ids:duplicateContextIds,
      unknown_context_ids:unknownContextIds,
      clean:duplicateContextIds.length===0&&unknownContextIds.length===0,
    },
    causal_evidence:causalEvidence,
    validated_context_ids:causalEvidence.map((row)=>row.context_id),
    diagnosis,
    policy:{raw_collection_never_enters_causal_model:true,owned_assessment_required:true,source_validation_required:true,unsupported_packets_remain_unresolved:true,no_automatic_monetary_attribution:true,authority_effect:"NONE"},
    authority_effect:"NONE",
  };
}

export const AvantiqoBusinessExternalDiagnosisClosureRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_CONTRACT,close:closeBusinessDiagnosisWithExternalEvidence});
