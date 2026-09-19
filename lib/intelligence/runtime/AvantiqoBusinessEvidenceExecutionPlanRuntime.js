import { buildBusinessDriverEvidencePlan } from "./AvantiqoBusinessDriverEvidencePlanRuntime.js";

export const AVANTIQO_BUSINESS_EVIDENCE_EXECUTION_PLAN_CONTRACT = "AVANTIQO_BUSINESS_EVIDENCE_EXECUTION_PLAN_V1";

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

export function buildBusinessEvidenceExecutionPlan({ metric = "profit", industry = "general", solution_ids = [], available_reads = null } = {}) {
  const evidence = buildBusinessDriverEvidencePlan({ metric, industry, solution_ids, available_reads });
  const seen = new Set();
  const internal_reads = [];
  for (const row of evidence.internal_evidence_plan) {
    for (const key of row.registered_read_capability_keys || []) {
      if (seen.has(key)) continue;
      seen.add(key);
      internal_reads.push({
        order: internal_reads.length + 1,
        capability_key: key,
        supports_driver_ids: evidence.internal_evidence_plan
          .filter((item) => (item.registered_read_capability_keys || []).includes(key))
          .map((item) => item.driver_id),
        purpose: "AUTHORITATIVE_INTERNAL_EVIDENCE",
        mutates: false,
      });
    }
  }
  const external_queries = evidence.external_evidence_plan.map((item, index) => ({
    order: index + 1,
    context_id: item.context_id,
    query: item.query,
    freshness: item.freshness,
    execute_only_if_internal_residual_remains: true,
    mutates: false,
  }));
  return {
    contract: AVANTIQO_BUSINESS_EVIDENCE_EXECUTION_PLAN_CONTRACT,
    metric: evidence.metric,
    industry: evidence.industry,
    internal_reads,
    internal_read_count: internal_reads.length,
    uncovered_internal_driver_ids: unique(evidence.internal_driver_gap_ids),
    external_queries,
    execution_order: [
      "RUN_INTERNAL_AUTHORITATIVE_READS",
      "VERIFY_PERIOD_AND_SCOPE_ALIGNMENT",
      "QUANTIFY_INTERNAL_VARIANCE",
      "CALCULATE_UNEXPLAINED_RESIDUAL",
      "ONLY_IF_RESIDUAL_MATERIAL_RUN_EXTERNAL_RESEARCH",
      "TEST_EXTERNAL_CAUSAL_HYPOTHESES",
      "REPORT_SUPPORTED_AND_UNRESOLVED_DRIVERS",
    ],
    policy: {
      internal_reads_before_external_research: true,
      deduplicate_capability_reads: true,
      missing_authoritative_read_must_remain_gap: true,
      external_research_requires_material_residual: true,
      read_only: true,
      authority_effect: "NONE",
    },
    authority_effect: "NONE",
  };
}

export const AvantiqoBusinessEvidenceExecutionPlanRuntime = Object.freeze({
  contract: AVANTIQO_BUSINESS_EVIDENCE_EXECUTION_PLAN_CONTRACT,
  build: buildBusinessEvidenceExecutionPlan,
});
