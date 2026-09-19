import { closeBusinessDiagnosisWithExternalEvidence } from "./AvantiqoBusinessExternalDiagnosisClosureRuntime.js";

export const AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_TOOL_CONTRACT = "AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_TOOL_V1";

export function createBusinessExternalDiagnosisClosureTool({
  metric="profit", industry="general", solution_ids=[], internal_evidence_batch=null,
  target_dimension_key=null, factor_observations=[], external_collection=null,
  residual_materiality_threshold=0.05,
}={}){
  if(!external_collection?.packets?.length) return null;
  return {
    name:"business_external_diagnosis_close",
    mutates:false,
    approval_required:false,
    description:"Assess collected external business evidence and deterministically re-run the diagnosis. Supply assessment judgments only; source provenance is bound server-side from the collected evidence packets and cannot be supplied or changed by the model.",
    parameters:{type:"object",properties:{assessments:{type:"array",items:{type:"object",properties:{context_id:{type:"string"},evidence_strength:{type:"number",minimum:0,maximum:1},freshness_checked:{type:"boolean"},period_matched:{type:"boolean"},timing_consistent:{type:"boolean"},direction_consistent:{type:"boolean"},magnitude_plausible:{type:"boolean"},confounders_checked:{type:"boolean"},alternative_explanations_checked:{type:"boolean"},contradicted:{type:"boolean"}},required:["context_id","evidence_strength","freshness_checked","period_matched","timing_consistent","direction_consistent","magnitude_plausible","confounders_checked","alternative_explanations_checked"],additionalProperties:false}}},required:["assessments"],additionalProperties:false},
    metadata:{contract:AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_TOOL_CONTRACT,read_only:true,source_provenance_bound_server_side:true,authority_effect:"NONE"},
    async execute(args={}){
      return closeBusinessDiagnosisWithExternalEvidence({metric,industry,solution_ids,internal_evidence_batch,target_dimension_key,factor_observations,external_collection,external_assessments:args.assessments||[],residual_materiality_threshold});
    },
  };
}

export const AvantiqoBusinessExternalDiagnosisClosureToolRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_TOOL_CONTRACT,create:createBusinessExternalDiagnosisClosureTool});
