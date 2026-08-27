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

const CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V3";
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
      "Build, assess, boundedly revise, or deliberatively compare alternatives for a governed Avantiqo Intelligence plan graph.",
      "This tool is planning-only. It never executes business actions, persists records, confirms, approves, publishes, sends, pays, deploys, or mutates business state.",
      "Use build to convert a goal into an explicit dependency graph with evidence needs, candidate actions, verification criteria, rollback/recovery metadata and retry budgets.",
      "Use deliberate when a decision materially benefits from comparing multiple feasible alternatives. Deliberation rejects constraint-violating options, counts only trusted current evidence as support, prefers safe information gathering when critical uncertainty remains, and otherwise ranks feasible choices by risk, reversibility, trusted evidence, goal progress, cost and latency. A selected recommendation is never execution authority.",
      "Any mutating step must reference an exact registered capability and include the result of operator_action_candidate validation; candidate validation is never execution authority.",
      "Every candidate remains subject to normal Operator governance, including permissions, confirmation, approval, wallet, execution and verification controls; this planning tool cannot bypass any of them.",
      "Use assess after observed step outcomes to determine ready work, deterministic bounded retry eligibility, failed dependencies, verification proof gaps, verified evidence that invalidates assumptions, replan need and whether completion is actually proven.",
      "Retry is allowed only when a prior governed tool outcome attests a known transient failure for the exact tool_call_id and exact step capability_key, on a non-mutating step, while the explicit retry budget remains. Model-provided failure codes never authorize retry. Blocked, missing, mismatched, unknown, governance, validation and mutating failures are never auto-retried.",
      "Use revise after a non-retryable failure, blocker, exhausted retry budget, or verified observation that contradicts, invalidates, or materially changes the active plan. Replanning is bounded and cannot delete or rewrite completed history.",
      "For a successful evidence/read/research observation that changes the active plan, set plan_impact to contradicts, invalidates, or material_change and include contradictions, invalidated_assumptions, or requires_replan as applicable.",
      "Unverified evidence cannot invalidate the plan, and dependencies whose required verification is not proven cannot release downstream work.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["build", "assess", "revise", "deliberate"],
        },
        goal: { type: "string" },
        brief: { type: "object", additionalProperties: true },
        plan_steps: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        plan: { type: "object", additionalProperties: true },
        observations: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        revised_steps: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        replan_reason: { type: "string" },
        max_replans: { type: "integer", minimum: 0, maximum: 6 },
        candidates: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        evidence: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        uncertainties: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        decision_critical: { type: "boolean" },
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
      governed_tool_outcome_contract: OperatorIntelligenceRecoveryPolicyRuntime.governedOutcomeContract,
      planning_only: true,
      executes_business_actions: false,
      normal_operator_governance_required: true,
      successful_evidence_can_invalidate_plan: true,
      unverified_evidence_cannot_invalidate_plan: true,
      deterministic_bounded_recovery: true,
      deterministic_alternative_comparison: true,
      critical_uncertainty_prefers_safe_information_gain: true,
      recommendations_are_not_execution_authority: true,
      retry_requires_governed_outcome_attestation: true,
      model_failure_codes_never_authorize_retry: true,
      mutating_steps_never_auto_retry: true,
    },
    async execute(args = {}, context = {}) {
      const operation = text(args.operation, 40).toLowerCase();
      const governedToolOutcomes = list(object(context).governed_tool_outcomes);
      if (operation === "build") {
        return buildOperatorIntelligencePlan({
          goal: args.goal,
          brief: object(args.brief),
          plan_steps: list(args.plan_steps),
          max_replans: args.max_replans,
        });
      }
      if (operation === "assess") {
        return assessOperatorIntelligencePlanWithRecoveryPolicy({
          plan: object(args.plan),
          observations: list(args.observations),
          governed_tool_outcomes: governedToolOutcomes,
        });
      }
      if (operation === "revise") {
        return reviseOperatorIntelligencePlanWithRecoveryPolicy({
          plan: object(args.plan),
          revised_steps: list(args.revised_steps),
          observations: list(args.observations),
          governed_tool_outcomes: governedToolOutcomes,
          replan_reason: args.replan_reason,
        });
      }
      if (operation === "deliberate") {
        return deliberateOperatorIntelligenceDecision({
          goal: args.goal,
          candidates: list(args.candidates),
          evidence: list(args.evidence),
          uncertainties: list(args.uncertainties),
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
  governedToolOutcomeContract: OperatorIntelligenceRecoveryPolicyRuntime.governedOutcomeContract,
  createTools: createOperatorIntelligencePlanningTools,
  buildPlan: buildOperatorIntelligencePlan,
  assessPlan: assessOperatorIntelligencePlanWithRecoveryPolicy,
  revisePlan: reviseOperatorIntelligencePlanWithRecoveryPolicy,
  deliberate: deliberateOperatorIntelligenceDecision,
});
