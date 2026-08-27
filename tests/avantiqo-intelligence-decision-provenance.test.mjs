import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildOperatorIntelligenceDecisionProvenance,
  OPERATOR_INTELLIGENCE_DECISION_PROVENANCE_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceDecisionProvenanceRuntime.js";

function deliberation(overrides = {}) {
  return {
    status: "SELECTED_FOR_PLANNING",
    rationale_code: "BEST_FEASIBLE_OPTION_BY_SAFETY_EVIDENCE_PROGRESS_COST",
    selected_candidate: { id: "option-a" },
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    id: "option-a",
    title: "Option A",
    kind: "recommendation",
    evidence_ids: ["ev-1", "ev-2"],
    unknown_dependencies: [],
    ...overrides,
  };
}

function evidence(id, overrides = {}) {
  return { id, trusted: true, current: true, source_class: "verified_read", ...overrides };
}

function validity(overrides = {}) {
  return {
    status: "VALID_WITHIN_POLICY",
    decision_valid_now: true,
    evidence_dependencies: [
      { id: "ev-1", required: true, verified: true, current: true, valid: true, issues: [] },
      { id: "ev-2", required: true, verified: true, current: true, valid: true, issues: [] },
    ],
    validity_conditions: [
      { id: "condition-a", required: true, verified: true, status: "satisfied", valid: true, issues: [] },
    ],
    ...overrides,
  };
}

function readiness(overrides = {}) {
  return { status: "READY_FOR_RECOMMENDATION", decision_ready: true, gates: [], ...overrides };
}

test("provenance exposes canonical structured lineage without chain of thought or execution authority", () => {
  const result = buildOperatorIntelligenceDecisionProvenance({
    deliberation: deliberation(),
    candidates: [candidate()],
    evidence: [evidence("ev-1"), evidence("ev-2")],
    validity: validity(),
    uncertainty_priority: { status: "NO_UNRESOLVED_UNCERTAINTY", actionable_count: 0 },
    readiness: readiness(),
  });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_DECISION_PROVENANCE_CONTRACT);
  assert.equal(result.status, "PROVENANCE_COMPLETE");
  assert.deepEqual(result.trusted_current_support_ids, ["ev-1", "ev-2"]);
  assert.equal(result.provenance_policy.raw_chain_of_thought_is_never_required_or_persisted, true);
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
});

test("single trusted support is explicitly flagged as evidence fragility", () => {
  const result = buildOperatorIntelligenceDecisionProvenance({
    deliberation: deliberation(),
    candidates: [candidate({ evidence_ids: ["ev-1"] })],
    evidence: [evidence("ev-1")],
    validity: validity({ evidence_dependencies: [{ id: "ev-1", required: true, verified: true, current: true, valid: true, issues: [] }] }),
    uncertainty_priority: { status: "NO_UNRESOLVED_UNCERTAINTY" },
    readiness: readiness(),
  });
  assert.equal(result.status, "SINGLE_POINT_EVIDENCE_DEPENDENCY");
  assert.equal(result.single_point_evidence_dependency, true);
});

test("missing or untrusted referenced evidence creates provenance gaps", () => {
  const result = buildOperatorIntelligenceDecisionProvenance({
    deliberation: deliberation(),
    candidates: [candidate()],
    evidence: [evidence("ev-1", { trusted: false })],
    validity: validity(),
    uncertainty_priority: { status: "NO_UNRESOLVED_UNCERTAINTY" },
    readiness: readiness(),
  });
  assert.equal(result.status, "PROVENANCE_GAPS");
  assert.ok(result.provenance_gaps.includes("REFERENCED_EVIDENCE_MISSING"));
  assert.ok(result.provenance_gaps.includes("REFERENCED_EVIDENCE_NOT_TRUSTED_CURRENT"));
});

test("unresolved assumption dependency is explicit and blocks complete provenance", () => {
  const result = buildOperatorIntelligenceDecisionProvenance({
    deliberation: deliberation(),
    candidates: [candidate({ unknown_dependencies: ["assumption-demand"] })],
    evidence: [evidence("ev-1"), evidence("ev-2")],
    assumptions: [{ id: "assumption-demand", critical: true, resolved: false, evidence_ids: ["ev-1"] }],
    validity: validity(),
    uncertainty_priority: { status: "NO_UNRESOLVED_UNCERTAINTY" },
    readiness: readiness(),
  });
  assert.equal(result.status, "PROVENANCE_GAPS");
  assert.ok(result.provenance_gaps.includes("ASSUMPTION_DEPENDENCY_UNRESOLVED"));
  assert.ok(result.invalidation_triggers.some((row) => row.type === "ASSUMPTION_UNRESOLVED"));
});

test("changed robustness scenario becomes a structured invalidation boundary", () => {
  const result = buildOperatorIntelligenceDecisionProvenance({
    deliberation: deliberation(),
    candidates: [candidate()],
    evidence: [evidence("ev-1"), evidence("ev-2")],
    robustness: {
      status: "SENSITIVE_TO_PLAUSIBLE_CHANGE",
      scenario_results: [
        { id: "cost-shock", kind: "plausible", material: true, changed_from_baseline: true, selection: { candidate_id: "option-b" } },
      ],
    },
    scenarios: [
      { id: "cost-shock", candidate_overrides: [{ candidate_id: "option-a", overrides: { cost: "high" } }], evidence_remove_ids: ["ev-2"] },
    ],
    validity: validity(),
    uncertainty_priority: { status: "NO_UNRESOLVED_UNCERTAINTY" },
    readiness: readiness({ decision_ready: false, status: "RESEARCH_FIRST" }),
  });
  const trigger = result.invalidation_triggers.find((row) => row.id === "cost-shock");
  assert.equal(trigger?.type, "SCENARIO_SENSITIVITY");
  assert.ok(trigger?.reasons.includes("SELECTED_CANDIDATE_COST_CHANGED"));
  assert.ok(trigger?.reasons.includes("EVIDENCE_ev-2_REMOVED"));
});

test("invalid validity dependency becomes an explicit provenance invalidation trigger", () => {
  const result = buildOperatorIntelligenceDecisionProvenance({
    deliberation: deliberation(),
    candidates: [candidate()],
    evidence: [evidence("ev-1"), evidence("ev-2")],
    validity: validity({
      status: "REVALIDATION_REQUIRED",
      decision_valid_now: false,
      evidence_dependencies: [{ id: "ev-1", required: true, verified: true, current: false, valid: false, issues: ["DEPENDENCY_STALE"] }],
    }),
    uncertainty_priority: { status: "NO_UNRESOLVED_UNCERTAINTY" },
    readiness: readiness({ decision_ready: false, status: "REVALIDATION_REQUIRED" }),
  });
  assert.ok(result.invalidation_triggers.some((row) => row.type === "EVIDENCE_DEPENDENCY_INVALID" && row.id === "ev-1"));
});

test("planning tool exposes structured provenance without gaining execution authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V11/);
  assert.match(source, /"build_provenance"/);
  assert.match(source, /decision_provenance_contract/);
  assert.match(source, /deterministic_structured_decision_provenance/);
  assert.match(source, /raw_chain_of_thought_never_required_or_persisted/);
  assert.match(source, /executes_business_actions: false/);
});
