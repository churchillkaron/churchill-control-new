import { buildBusinessEvidenceExecutionPlan } from "./AvantiqoBusinessEvidenceExecutionPlanRuntime.js";
import { businessReadTimeSemantics } from "./AvantiqoBusinessReadTimeSemanticsRuntime.js";

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
  const assessedReads = execution.internal_reads.map((row) => ({ row, time_semantics: businessReadTimeSemantics(row.capability_key) }));
  const excluded_reads = assessedReads.filter(({time_semantics})=>time_semantics.comparison_safe!==true).map(({row,time_semantics})=>({capability_key:row.capability_key,supports_driver_ids:[...row.supports_driver_ids],time_semantics,reason:time_semantics.reason||"HISTORICAL_COMPARISON_NOT_PROVEN"}));
  const reads = assessedReads.filter(({time_semantics})=>time_semantics.comparison_safe===true).map(({row,time_semantics}, index) => ({
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
    time_semantics,
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
    excluded_reads,
    excluded_read_count: excluded_reads.length,
    policy: {
      same_capability_required: true,
      same_organization_required: true,
      same_entity_required_when_entity_scoped: true,
      different_periods_required: true,
      same_measure_and_dimension_required_for_comparison: true,
      currency_must_not_be_combined: true,
      missing_baseline_or_current_is_evidence_gap: true,
      historical_semantics_must_be_proven_before_pairing: true,
      current_state_reads_are_excluded_from_period_comparison: true,
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
