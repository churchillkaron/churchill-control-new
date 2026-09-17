import { businessDriverDiagnosisPlan } from "./AvantiqoBusinessDriverGraphRuntime.js";
import { buildBusinessDriverEvidencePlan } from "./AvantiqoBusinessDriverEvidencePlanRuntime.js";
import { buildBusinessEvidenceExecutionPlan } from "./AvantiqoBusinessEvidenceExecutionPlanRuntime.js";
import { decomposeBusinessVariance } from "./AvantiqoBusinessVarianceDecompositionRuntime.js";
import { testBusinessCausalHypotheses } from "./AvantiqoBusinessCausalHypothesisRuntime.js";

export const AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_CONTRACT = "AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_V1";

const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export function buildBusinessDiagnosisPipeline({ metric = "profit", industry = "general", solution_ids = [], available_reads = null } = {}) {
  const diagnosis = businessDriverDiagnosisPlan({ metric, industry, solution_ids });
  const evidence_plan = buildBusinessDriverEvidencePlan({ metric: diagnosis.metric, industry, solution_ids, available_reads });
  const execution_plan = buildBusinessEvidenceExecutionPlan({ metric: diagnosis.metric, industry, solution_ids, available_reads });
  return {
    contract: AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_CONTRACT,
    metric: diagnosis.metric,
    diagnosis,
    evidence_plan,
    execution_plan,
    stages: [
      "SELECT_METRIC",
      "MAP_INTERNAL_DRIVERS",
      "PLAN_AUTHORITATIVE_INTERNAL_READS",
      "VERIFY_SCOPE_AND_PERIOD",
      "NORMALIZE_LIVE_OBSERVATIONS",
      "MAP_OBSERVATIONS_TO_DRIVERS",
      "QUANTIFY_INTERNAL_VARIANCE",
      "CALCULATE_UNEXPLAINED_RESIDUAL",
      "GATE_EXTERNAL_RESEARCH_ON_MATERIAL_RESIDUAL",
      "TEST_EXTERNAL_CAUSAL_HYPOTHESES",
      "REPORT_SUPPORTED_AND_UNRESOLVED_DRIVERS",
    ],
    current_stage: "PLAN_AUTHORITATIVE_INTERNAL_READS",
    unresolved_internal_driver_ids: [...evidence_plan.internal_driver_gap_ids],
    external_research_allowed: false,
    read_only: true,
    authority_effect: "NONE",
  };
}

export function completeBusinessDiagnosisPipeline({ plan, baseline_value, actual_value, driver_rows = [], external_evidence = [], residual_materiality_threshold = 0.05 } = {}) {
  if (!plan || plan.contract !== AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_CONTRACT) throw new Error("AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_PLAN_REQUIRED");
  const variance = decomposeBusinessVariance({ metric: plan.metric, baseline_value, actual_value, driver_rows, external_evidence: [] });
  const metricChange = Math.max(Math.abs(numberOrNull(variance.metric_change) || 0), 1e-9);
  const residualRatio = Math.abs(numberOrNull(variance.unexplained_residual) || 0) / metricChange;
  const residualMaterial = residualRatio >= Math.max(0, Math.min(1, Number(residual_materiality_threshold) || 0.05));
  const causal = residualMaterial ? testBusinessCausalHypotheses({ external_evidence, unexplained_residual: variance.unexplained_residual }) : testBusinessCausalHypotheses({ external_evidence: [], unexplained_residual: variance.unexplained_residual });
  return {
    ...plan,
    current_stage: "REPORT_SUPPORTED_AND_UNRESOLVED_DRIVERS",
    variance,
    residual_material: residualMaterial,
    residual_ratio: Number(residualRatio.toFixed(4)),
    external_research_allowed: residualMaterial,
    causal,
    final_evidence_state: causal.supported_context_ids.length ? "INTERNAL_AND_SUPPORTED_EXTERNAL" : residualMaterial ? "INTERNAL_WITH_UNRESOLVED_EXTERNAL_RESIDUAL" : "INTERNAL_SUFFICIENT",
    policy: {
      external_research_requires_material_residual: true,
      unsupported_external_storytelling_forbidden: true,
      unresolved_internal_gaps_remain_visible: true,
      no_mutation_authority_from_diagnosis: true,
    },
    authority_effect: "NONE",
  };
}

export const AvantiqoBusinessDiagnosisPipelineRuntime = Object.freeze({
  contract: AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_CONTRACT,
  build: buildBusinessDiagnosisPipeline,
  complete: completeBusinessDiagnosisPipeline,
});
