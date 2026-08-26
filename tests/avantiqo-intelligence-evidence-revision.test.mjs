import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperatorIntelligencePlan,
} from "../lib/operator/runtime/OperatorIntelligencePlanGraphRuntime.js";
import {
  OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_CONTRACT,
  assessOperatorIntelligencePlanWithEvidenceRevision,
  reviseOperatorIntelligencePlanWithEvidenceRevision,
} from "../lib/operator/runtime/OperatorIntelligenceEvidenceRevisionRuntime.js";

function evidenceStep(overrides = {}) {
  return {
    id: "research-current-mechanism",
    title: "Research the current mechanism",
    kind: "research",
    depends_on: [],
    mutates: false,
    verification: {
      required: true,
      criteria: ["Evidence is current and independently verified."],
    },
    ...overrides,
  };
}

function analysisStep(overrides = {}) {
  return {
    id: "analyze-mechanism",
    title: "Analyze the mechanism",
    kind: "analysis",
    depends_on: ["research-current-mechanism"],
    mutates: false,
    verification: {
      required: false,
      criteria: [],
    },
    ...overrides,
  };
}

function decisionStep(overrides = {}) {
  return {
    id: "choose-direction",
    title: "Choose the best direction",
    kind: "decision",
    depends_on: ["analyze-mechanism"],
    mutates: false,
    verification: {
      required: false,
      criteria: [],
    },
    ...overrides,
  };
}

function buildPlan(overrides = {}) {
  return buildOperatorIntelligencePlan({
    goal: "Understand the mechanism and choose a reliable solution",
    max_replans: 3,
    plan_steps: [evidenceStep(), analysisStep(), decisionStep()],
    ...overrides,
  });
}

function verifiedInvalidatingEvidence(overrides = {}) {
  return {
    step_id: "research-current-mechanism",
    status: "verified",
    verification_status: "pass",
    evidence: ["Current primary evidence disproves the original operating assumption."],
    plan_impact: "contradicts",
    contradictions: ["The assumed mechanism is not active in the current system."],
    invalidated_assumptions: ["The original plan assumed the legacy mechanism remained active."],
    revision_reason: "Verified current evidence invalidated the original mechanism assumption.",
    ...overrides,
  };
}

test("evidence revision runtime exposes its canonical contract", () => {
  assert.equal(
    OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_CONTRACT,
    "AVANTIQO_OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_V1",
  );
});

test("verified successful contradictory evidence forces replan and suppresses stale downstream work", () => {
  const assessment = assessOperatorIntelligencePlanWithEvidenceRevision({
    plan: buildPlan(),
    observations: [verifiedInvalidatingEvidence()],
  });

  assert.equal(assessment.status, "REPLAN_REQUIRED");
  assert.equal(assessment.requires_replan, true);
  assert.deepEqual(assessment.ready_step_ids, []);
  assert.deepEqual(assessment.stale_ready_step_ids, ["analyze-mechanism"]);
  assert.equal(assessment.plan_invalidations.length, 1);
  assert.equal(assessment.plan_invalidations[0].plan_impact, "contradicts");
  assert.ok(assessment.replan_triggers.includes("plan_invalidating_evidence"));
  assert.equal(assessment.governance.successful_evidence_can_invalidate_plan, true);
});

test("unverified contradictory evidence cannot invalidate the active plan", () => {
  const assessment = assessOperatorIntelligencePlanWithEvidenceRevision({
    plan: buildPlan(),
    observations: [verifiedInvalidatingEvidence({
      status: "completed",
      verification_status: "unknown",
    })],
  });

  assert.equal(assessment.plan_invalidations.length, 0);
  assert.equal(assessment.requires_replan, false);
  assert.deepEqual(assessment.ready_step_ids, []);
  assert.equal(assessment.verification_blocked_steps[0]?.step_id, "analyze-mechanism");
  assert.equal(
    assessment.verification_blocked_steps[0]?.reason,
    "DEPENDENCY_VERIFICATION_NOT_PROVEN",
  );
  assert.equal(assessment.governance.unverified_evidence_cannot_invalidate_plan, true);
});

test("completed but unverified dependency cannot release downstream reasoning", () => {
  const assessment = assessOperatorIntelligencePlanWithEvidenceRevision({
    plan: buildPlan(),
    observations: [{
      step_id: "research-current-mechanism",
      status: "completed",
      verification_status: "unknown",
      evidence: ["A result was returned but has not been verified."],
    }],
  });

  assert.deepEqual(assessment.ready_step_ids, []);
  assert.deepEqual(assessment.stale_ready_step_ids, []);
  assert.deepEqual(
    assessment.verification_blocked_steps[0]?.dependencies,
    ["research-current-mechanism"],
  );
});

test("evidence-driven replan preserves verified history and adopts an alternative path", () => {
  const plan = buildPlan();
  const observations = [verifiedInvalidatingEvidence()];
  const alternativeAnalysis = analysisStep({
    id: "analyze-alternative-mechanism",
    title: "Analyze the alternative mechanism supported by current evidence",
    depends_on: ["research-current-mechanism"],
  });
  const alternativeDecision = decisionStep({
    depends_on: ["analyze-alternative-mechanism"],
  });

  const revision = reviseOperatorIntelligencePlanWithEvidenceRevision({
    plan,
    observations,
    revised_steps: [
      evidenceStep(),
      alternativeAnalysis,
      alternativeDecision,
    ],
  });

  assert.equal(revision.status, "REPLAN_ACCEPTED");
  assert.equal(revision.evidence_driven_replan, true);
  assert.equal(revision.blocked, false);
  assert.equal(revision.plan.revision, 1);
  assert.equal(revision.plan.parent_plan_id, plan.plan_id);
  assert.deepEqual(revision.preserved_completed_step_ids, ["research-current-mechanism"]);
  assert.ok(revision.plan.execution_order.includes("analyze-alternative-mechanism"));
  assert.match(revision.plan.replan_reason, /invalidated/i);
});

test("evidence-driven replan cannot rewrite completed verified history", () => {
  const plan = buildPlan();
  const revision = reviseOperatorIntelligencePlanWithEvidenceRevision({
    plan,
    observations: [verifiedInvalidatingEvidence()],
    revised_steps: [
      evidenceStep({ title: "Rewrite the completed research step" }),
      analysisStep({ id: "alternative-analysis" }),
    ],
  });

  assert.equal(revision.status, "REPLAN_REJECTED_COMPLETED_HISTORY_MUTATION");
  assert.equal(revision.blocked, true);
  assert.ok(
    revision.issues.some(
      (issue) => issue.code === "COMPLETED_STEP_REWRITTEN_DURING_EVIDENCE_REPLAN",
    ),
  );
});

test("evidence-driven replanning remains bounded by the plan replan budget", () => {
  const plan = buildPlan({
    revision: 1,
    max_replans: 1,
  });
  const revision = reviseOperatorIntelligencePlanWithEvidenceRevision({
    plan,
    observations: [verifiedInvalidatingEvidence()],
    revised_steps: [evidenceStep(), analysisStep({ id: "new-analysis" })],
  });

  assert.equal(revision.status, "REPLAN_BUDGET_EXHAUSTED");
  assert.equal(revision.blocked, true);
  assert.equal(revision.evidence_driven_replan, true);
});
