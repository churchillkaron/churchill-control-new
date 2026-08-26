import { buildOperatorIntelligencePlan } from "./OperatorIntelligencePlanGraphRuntime.js";

export const OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT =
  "AVANTIQO_OPERATOR_OWNED_COGNITIVE_PLAN_V1";

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

function compactIssue(issue = {}) {
  const source = object(issue);
  return {
    code: text(source.code, 180) || "UNKNOWN_PLAN_ISSUE",
    step_id: text(source.step_id, 120) || null,
    dependency: text(source.dependency, 120) || null,
    missing_required_fields: list(source.missing_required_fields)
      .map((item) => text(item, 160))
      .filter(Boolean)
      .slice(0, 20),
  };
}

function compactPlan(plan = {}) {
  const source = object(plan);
  return {
    contract: source.contract || null,
    plan_id: source.plan_id || null,
    revision: Number(source.revision || 0),
    valid: source.valid === true,
    goal: text(source.goal, 1200) || null,
    execution_order: list(source.execution_order).slice(0, 18),
    completion_criteria: list(source.completion_criteria).slice(0, 12),
    issues: list(source.issues).map(compactIssue).slice(0, 24),
    steps: list(source.steps).slice(0, 18).map((step) => ({
      id: text(step?.id, 120) || null,
      title: text(step?.title, 500) || null,
      kind: text(step?.kind, 80) || null,
      depends_on: list(step?.depends_on).slice(0, 8),
      capability_key: text(step?.capability_key, 300) || null,
      mutates: step?.mutates === true,
      risk: text(step?.risk, 40) || null,
      irreversible: step?.irreversible === true,
      requires_confirmation: step?.requires_confirmation === true,
      candidate_validation: object(step?.candidate_validation),
      evidence_needed: list(step?.evidence_needed).slice(0, 10),
      expected_output: text(step?.expected_output, 800) || null,
      verification: object(step?.verification),
      rollback: object(step?.rollback),
      retry_budget: Number(step?.retry_budget || 0),
    })),
    budgets: object(source.budgets),
    governance: object(source.governance),
  };
}

export function compileOwnedCognitivePlan(brief = {}) {
  const source = object(brief);
  const goal = text(source.goal || source.interpretation, 1200);
  const proposedSteps = list(source.plan_steps).slice(0, 18);

  if (!goal) {
    return {
      contract: OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
      status: "PLAN_REJECTED_GOAL_REQUIRED",
      planning_complete: false,
      execution_guidance_allowed: false,
      governed_plan: null,
      issues: [{ code: "COGNITIVE_PLAN_GOAL_REQUIRED" }],
      governance: {
        planning_only: true,
        execution_authority: "NONE",
        invalid_plan_blocks_execution_guidance: true,
        memory_never_authorizes_writes: true,
        raw_reasoning_persisted: false,
      },
    };
  }

  if (!proposedSteps.length) {
    return {
      contract: OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
      status: "PLAN_NOT_MATERIALIZED",
      planning_complete: false,
      execution_guidance_allowed: false,
      governed_plan: null,
      issues: [{ code: "COGNITIVE_PLAN_STEPS_REQUIRED" }],
      governance: {
        planning_only: true,
        execution_authority: "NONE",
        invalid_plan_blocks_execution_guidance: true,
        memory_never_authorizes_writes: true,
        raw_reasoning_persisted: false,
      },
    };
  }

  const plan = buildOperatorIntelligencePlan({
    goal,
    brief: source,
    plan_steps: proposedSteps,
    max_replans: source.max_replans,
  });
  const governedPlan = compactPlan(plan);
  const valid = governedPlan.valid === true && governedPlan.steps.length > 0;

  return {
    contract: OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
    status: valid ? "PLAN_VALIDATED" : "PLAN_REJECTED_INVALID_GRAPH",
    planning_complete: valid,
    execution_guidance_allowed: valid,
    governed_plan: governedPlan,
    issues: governedPlan.issues,
    governance: {
      planning_only: true,
      execution_authority: "NONE",
      candidate_validation_is_not_authorization: true,
      normal_operator_governance_required: true,
      invalid_plan_blocks_execution_guidance: true,
      completion_claim_requires_plan_verification: true,
      memory_never_authorizes_writes: true,
      raw_reasoning_persisted: false,
    },
  };
}

export function attachOwnedCognitivePlan(brief = {}) {
  const source = object(brief);
  const cognitivePlan = compileOwnedCognitivePlan(source);
  return {
    ...source,
    plan_steps: undefined,
    cognitive_plan: cognitivePlan,
    governed_plan: cognitivePlan.governed_plan,
    planning_complete: cognitivePlan.planning_complete,
    execution_guidance_allowed: cognitivePlan.execution_guidance_allowed,
  };
}

export const OperatorOwnedCognitivePlanRuntime = Object.freeze({
  contract: OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
  compile: compileOwnedCognitivePlan,
  attach: attachOwnedCognitivePlan,
});
