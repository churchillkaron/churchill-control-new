import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  deliberateOperatorIntelligenceDecision,
  OPERATOR_INTELLIGENCE_DELIBERATIVE_DECISION_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceDeliberativeDecisionRuntime.js";

function safeEvidence(overrides = {}) { return { id: "ev-current", trusted: true, current: true, ...overrides }; }
function safeReadCandidate(overrides = {}) { return { id: "read-more", title: "Read current evidence", kind: "read", mutates: false, risk: "low", cost: "low", latency: "short", goal_progress: "medium", information_gain: "high", ...overrides }; }
function reversibleAction(overrides = {}) {
  return { id: "reversible-action", title: "Apply reversible action", kind: "action", capability_key: "example.change", mutates: true, reversible: true, risk: "medium", cost: "medium", latency: "short", goal_progress: "high", information_gain: "none", evidence_ids: ["ev-current"], candidate_validation: { validated: true, payload_complete: true }, verification: { required: true, criteria: ["Current state proves the intended result."] }, ...overrides };
}

test("critical unresolved uncertainty prefers safe information gain before action", () => {
  const result = deliberateOperatorIntelligenceDecision({ goal: "Choose safely", candidates: [reversibleAction(), safeReadCandidate()], evidence: [safeEvidence()], uncertainties: [{ id: "unknown-demand", critical: true, resolved: false }] });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_DELIBERATIVE_DECISION_CONTRACT);
  assert.equal(result.status, "EVIDENCE_FIRST");
  assert.equal(result.selected_candidate?.id, "read-more");
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
});

test("constraint violating alternatives are never selected", () => {
  const result = deliberateOperatorIntelligenceDecision({ goal: "Choose a compliant option", candidates: [reversibleAction({ id: "violating-action", goal_progress: "decisive", constraint_violations: ["Exceeds approved budget"] }), { id: "safe-recommendation", title: "Use compliant path", kind: "recommendation", risk: "low", reversible: true, cost: "low", latency: "short", goal_progress: "medium", evidence_ids: ["ev-current"] }], evidence: [safeEvidence()] });
  assert.equal(result.selected_candidate?.id, "safe-recommendation");
  const violating = result.candidates.find((candidate) => candidate.id === "violating-action");
  assert.equal(violating?.eligible, false);
  assert.ok(violating?.issues.includes("CONSTRAINT_VIOLATION"));
});

test("lower risk reversible action beats higher-risk irreversible action", () => {
  const result = deliberateOperatorIntelligenceDecision({ goal: "Choose between two implementation paths", candidates: [reversibleAction({ id: "safe-action" }), reversibleAction({ id: "irreversible-action", irreversible: true, reversible: false, risk: "high", goal_progress: "decisive" })], evidence: [safeEvidence()] });
  assert.equal(result.selected_candidate?.id, "safe-action");
  assert.equal(result.status, "RECOMMENDATION_REQUIRES_HUMAN");
  assert.equal(result.selected_candidate?.requires_human, true);
});

test("untrusted evidence never counts as trusted support", () => {
  const result = deliberateOperatorIntelligenceDecision({ goal: "Use only trusted support", candidates: [{ id: "recommend-a", title: "Recommend A", kind: "recommendation", risk: "low", reversible: true, goal_progress: "high", evidence_ids: ["ev-untrusted"] }, { id: "recommend-b", title: "Recommend B", kind: "recommendation", risk: "low", reversible: true, goal_progress: "high", evidence_ids: ["ev-current"] }], evidence: [safeEvidence(), safeEvidence({ id: "ev-untrusted", trusted: false })] });
  assert.equal(result.selected_candidate?.id, "recommend-b");
  const candidateA = result.candidates.find((candidate) => candidate.id === "recommend-a");
  assert.equal(candidateA?.trusted_current_evidence_count, 0);
});

test("decision-critical choice refuses to pretend one feasible alternative is enough", () => {
  const result = deliberateOperatorIntelligenceDecision({ goal: "Make a material decision", candidates: [{ id: "only-option", title: "Only feasible option", kind: "recommendation", risk: "low", goal_progress: "high" }], decision_critical: true });
  assert.equal(result.status, "ALTERNATIVES_INSUFFICIENT");
  assert.equal(result.alternatives_insufficient, true);
  assert.equal(result.selected_candidate?.id, "only-option");
});

test("planning tool exposes deliberation without gaining execution authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V7/);
  assert.match(source, /"deliberate"/);
  assert.match(source, /deliberative_decision_contract/);
  assert.match(source, /recommendations_are_not_execution_authority/);
  assert.match(source, /executes_business_actions: false/);
});
