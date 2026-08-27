import { OperatorIntelligenceToolBridgeRuntime } from "./OperatorIntelligenceToolBridgeRuntime";
import { OperatorIntelligenceActionCandidateRuntime } from "./OperatorIntelligenceActionCandidateRuntime";
import { OperatorIntelligencePlanGraphRuntime, buildOperatorIntelligencePlan } from "./OperatorIntelligencePlanGraphRuntime";
import { OperatorIntelligenceEvidenceRevisionRuntime } from "./OperatorIntelligenceEvidenceRevisionRuntime";
import { OperatorIntelligenceRecoveryPolicyRuntime, assessOperatorIntelligencePlanWithRecoveryPolicy, reviseOperatorIntelligencePlanWithRecoveryPolicy } from "./OperatorIntelligenceRecoveryPolicyRuntime.js";
import { OperatorIntelligenceDeliberativeDecisionRuntime, deliberateOperatorIntelligenceDecision } from "./OperatorIntelligenceDeliberativeDecisionRuntime.js";
import { OperatorIntelligenceDecisionRobustnessRuntime, stressTestOperatorIntelligenceDecision } from "./OperatorIntelligenceDecisionRobustnessRuntime.js";
import { OperatorIntelligenceDecisionValidityRuntime, assessOperatorIntelligenceDecisionValidity } from "./OperatorIntelligenceDecisionValidityRuntime.js";
import { OperatorIntelligenceUncertaintyPriorityRuntime, prioritizeOperatorIntelligenceUncertainties } from "./OperatorIntelligenceUncertaintyPriorityRuntime.js";
import { OperatorIntelligenceDecisionReadinessRuntime, assessOperatorIntelligenceDecisionReadiness } from "./OperatorIntelligenceDecisionReadinessRuntime.js";
import { OperatorIntelligenceDecisionProvenanceRuntime, buildOperatorIntelligenceDecisionProvenance } from "./OperatorIntelligenceDecisionProvenanceRuntime.js";
import { OperatorIntelligenceDecisionContingencyRuntime, assessOperatorIntelligenceDecisionContingency } from "./OperatorIntelligenceDecisionContingencyRuntime.js";
import { OperatorIntelligenceDecisionOutcomeContractRuntime, buildOperatorIntelligenceDecisionOutcomeContract } from "./OperatorIntelligenceDecisionOutcomeContractRuntime.js";

const CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V10";
const PLAN_TOOL_NAME = "operator_plan_graph";

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }

function createPlanGraphTool() {
  return {
    name: PLAN_TOOL_NAME,
    description: [
      "Build, assess, boundedly revise, deliberate, stress-test, validate, prioritize uncertainty, assess readiness, build structured provenance, assess contingency readiness, or build a falsifiable decision outcome contract for governed Avantiqo Intelligence planning.",
      "This tool is planning-only. It never executes business actions, persists records, confirms, approves, publishes, sends, pays, deploys, schedules monitoring, or mutates business state.",
      "Use deliberate for deterministic alternative comparison; recommendations are not execution authority.",
      "Use stress_test for bounded robustness probes. Hypothetical scenarios never become live evidence and verified destabilizing changes require normal replanning and governance.",
      "Use validate_decision before relying on a prior recommendation as current. Stale or unverified dependencies require revalidation and verified changed conditions require replanning.",
      "Use prioritize_uncertainty to rank safety-critical and decision-flipping unknowns before lower-value research; model numeric priority scores are never trusted.",
      "Use assess_readiness only after component cognition is available. Raw model confidence never establishes readiness, and mutating selections can only become ready for governance.",
      "Use build_provenance for exact evidence, assumption, validity, robustness, uncertainty and readiness lineage. Raw model narrative is not provenance and raw chain-of-thought is never required or persisted.",
      "Use assess_contingency only with declared structured failure modes and known provenance invalidation triggers. Material failure modes require detection, recovery, and recovery verification criteria. Known invalidation triggers must be mapped. Irreversible decisions cannot claim rollback recovery. Mutating or irreversible recovery remains subject to current human/operator governance.",
      "Use build_outcome_contract to make the selected recommendation falsifiable before relying on later results. Decision-critical contracts require observable success and failure criteria, exact observation sources, verification criteria and review triggers. High or critical contingency failure modes must map to outcome criteria. Contract readiness is not outcome success and does not schedule monitoring.",
      "Every candidate remains subject to normal Operator governance, including permissions, confirmation, approval, wallet, execution and verification controls; this planning tool cannot bypass any of them.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["build", "assess", "revise", "deliberate", "stress_test", "validate_decision", "prioritize_uncertainty", "assess_readiness", "build_provenance", "assess_contingency", "build_outcome_contract"] },
        goal: { type: "string" },
        brief: { type: "object", additionalProperties: true },
        plan_steps: { type: "array", items: { type: "object", additionalProperties: true } },
        plan: { type: "object", additionalProperties: true },
        observations: { type: "array", items: { type: "object", additionalProperties: true } },
        revised_steps: { type: "array", items: { type: "object", additionalProperties: true } },
        replan_reason: { type: "string" },
        max_replans: { type: "integer", minimum: 0, maximum: 6 },
        candidates: { type: "array", items: { type: "object", additionalProperties: true } },
        evidence: { type: "array", items: { type: "object", additionalProperties: true } },
        uncertainties: { type: "array", items: { type: "object", additionalProperties: true } },
        assumptions: { type: "array", items: { type: "object", additionalProperties: true } },
        failure_modes: { type: "array", items: { type: "object", additionalProperties: true } },
        criteria: { type: "array", items: { type: "object", additionalProperties: true } },
        review_policy: { type: "object", additionalProperties: true },
        decision_critical: { type: "boolean" },
        scenarios: { type: "array", items: { type: "object", additionalProperties: true } },
        decision: { type: "object", additionalProperties: true },
        evidence_dependencies: { type: "array", items: { type: "object", additionalProperties: true } },
        validity_conditions: { type: "array", items: { type: "object", additionalProperties: true } },
        now: { type: "string" },
        deliberation_result: { type: "object", additionalProperties: true },
        robustness_result: { type: "object", additionalProperties: true },
        validity_result: { type: "object", additionalProperties: true },
        uncertainty_priority_result: { type: "object", additionalProperties: true },
        readiness_result: { type: "object", additionalProperties: true },
        provenance_result: { type: "object", additionalProperties: true },
        contingency_result: { type: "object", additionalProperties: true },
        confidence_calibration: { type: "object", additionalProperties: true },
      },
      required: ["operation"],
      additionalProperties: false,
    },
    mutates: false,
    approval_required: false,
    metadata: {
      planning_contract: CONTRACT,
      plan_graph_contract: OperatorIntelligencePlanGraphRuntime.contract,
      evidence_revision_contract: OperatorIntelligenceEvidenceRevisionRuntime.contract,
      recovery_policy_contract: OperatorIntelligenceRecoveryPolicyRuntime.contract,
      deliberative_decision_contract: OperatorIntelligenceDeliberativeDecisionRuntime.contract,
      decision_robustness_contract: OperatorIntelligenceDecisionRobustnessRuntime.contract,
      decision_validity_contract: OperatorIntelligenceDecisionValidityRuntime.contract,
      uncertainty_priority_contract: OperatorIntelligenceUncertaintyPriorityRuntime.contract,
      decision_readiness_contract: OperatorIntelligenceDecisionReadinessRuntime.contract,
      decision_provenance_contract: OperatorIntelligenceDecisionProvenanceRuntime.contract,
      decision_contingency_contract: OperatorIntelligenceDecisionContingencyRuntime.contract,
      decision_outcome_contract: OperatorIntelligenceDecisionOutcomeContractRuntime.contract,
      governed_tool_outcome_contract: OperatorIntelligenceRecoveryPolicyRuntime.governedOutcomeContract,
      planning_only: true,
      executes_business_actions: false,
      schedules_monitoring: false,
      normal_operator_governance_required: true,
      successful_evidence_can_invalidate_plan: true,
      unverified_evidence_cannot_invalidate_plan: true,
      deterministic_bounded_recovery: true,
      deterministic_alternative_comparison: true,
      deterministic_decision_robustness_testing: true,
      deterministic_decision_validity_revalidation: true,
      deterministic_uncertainty_prioritization: true,
      deterministic_decision_readiness_synthesis: true,
      deterministic_structured_decision_provenance: true,
      deterministic_decision_contingency_assessment: true,
      deterministic_falsifiable_outcome_contract: true,
      raw_model_confidence_never_establishes_readiness: true,
      mutating_selection_can_only_be_ready_for_governance: true,
      model_numeric_uncertainty_priority_scores_never_trusted: true,
      low_value_uncertainties_may_be_deferred: true,
      hypothetical_scenarios_never_become_live_evidence: true,
      stale_or_unverified_decision_dependencies_require_revalidation: true,
      verified_changed_decision_conditions_require_replan: true,
      critical_uncertainty_prefers_safe_information_gain: true,
      raw_model_narrative_is_not_provenance: true,
      raw_chain_of_thought_never_required_or_persisted: true,
      single_point_evidence_dependency_is_flagged: true,
      model_freeform_failure_stories_never_establish_contingency_readiness: true,
      model_numeric_failure_probabilities_never_trusted: true,
      material_failure_modes_require_detection_recovery_and_verification: true,
      provenance_invalidation_triggers_must_be_mapped: true,
      irreversible_decisions_cannot_claim_rollback_recovery: true,
      outcome_contract_must_be_falsifiable: true,
      outcome_contract_readiness_is_not_outcome_success: true,
      freeform_model_judgment_is_not_outcome_verification: true,
      recommendations_are_not_execution_authority: true,
      prior_approval_never_substitutes_for_current_governance: true,
      retry_requires_governed_outcome_attestation: true,
      model_failure_codes_never_authorize_retry: true,
      mutating_steps_never_auto_retry: true,
    },
    async execute(args = {}, context = {}) {
      const operation = text(args.operation, 40).toLowerCase();
      const governedToolOutcomes = list(object(context).governed_tool_outcomes);
      if (operation === "build") return buildOperatorIntelligencePlan({ goal: args.goal, brief: object(args.brief), plan_steps: list(args.plan_steps), max_replans: args.max_replans });
      if (operation === "assess") return assessOperatorIntelligencePlanWithRecoveryPolicy({ plan: object(args.plan), observations: list(args.observations), governed_tool_outcomes: governedToolOutcomes });
      if (operation === "revise") return reviseOperatorIntelligencePlanWithRecoveryPolicy({ plan: object(args.plan), revised_steps: list(args.revised_steps), observations: list(args.observations), governed_tool_outcomes: governedToolOutcomes, replan_reason: args.replan_reason });
      if (operation === "deliberate") return deliberateOperatorIntelligenceDecision({ goal: args.goal, candidates: list(args.candidates), evidence: list(args.evidence), uncertainties: list(args.uncertainties), decision_critical: args.decision_critical !== false });
      if (operation === "stress_test") return stressTestOperatorIntelligenceDecision({ goal: args.goal, candidates: list(args.candidates), evidence: list(args.evidence), uncertainties: list(args.uncertainties), decision_critical: args.decision_critical !== false, scenarios: list(args.scenarios) });
      if (operation === "validate_decision") return assessOperatorIntelligenceDecisionValidity({ decision: object(args.decision), evidence_dependencies: list(args.evidence_dependencies), validity_conditions: list(args.validity_conditions), now: args.now });
      if (operation === "prioritize_uncertainty") return prioritizeOperatorIntelligenceUncertainties({ goal: args.goal, uncertainties: list(args.uncertainties) });
      if (operation === "assess_readiness") return assessOperatorIntelligenceDecisionReadiness({ deliberation: object(args.deliberation_result), robustness: object(args.robustness_result), validity: object(args.validity_result), uncertainty_priority: object(args.uncertainty_priority_result), confidence_calibration: object(args.confidence_calibration), decision_critical: args.decision_critical !== false });
      if (operation === "build_provenance") return buildOperatorIntelligenceDecisionProvenance({ deliberation: object(args.deliberation_result), candidates: list(args.candidates), evidence: list(args.evidence), assumptions: list(args.assumptions), robustness: object(args.robustness_result), scenarios: list(args.scenarios), validity: object(args.validity_result), uncertainty_priority: object(args.uncertainty_priority_result), readiness: object(args.readiness_result) });
      if (operation === "assess_contingency") return assessOperatorIntelligenceDecisionContingency({ decision: object(args.decision), provenance: object(args.provenance_result), failure_modes: list(args.failure_modes), decision_critical: args.decision_critical !== false });
      if (operation === "build_outcome_contract") return buildOperatorIntelligenceDecisionOutcomeContract({ decision: object(args.decision), criteria: list(args.criteria), review_policy: object(args.review_policy), provenance: object(args.provenance_result), contingency: object(args.contingency_result), decision_critical: args.decision_critical !== false });
      throw new Error("OPERATOR_INTELLIGENCE_PLAN_GRAPH_OPERATION_REQUIRED");
    },
  };
}

export async function createOperatorIntelligencePlanningTools(options = {}) {
  const [readTools, actionTools] = await Promise.all([
    OperatorIntelligenceToolBridgeRuntime.createReadTools(options).catch(() => []),
    OperatorIntelligenceActionCandidateRuntime.createTools(options).catch(() => []),
  ]);
  return [createPlanGraphTool(), ...readTools, ...actionTools];
}

export const OperatorIntelligencePlanningToolRuntime = Object.freeze({
  contract: CONTRACT,
  planGraphContract: OperatorIntelligencePlanGraphRuntime.contract,
  evidenceRevisionContract: OperatorIntelligenceEvidenceRevisionRuntime.contract,
  recoveryPolicyContract: OperatorIntelligenceRecoveryPolicyRuntime.contract,
  deliberativeDecisionContract: OperatorIntelligenceDeliberativeDecisionRuntime.contract,
  decisionRobustnessContract: OperatorIntelligenceDecisionRobustnessRuntime.contract,
  decisionValidityContract: OperatorIntelligenceDecisionValidityRuntime.contract,
  uncertaintyPriorityContract: OperatorIntelligenceUncertaintyPriorityRuntime.contract,
  decisionReadinessContract: OperatorIntelligenceDecisionReadinessRuntime.contract,
  decisionProvenanceContract: OperatorIntelligenceDecisionProvenanceRuntime.contract,
  decisionContingencyContract: OperatorIntelligenceDecisionContingencyRuntime.contract,
  decisionOutcomeContract: OperatorIntelligenceDecisionOutcomeContractRuntime.contract,
  governedToolOutcomeContract: OperatorIntelligenceRecoveryPolicyRuntime.governedOutcomeContract,
  createTools: createOperatorIntelligencePlanningTools,
  buildPlan: buildOperatorIntelligencePlan,
  assessPlan: assessOperatorIntelligencePlanWithRecoveryPolicy,
  revisePlan: reviseOperatorIntelligencePlanWithRecoveryPolicy,
  deliberate: deliberateOperatorIntelligenceDecision,
  stressTestDecision: stressTestOperatorIntelligenceDecision,
  assessDecisionValidity: assessOperatorIntelligenceDecisionValidity,
  prioritizeUncertainties: prioritizeOperatorIntelligenceUncertainties,
  assessDecisionReadiness: assessOperatorIntelligenceDecisionReadiness,
  buildDecisionProvenance: buildOperatorIntelligenceDecisionProvenance,
  assessDecisionContingency: assessOperatorIntelligenceDecisionContingency,
  buildDecisionOutcomeContract: buildOperatorIntelligenceDecisionOutcomeContract,
});
