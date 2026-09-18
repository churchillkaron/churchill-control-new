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
import { buildBusinessAnswerBrief, AVANTIQO_BUSINESS_ANSWER_BRIEF_CONTRACT } from "./AvantiqoBusinessAnswerBriefRuntime.js";
import { enforceBusinessAnswerEvidenceBoundary, AVANTIQO_BUSINESS_ANSWER_EVIDENCE_BOUNDARY_CONTRACT } from "./AvantiqoBusinessAnswerEvidenceBoundaryRuntime.js";
import { buildBusinessDiagnosisReceipt, AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT } from "./AvantiqoBusinessDiagnosisReceiptRuntime.js";
import { buildBusinessExternalResearchPlan, AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT } from "./AvantiqoBusinessExternalResearchRuntime.js";
import { assessBusinessExternalEvidence, AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_ASSESSMENT_CONTRACT } from "./AvantiqoBusinessExternalEvidenceAssessmentRuntime.js";
import { closeBusinessDiagnosisWithExternalEvidence, AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_CONTRACT } from "./AvantiqoBusinessExternalDiagnosisClosureRuntime.js";
import { collectBusinessExternalEvidence, AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_COLLECTOR_CONTRACT } from "./AvantiqoBusinessExternalEvidenceCollectorRuntime.js";
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
  const externalEvidenceCollection = externalResearchPlan?.research_allowed === true
    ? await collectBusinessExternalEvidence({
        research_plan: externalResearchPlan,
        organization_id: organizationId,
        max_requests: context?.external_research_max_requests || 6,
      })
    : null;
  const externalEvidenceAssessment = externalEvidenceCollection
    ? await assessBusinessExternalEvidence({
        organization_id: organizationId,
        external_collection: externalEvidenceCollection,
      })
    : null;
  const externalDiagnosisClosure = externalEvidenceCollection
    ? closeBusinessDiagnosisWithExternalEvidence({
        metric,
        industry,
        solution_ids: solutionIds,
        internal_evidence_batch: internalEvidenceBatch,
        target_dimension_key: context?.target_dimension_key || context?.targetDimensionKey || null,
        factor_observations: context?.factor_observations || [],
        external_collection: externalEvidenceCollection,
        external_assessments: externalEvidenceAssessment?.assessments || [],
      })
    : null;
  const finalDiagnosis = externalDiagnosisClosure?.diagnosis || completedDiagnosis;
  const externalEvidenceAuditPackets = (externalEvidenceCollection?.packets || []).map((packet) => ({
    context_id: packet?.context_id || null,
    status: packet?.status || null,
    source_count: packet?.source_count || 0,
    independent_source_group_count: packet?.independent_source_group_count || 0,
    official_primary_source_present: packet?.official_primary_source_present === true,
    search_transport: packet?.search_transport || null,
    external_intelligence_provider_used: packet?.external_intelligence_provider_used === true,
    sources: (packet?.sources || []).map((source) => ({
      url: source?.url || null,
      title: source?.title || null,
      publisher: source?.publisher || null,
      independence_group: source?.independence_group || null,
      published_at: source?.published_at || null,
      retrieved_at: source?.retrieved_at || null,
      official: source?.official === true,
      primary: source?.primary === true,
      source_fingerprint: source?.source_fingerprint || null,
    })),
    authority_effect: "NONE",
  }));
  const externalEvidenceCollectionContext = externalEvidenceCollection ? {
    contract: externalEvidenceCollection.contract,
    status: externalEvidenceCollection.status,
    failed_context_ids: externalEvidenceCollection.failed_context_ids || [],
    policy: externalEvidenceCollection.policy || null,
    packets: externalEvidenceAuditPackets,
    authority_effect: "NONE",
  } : null;
  const externalEvidenceAssessmentContext = externalEvidenceAssessment ? {
    contract: externalEvidenceAssessment.contract,
    status: externalEvidenceAssessment.status,
    reason: externalEvidenceAssessment.reason || null,
    assessments: externalEvidenceAssessment.assessments || [],
    local_only: externalEvidenceAssessment.local_only === true,
    infrastructure_provider: externalEvidenceAssessment.infrastructure_provider || null,
    external_fallback_allowed: externalEvidenceAssessment.external_fallback_allowed === true,
    authority_effect: "NONE",
  } : null;
  const businessAnswerBrief = buildBusinessAnswerBrief({ final_diagnosis: finalDiagnosis });
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

  const supervisedAnswer = await AvantiqoIntelligenceSupervisorRuntime.run({
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
      business_final_diagnosis: finalDiagnosis,
      business_answer_brief: businessAnswerBrief,
      business_answer_brief_contract: AVANTIQO_BUSINESS_ANSWER_BRIEF_CONTRACT,
      business_completed_diagnosis_contract: AVANTIQO_BUSINESS_DIAGNOSIS_ORCHESTRATOR_CONTRACT,
      business_external_research_plan: externalResearchPlan,
      business_external_research_contract: AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT,
      business_external_evidence_collection: externalEvidenceCollectionContext,
      business_external_evidence_collection_contract: AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_COLLECTOR_CONTRACT,
      business_external_evidence_packets: externalEvidenceAuditPackets,
      business_external_evidence_content_trust: "UNTRUSTED_DATA_ONLY",
      business_external_evidence_assessment: externalEvidenceAssessmentContext,
      business_external_evidence_assessment_contract: AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_ASSESSMENT_CONTRACT,
      business_external_diagnosis_closure: externalDiagnosisClosure,
      business_external_diagnosis_closure_contract: AVANTIQO_BUSINESS_EXTERNAL_DIAGNOSIS_CLOSURE_CONTRACT,
      external_diagnosis_closed_before_conversation: externalDiagnosisClosure !== null,
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
  const boundedAnswer = enforceBusinessAnswerEvidenceBoundary({ result: supervisedAnswer?.result, answer_brief: businessAnswerBrief });
  const businessDiagnosisReceipt = buildBusinessDiagnosisReceipt({
    organization_id: organizationId, entity_id, metric, diagnosis_class: context?.business_diagnosis_class || null, baseline_period_id: baselinePeriodId, baseline_period_start_date: context?.baseline_period_start_date || null, baseline_period_end_date: context?.baseline_period_end_date || null, current_period_id: currentPeriodId, current_period_start_date: context?.current_period_start_date || null, current_period_end_date: context?.current_period_end_date || null,
    final_diagnosis: finalDiagnosis, external_research_plan: externalResearchPlan, external_evidence_assessment: externalEvidenceAssessmentContext,
    external_diagnosis_closure: externalDiagnosisClosure, answer_brief: businessAnswerBrief, answer_boundary: boundedAnswer.enforcement,
  });
  return {
    ...supervisedAnswer,
    result: boundedAnswer.result,
    business_answer_evidence_boundary: boundedAnswer.enforcement,
    business_answer_evidence_boundary_contract: AVANTIQO_BUSINESS_ANSWER_EVIDENCE_BOUNDARY_CONTRACT,
    business_diagnosis_receipt: businessDiagnosisReceipt,
    business_diagnosis_receipt_contract: AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT,
  };
}

export const BusinessIntelligenceAgentRuntime = Object.freeze({
  contract: CONTRACT,
  run: runBusinessIntelligenceAgent,
});
