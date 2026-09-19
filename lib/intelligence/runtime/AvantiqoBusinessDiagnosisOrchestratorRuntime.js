import { buildBusinessDiagnosisPipeline, completeBusinessDiagnosisPipeline } from "./AvantiqoBusinessDiagnosisPipelineRuntime.js";

export const AVANTIQO_BUSINESS_DIAGNOSIS_ORCHESTRATOR_CONTRACT = "AVANTIQO_BUSINESS_DIAGNOSIS_ORCHESTRATOR_V1";

const list=(v)=>Array.isArray(v)?v:[];

export function executeBusinessDiagnosisOrchestration({
  metric="profit",
  industry="general",
  solution_ids=[],
  internal_evidence_batch=null,
  target_dimension_key=null,
  factor_observations=[],
  external_evidence=[],
  residual_materiality_threshold=0.05,
}={}){
  const plan=buildBusinessDiagnosisPipeline({metric,industry,solution_ids});
  const comparisonResults=list(internal_evidence_batch?.comparison_results);
  const completed=completeBusinessDiagnosisPipeline({
    plan,
    comparison_results:comparisonResults,
    target_dimension_key,
    factor_observations:list(factor_observations),
    external_evidence:list(external_evidence),
    residual_materiality_threshold,
  });
  return {
    contract:AVANTIQO_BUSINESS_DIAGNOSIS_ORCHESTRATOR_CONTRACT,
    status:completed?.final_evidence_state||"DIAGNOSIS_INCOMPLETE",
    metric:plan.metric,
    plan,
    internal_evidence_batch:internal_evidence_batch||null,
    comparison_result_count:comparisonResults.length,
    diagnosis:completed,
    read_only:true,
    policy:{precomputed_internal_evidence_only:true,model_choreography_not_required:true,external_evidence_does_not_replace_missing_internal_target:true,no_mutation_authority:true,authority_effect:"NONE"},
    authority_effect:"NONE",
  };
}

export const AvantiqoBusinessDiagnosisOrchestratorRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_DIAGNOSIS_ORCHESTRATOR_CONTRACT,execute:executeBusinessDiagnosisOrchestration});
