import { buildBusinessEvidenceExecutionPlan } from "./AvantiqoBusinessEvidenceExecutionPlanRuntime.js";

export const AVANTIQO_BUSINESS_PERIOD_COMPARISON_PLAN_CONTRACT = "AVANTIQO_BUSINESS_PERIOD_COMPARISON_PLAN_V1";

const text = (v, n=180) => String(v ?? "").trim().slice(0, n);

export function buildBusinessPeriodComparisonPlan({
  metric = "profit",
  industry = "general",
  solution_ids = [],
  baseline_period_id,
  current_period_id,
  organization_id = null,
  entity_id = null,
  available_reads = null,
} = {}) {
  const baselinePeriodId = text(baseline_period_id);
  const currentPeriodId = text(current_period_id);
  if (!baselinePeriodId || !currentPeriodId) {
    throw new Error("AVANTIQO_BUSINESS_COMPARISON_PERIODS_REQUIRED");
  }
  if (baselinePeriodId === currentPeriodId) {
    throw new Error("AVANTIQO_BUSINESS_COMPARISON_PERIODS_MUST_DIFFER");
  }
  const execution = buildBusinessEvidenceExecutionPlan({ metric, industry, solution_ids, available_reads });
  const reads = execution.internal_reads.map((row, index) => ({
    order: index + 1,
    capability_key: row.capability_key,
    supports_driver_ids: [...row.supports_driver_ids],
    baseline: {
      period_id: baselinePeriodId,
      organization_id: text(organization_id) || null,
      entity_id: text(entity_id) || null,
    },
    current: {
      period_id: currentPeriodId,
      organization_id: text(organization_id) || null,
      entity_id: text(entity_id) || null,
    },
    comparison_required: true,
    mutates: false,
  }));
  return {
    contract: AVANTIQO_BUSINESS_PERIOD_COMPARISON_PLAN_CONTRACT,
    metric: execution.metric,
    industry: execution.industry,
    baseline_period_id: baselinePeriodId,
    current_period_id: currentPeriodId,
    organization_id: text(organization_id) || null,
    entity_id: text(entity_id) || null,
    read_pairs: reads,
    read_pair_count: reads.length,
    policy: {
      same_capability_required: true,
      same_organization_required: true,
      same_entity_required_when_entity_scoped: true,
      different_periods_required: true,
      same_measure_and_dimension_required_for_comparison: true,
      currency_must_not_be_combined: true,
      missing_baseline_or_current_is_evidence_gap: true,
      read_only: true,
      authority_effect: "NONE",
    },
    authority_effect: "NONE",
  };
}

export const AvantiqoBusinessPeriodComparisonPlanRuntime = Object.freeze({
  contract: AVANTIQO_BUSINESS_PERIOD_COMPARISON_PLAN_CONTRACT,
  build: buildBusinessPeriodComparisonPlan,
});
