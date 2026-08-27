import { OperatorIntelligenceToolBridgeRuntime } from "./OperatorIntelligenceToolBridgeRuntime";
import { OperatorIntelligenceActionCandidateRuntime } from "./OperatorIntelligenceActionCandidateRuntime";
import {
  OperatorIntelligencePlanGraphRuntime,
  buildOperatorIntelligencePlan,
} from "./OperatorIntelligencePlanGraphRuntime";
import {
  OperatorIntelligenceEvidenceRevisionRuntime,
} from "./OperatorIntelligenceEvidenceRevisionRuntime";
import {
  OperatorIntelligenceRecoveryPolicyRuntime,
  assessOperatorIntelligencePlanWithRecoveryPolicy,
  reviseOperatorIntelligencePlanWithRecoveryPolicy,
} from "./OperatorIntelligenceRecoveryPolicyRuntime.js";
import {
  OperatorIntelligenceDeliberativeDecisionRuntime,
  deliberateOperatorIntelligenceDecision,
} from "./OperatorIntelligenceDeliberativeDecisionRuntime.js";
import {
  OperatorIntelligenceDecisionRobustnessRuntime,
  stressTestOperatorIntelligenceDecision,
} from "./OperatorIntelligenceDecisionRobustnessRuntime.js";
import {
  OperatorIntelligenceDecisionValidityRuntime,
  assessOperatorIntelligenceDecisionValidity,
} from "./OperatorIntelligenceDecisionValidityRuntime.js";
import {
  OperatorIntelligenceUncertaintyPriorityRuntime,
  prioritizeOperatorIntelligenceUncertainties,
} from "./OperatorIntelligenceUncertaintyPriorityRuntime.js";
import {
  OperatorIntelligenceDecisionReadinessRuntime,
  assessOperatorIntelligenceDecisionReadiness,
} from "./OperatorIntelligenceDecisionReadinessRuntime.js";

const CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V7";
const PLAN_TOOL_NAME = "operator_plan_graph";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function createPlanGraphTool() {
  return {
    name: PLAN_TOOL_NAME,
    description: [
      "Build, assess, boundedly revise, deliberatively compare alternatives, stress-test decision robustness, assess decision validity over time, prioritize unresolved uncertainty, or synthesize decision readiness for a governed Avantiqo Intelligence plan graph.",
      "This tool is planning-only. It never executes business actions, persists records, confirms, approves, publishes, sends, pays, deploys, or mutates business state.",
      "Use build to convert a goal into an explicit dependency graph with evidence needs, candidate actions, verification criteria, rollback/recovery metadata and retry budgets.",
      "Use deliberate when a decision materially benefits from comparing multiple feasible alternatives. Deliberation rejects constraint-violating options, counts only trusted current evidence as support, prefers safe information gathering when critical uncertainty remains, and otherwise ranks feasible choices by risk, reversibility, trusted evidence, goal progress, cost and latency. A selected recommendation is never execution authority.",
      "Use stress_test after deliberation when a material decision should be checked for brittleness. Hypothetical scenarios are planning probes only and never become live evidence. Verified scenario changes that destabilize the decision require normal evidence-aware replanning and governance.",
      "Use validate_decision before relying on a prior recommendation as current. Stale, unverified, unknown-volatility, superseded, or future-dated dependencies require revalidation; a verified changed condition requires replanning. Decision validity never authorizes execution and prior approval never substitutes for current governance.",
      "Use prioritize_uncertainty when several unresolved questions compete for attention. Safety-critical and decision-flipping unknowns come first, then governance/completion blockers, decision impact, information gain, resolvability, lower cost and lower latency. Model numeric priority scores never decide the order.",
      "Use assess_readiness only after the component decisions are available. A decision-critical recommendation is ready only when deliberation selected a real candidate, robustness is proven, current validity passes, higher-value uncertainty is resolved or safely deferred, and deterministic confidence calibration meets the required band. A mutating recommendation can only become ready for normal human/operator governance, never ready for automatic execution.",
      "Any mutating step must reference an exact registered capability and include the result of operator_action_candidate validation; candidate validation is never execution authority.",
      "Every candidate remains subject to normal Operator governance, including permissions, confirmation, approval, wallet, execution and verification controls; this planning tool cannot bypass any of them.",
      "Use assess after observed step outcomes to determine ready work, deterministic bounded retry eligibility, failed dependencies, verification proof gaps, verified evidence that invalidates assumptions, replan need and whether completion is actually proven.",
      "Retry is allowed only when a prior governed tool outcome attests a known transient failure for the exact tool_call_id and exact step capability_key, on a non-mutating step, while the explicit retry budget remains. Model-provided failure codes never authorize retry.",
      "Use revise after a non-retryable failure, blocker, exhausted retry budget, or verified observation that contradicts, invalidates, or materially changes the active plan. Replanning is bounded and cannot delete or rewrite completed history.",
      "Unverified evidence cannot invalidate the plan, and dependencies whose required verification is not proven cannot release downstream work.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["build", "assess", "revise", "deliberate", "stress_test", "validate_decision", "prioritize_uncertainty", "assess_readiness"],
        },
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
      governed_tool_outcome_contract: OperatorIntelligenceRecoveryPolicyRuntime.governedOutcomeContract,
      planning_only: true,
      executes_business_actions: false,
      normal_operator_governance_required: true,
      successful_evidence_can_invalidate_plan: true,
      unverified_evidence_cannot_invalidate_plan: true,
      deterministic_bounded_recovery: true,
      deterministic_alternative_comparison: true,
      deterministic_decision_robustness_testing: true,
      deterministic_decision_validity_revalidation: true,
      deterministic_uncertainty_prioritization: true,
      deterministic_decision_readiness_synthesis: true,
      raw_model_confidence_never_establishes_readiness: true,
      mutating_selection_can_only_be_ready_for_governance: true,
      model_numeric_uncertainty_priority_scores_never_trusted: true,
      low_value_uncertainties_may_be_deferred: true,
      hypothetical_scenarios_never_become_live_evidence: true,
      stale_or_unverified_decision_dependencies_require_revalidation: true,
      verified_changed_decision_conditions_require_replan: true,
      critical_uncertainty_prefers_safe_information_gain: true,
      recommendations_are_not_execution_authority: true,
      prior_approval_never_substitutes_for_current_governance: true,
      retry_requires_governed_outcome_attestation: true,
      model_failure_codes_never_authorize_retry: true,
      mutating_steps_never_auto_retry: true,
    },
    async execute(args = {}, context = {}) {
      const operation = text(args.operation, 40).toLowerCase();
      const governedToolOutcomes = list(object(context).governed_tool_outcomes);
      if (operation === "build") {
        return buildOperatorIntelligencePlan({ goal: args.goal, brief: object(args.brief), plan_steps: list(args.plan_steps), max_replans: args.max_replans });
      }
      if (operation === "assess") {
        return assessOperatorIntelligencePlanWithRecoveryPolicy({ plan: object(args.plan), observations: list(args.observations), governed_tool_outcomes: governedToolOutcomes });
      }
      if (operation === "revise") {
        return reviseOperatorIntelligencePlanWithRecoveryPolicy({ plan: object(args.plan), revised_steps: list(args.revised_steps), observations: list(args.observations), governed_tool_outcomes: governedToolOutcomes, replan_reason: args.replan_reason });
      }
      if (operation === "deliberate") {
        return deliberateOperatorIntelligenceDecision({ goal: args.goal, candidates: list(args.candidates), evidence: list(args.evidence), uncertainties: list(args.uncertainties), decision_critical: args.decision_critical !== false });
      }
      if (operation === "stress_test") {
        return stressTestOperatorIntelligenceDecision({ goal: args.goal, candidates: list(args.candidates), evidence: list(args.evidence), uncertainties: list(args.uncertainties), decision_critical: args.decision_critical !== false, scenarios: list(args.scenarios) });
      }
      if (operation === "validate_decision") {
        return assessOperatorIntelligenceDecisionValidity({ decision: object(args.decision), evidence_dependencies: list(args.evidence_dependencies), validity_conditions: list(args.validity_conditions), now: args.now });
      }
      if (operation === "prioritize_uncertainty") {
        return prioritizeOperatorIntelligenceUncertainties({ goal: args.goal, uncertainties: list(args.uncertainties) });
      }
      if (operation === "assess_readiness") {
        return assessOperatorIntelligenceDecisionReadiness({
          deliberation: object(args.deliberation_result),
          robustness: object(args.robustness_result),
          validity: object(args.validity_result),
          uncertainty_priority: object(args.uncertainty_priority_result),
          confidence_calibration: object(args.confidence_calibration),
          decision_critical: args.decision_critical !== false,
        });
      }
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
});
