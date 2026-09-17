import { businessDriverDiagnosisPlan } from "./AvantiqoBusinessDriverGraphRuntime.js";
import { buildBusinessDriverEvidencePlan } from "./AvantiqoBusinessDriverEvidencePlanRuntime.js";
import { buildBusinessEvidenceExecutionPlan } from "./AvantiqoBusinessEvidenceExecutionPlanRuntime.js";
import { decomposeBusinessVariance } from "./AvantiqoBusinessVarianceDecompositionRuntime.js";
import { testBusinessCausalHypotheses } from "./AvantiqoBusinessCausalHypothesisRuntime.js";
import { buildBusinessComparisonEvidenceBundle } from "./AvantiqoBusinessComparisonEvidenceBundleRuntime.js";
import { resolveBusinessTargetMetric } from "./AvantiqoBusinessTargetMetricResolverRuntime.js";
import { buildAccountingDecomposition } from "./AvantiqoBusinessAccountingDecompositionRuntime.js";

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

export function completeBusinessDiagnosisPipeline({ plan, baseline_value, actual_value, target_dimension_key = null, driver_rows = [], comparison_results = [], external_evidence = [], residual_materiality_threshold = 0.05 } = {}) {
  if (!plan || plan.contract !== AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_CONTRACT) throw new Error("AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_PLAN_REQUIRED");
  const requiredDriverIds = plan?.diagnosis?.internal_driver_ids || [];
  const evidence_bundle = comparison_results.length
    ? buildBusinessComparisonEvidenceBundle({ comparison_results, required_driver_ids: requiredDriverIds })
    : null;
  const accounting_decomposition = comparison_results.length ? buildAccountingDecomposition({ metric: plan.metric, comparison_results }) : null;
  const effectiveRows = accounting_decomposition?.status === "DECOMPOSITION_READY" && accounting_decomposition.driver_rows.length
    ? accounting_decomposition.driver_rows
    : evidence_bundle ? evidence_bundle.contribution_rows : driver_rows;
  const explicitBaseline = numberOrNull(baseline_value);
  const explicitActual = numberOrNull(actual_value);
  const target_metric = explicitBaseline !== null && explicitActual !== null
    ? { status: "TARGET_METRIC_READY", metric: plan.metric, baseline_value: explicitBaseline, actual_value: explicitActual, evidence_status: "EXPLICIT_VERIFIED_INPUT", authority_effect: "NONE" }
    : resolveBusinessTargetMetric({ metric: plan.metric, comparison_results, dimension_key: target_dimension_key });
  if (target_metric.status !== "TARGET_METRIC_READY") {
    return {
      ...plan,
      current_stage: "VERIFY_TARGET_METRIC_EVIDENCE",
      evidence_bundle,
      accounting_decomposition,
      target_metric,
      variance: null,
      residual_material: null,
      residual_ratio: null,
      external_research_allowed: false,
      causal: null,
      final_evidence_state: "TARGET_METRIC_EVIDENCE_GAP",
      policy: {
        target_metric_must_be_observed_or_explicitly_verified: true,
        external_research_cannot_replace_missing_internal_target_metric: true,
        no_mutation_authority_from_diagnosis: true,
      },
      authority_effect: "NONE",
    };
  }
  const variance = decomposeBusinessVariance({ metric: plan.metric, baseline_value: target_metric.baseline_value, actual_value: target_metric.actual_value, driver_rows: effectiveRows, external_evidence: [] });
  const metricChange = Math.max(Math.abs(numberOrNull(variance.metric_change) || 0), 1e-9);
  const residualRatio = Math.abs(numberOrNull(variance.unexplained_residual) || 0) / metricChange;
  const residualMaterial = residualRatio >= Math.max(0, Math.min(1, Number(residual_materiality_threshold) || 0.05));
  const causal = residualMaterial ? testBusinessCausalHypotheses({ external_evidence, unexplained_residual: variance.unexplained_residual }) : testBusinessCausalHypotheses({ external_evidence: [], unexplained_residual: variance.unexplained_residual });
  return {
    ...plan,
    current_stage: "REPORT_SUPPORTED_AND_UNRESOLVED_DRIVERS",
    evidence_bundle,
    accounting_decomposition,
    target_metric,
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
      incomplete_or_ambiguous_driver_coverage_prevents_full_explanation: true,
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
