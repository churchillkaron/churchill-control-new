import {
  AvantiqoIntelligenceSupervisorRuntime,
} from "./AvantiqoIntelligenceSupervisorRuntime";
import {
  ROIIntelligenceRuntime,
} from "./ROIIntelligenceRuntime";
import {
  BusinessIntelligenceRuntime,
} from "./BusinessIntelligenceRuntime";
import { businessDriverDiagnosisPlan } from "./AvantiqoBusinessDriverGraphRuntime";
import { buildBusinessDriverEvidencePlan } from "./AvantiqoBusinessDriverEvidencePlanRuntime";
import { AVANTIQO_BUSINESS_VARIANCE_DECOMPOSITION_CONTRACT } from "./AvantiqoBusinessVarianceDecompositionRuntime";
import { AVANTIQO_BUSINESS_CAUSAL_HYPOTHESIS_CONTRACT } from "./AvantiqoBusinessCausalHypothesisRuntime";
import { buildBusinessExternalResearchPlan, AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT } from "./AvantiqoBusinessExternalResearchRuntime.js";
import { buildBusinessEvidenceExecutionPlan } from "./AvantiqoBusinessEvidenceExecutionPlanRuntime";
import { createOperatorIntelligenceReadTools } from "../../operator/runtime/OperatorIntelligenceToolBridgeRuntime.js";
import { buildBusinessDiagnosisPipeline, AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_CONTRACT } from "./AvantiqoBusinessDiagnosisPipelineRuntime";
import { AVANTIQO_BUSINESS_OBSERVATION_NORMALIZER_CONTRACT } from "./AvantiqoBusinessObservationNormalizerRuntime.js";
import { AVANTIQO_BUSINESS_OBSERVATION_DRIVER_MAP_CONTRACT } from "./AvantiqoBusinessObservationDriverMapRuntime.js";
import { AVANTIQO_BUSINESS_PERIOD_COMPARISON_PLAN_CONTRACT, buildBusinessPeriodComparisonPlan } from "./AvantiqoBusinessPeriodComparisonPlanRuntime.js";
import { createBusinessPeriodComparisonTools, AVANTIQO_BUSINESS_PERIOD_COMPARISON_TOOL_CONTRACT } from "./AvantiqoBusinessPeriodComparisonToolRuntime.js";
import { executeBusinessInternalEvidenceBatch, AVANTIQO_BUSINESS_INTERNAL_EVIDENCE_BATCH_CONTRACT } from "./AvantiqoBusinessInternalEvidenceBatchRuntime.js";

const CONTRACT = "AVANTIQO_BUSINESS_INTELLIGENCE_AGENT_V2";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}


function diagnosisMetric(question, context = {}) {
  const explicit = text(context?.business_metric || context?.metric, 80).toLowerCase();
  const allowed = new Set(["profit","cash","demand","staffing","inventory_health","customer_retention","customer_acquisition","service_quality","project_delivery","revenue","cost_total","labor","volume"]);
  if (allowed.has(explicit)) return explicit;
  const q = text(question).toLowerCase();
  if (/\b(cash|cash flow|liquidity|bank balance|receivables|collections?)\b/.test(q)) return "cash";
  if (/\b(demand|bookings?|sales volume|enquiries|leads?)\b/.test(q)) return "demand";
  if (/\b(staffing|attendance|turnover|roster|staff coverage|overtime)\b/.test(q)) return "staffing";
  if (/\b(inventory|stock|stockout|shrinkage)\b/.test(q)) return "inventory_health";
  if (/\b(churn|retention|repeat customers?)\b/.test(q)) return "customer_retention";
  if (/\b(customer acquisition|new customers?|lead conversion|conversion rate)\b/.test(q)) return "customer_acquisition";
  if (/\b(service quality|complaints?|response time|service failures?)\b/.test(q)) return "service_quality";
  if (/\b(project delay|delivery delay|project delivery|task blocker|supplier delay)\b/.test(q)) return "project_delivery";
  if (/\b(revenue|sales)\b/.test(q)) return "revenue";
  if (/\b(cost|expense|cogs|food cost)\b/.test(q)) return "cost_total";
  if (/\b(labor|labour|payroll)\b/.test(q)) return "labor";
  return "profit";
}

function buildReadOnlyTools(organization_id) {
  return [
    {
      name: "business_roi_read",
      description:
        "Read organization-scoped attribution, customer and revenue totals grouped by provider/channel. Use this before making claims about channel ROI or conversion.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      mutates: false,
      approval_required: false,
      async execute() {
        return {
          organization_id,
          channels: await ROIIntelligenceRuntime.organization(organization_id),
        };
      },
    },
    {
      name: "business_channel_analysis_read",
      description:
        "Read organization-scoped channel analysis and deterministic recommendations derived from current attribution data.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      mutates: false,
      approval_required: false,
      async execute() {
        return BusinessIntelligenceRuntime.analyzeOrganization(organization_id);
      },
    },
  ];
}

export async function runBusinessIntelligenceAgent({
  organization_id,
  party_id = null,
  entity_id = null,
  question,
  messages = [],
  context = {},
  memories = [],
  metadata = {},
  actor = {},
  permissions = [],
  callerRequest = null,
  period_id = null,
  onReadReceipt = null,
  mode = "deep",
} = {}) {
  const organizationId = text(organization_id);
  if (!organizationId) {
    throw new Error("AVANTIQO_BUSINESS_INTELLIGENCE_ORGANIZATION_REQUIRED");
  }
  if (!text(question)) {
    throw new Error("AVANTIQO_BUSINESS_INTELLIGENCE_QUESTION_REQUIRED");
  }

  const metric = diagnosisMetric(question, context);
  const industry = context?.industry || context?.organization?.industry || "general";
  const solutionIds = context?.solution_ids || [];
  const executionPlan = buildBusinessEvidenceExecutionPlan({ metric, industry, solution_ids: solutionIds });
  const selectedReadKeys = executionPlan.internal_reads.map((row) => row.capability_key);
  const baselinePeriodId = context?.baseline_period_id || context?.baselinePeriodId || null;
  const currentPeriodId = period_id || context?.current_period_id || context?.currentPeriodId || context?.period_id || context?.periodId || null;
  const periodComparisonPlan = baselinePeriodId && currentPeriodId && baselinePeriodId !== currentPeriodId
    ? buildBusinessPeriodComparisonPlan({ metric, industry, solution_ids: solutionIds, baseline_period_id: baselinePeriodId, current_period_id: currentPeriodId, organization_id: organizationId, entity_id })
    : null;
  const comparisonTools = periodComparisonPlan
    ? await createBusinessPeriodComparisonTools({ plan: periodComparisonPlan, actor, permissions, callerRequest, partyId: party_id, message: text(question), onReadReceipt })
    : [];
  const comparisonTool = comparisonTools.find((tool) => tool.name === "business_period_compare_read") || null;
  const internalEvidenceBatch = periodComparisonPlan
    ? await executeBusinessInternalEvidenceBatch({
        plan: periodComparisonPlan,
        comparison_tool: comparisonTool,
        required_driver_ids: buildBusinessDiagnosisPipeline({ metric, industry, solution_ids: solutionIds })?.diagnosis?.internal_driver_ids || [],
      })
    : null;
  const completedDiagnosis = internalEvidenceBatch
    ? executeBusinessDiagnosisOrchestration({
        metric,
        industry,
        solution_ids: solutionIds,
        internal_evidence_batch: internalEvidenceBatch,
        target_dimension_key: context?.target_dimension_key || context?.targetDimensionKey || null,
        factor_observations: context?.factor_observations || [],
        external_evidence: [],
      })
    : null;
  const driverEvidencePlan = buildBusinessDriverEvidencePlan({ metric, industry, solution_ids: solutionIds });
  const externalResearchPlan = buildBusinessExternalResearchPlan({
    completed_diagnosis: completedDiagnosis,
    evidence_plan: driverEvidencePlan,
    location: context?.business_location || context?.location || context?.organization?.location || null,
    baseline_period_id: baselinePeriodId,
    current_period_id: currentPeriodId,
  });
  const governedReadTools = await createOperatorIntelligenceReadTools({
    organizationId,
    entityId: entity_id,
    periodId: period_id || context?.period_id || context?.periodId || null,
    partyId: party_id,
    actor,
    permissions,
    callerRequest,
    message: text(question),
    allowedCapabilityKeys: selectedReadKeys,
    maxTools: Math.max(1, selectedReadKeys.length),
    onReadReceipt,
  });

  return AvantiqoIntelligenceSupervisorRuntime.run({
    organization_id: organizationId,
    party_id,
    entity_id,
    goal: text(question),
    messages,
    context: {
      ...object(context),
      domain: "business_intelligence",
      mutation_policy: "read_only",
      business_driver_metric: metric,
      business_driver_diagnosis: businessDriverDiagnosisPlan({ metric, industry, solution_ids: solutionIds }),
      business_driver_evidence_plan: driverEvidencePlan,
      business_evidence_execution_plan: executionPlan,
      business_live_internal_read_keys: selectedReadKeys,
      business_diagnosis_pipeline: buildBusinessDiagnosisPipeline({ metric, industry: context?.industry || context?.organization?.industry || "general", solution_ids: context?.solution_ids || [] }),
      business_diagnosis_pipeline_contract: AVANTIQO_BUSINESS_DIAGNOSIS_PIPELINE_CONTRACT,
      business_observation_normalizer_contract: AVANTIQO_BUSINESS_OBSERVATION_NORMALIZER_CONTRACT,
      business_observation_driver_map_contract: AVANTIQO_BUSINESS_OBSERVATION_DRIVER_MAP_CONTRACT,
      business_period_comparison_plan: periodComparisonPlan,
      business_period_comparison_plan_contract: AVANTIQO_BUSINESS_PERIOD_COMPARISON_PLAN_CONTRACT,
      business_period_comparison_tool_contract: AVANTIQO_BUSINESS_PERIOD_COMPARISON_TOOL_CONTRACT,
      business_internal_evidence_batch: internalEvidenceBatch,
      business_internal_evidence_batch_contract: AVANTIQO_BUSINESS_INTERNAL_EVIDENCE_BATCH_CONTRACT,
      business_internal_comparison_results: internalEvidenceBatch?.comparison_results || [],
      business_internal_evidence_bundle: internalEvidenceBatch?.evidence_bundle || null,
      business_completed_diagnosis: completedDiagnosis,
      business_completed_diagnosis_contract: AVANTIQO_BUSINESS_DIAGNOSIS_ORCHESTRATOR_CONTRACT,
      business_external_research_plan: externalResearchPlan,
      business_external_research_contract: AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT,
      external_research_required: externalResearchPlan?.research_allowed === true,
      business_variance_decomposition_contract: AVANTIQO_BUSINESS_VARIANCE_DECOMPOSITION_CONTRACT,
      business_causal_hypothesis_contract: AVANTIQO_BUSINESS_CAUSAL_HYPOTHESIS_CONTRACT,
    },
    memories,
    tools: [...buildReadOnlyTools(organizationId), ...governedReadTools, ...comparisonTools],
    authorization: {
      allow_mutating_tools: false,
    },
    metadata: {
      ...object(metadata),
      module: "INTELLIGENCE",
      operation: "BUSINESS_INTELLIGENCE_AGENT",
      business_intelligence_contract: CONTRACT,
    },
    mode,
  });
}

export const BusinessIntelligenceAgentRuntime = Object.freeze({
  contract: CONTRACT,
  run: runBusinessIntelligenceAgent,
});
