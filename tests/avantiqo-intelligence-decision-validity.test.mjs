import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assessOperatorIntelligenceDecisionValidity,
  OPERATOR_INTELLIGENCE_DECISION_VALIDITY_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceDecisionValidityRuntime.js";

const NOW = "2026-08-27T06:50:00.000Z";
function decision() { return { candidate_id: "option-a", status: "SELECTED_FOR_PLANNING" }; }
function freshDependency(overrides = {}) { return { id: "ev-current", required: true, verified: true, current: true, volatility: "dynamic", observed_at: "2026-08-27T06:45:00.000Z", ...overrides }; }
function stableCondition(overrides = {}) { return { id: "condition-a", required: true, verified: true, status: "satisfied", volatility: "slow", observed_at: "2026-08-27T06:45:00.000Z", ...overrides }; }

test("decision validity exposes canonical contract and never authorizes execution", () => {
  const result = assessOperatorIntelligenceDecisionValidity({ decision: decision(), evidence_dependencies: [freshDependency()], validity_conditions: [stableCondition()], now: NOW });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_DECISION_VALIDITY_CONTRACT);
  assert.equal(result.status, "VALID_WITHIN_POLICY");
  assert.equal(result.decision_valid_now, true);
  assert.equal(result.requires_revalidation, false);
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
  assert.equal(result.governance.prior_approval_never_substitutes_for_current_governance, true);
});

test("stale evidence forces revalidation", () => {
  const result = assessOperatorIntelligenceDecisionValidity({ decision: decision(), evidence_dependencies: [freshDependency({ observed_at: "2026-08-27T06:00:00.000Z" })], validity_conditions: [stableCondition()], now: NOW });
  assert.equal(result.status, "REVALIDATION_REQUIRED");
  assert.equal(result.decision_valid_now, false);
  assert.equal(result.requires_revalidation, true);
  assert.equal(result.requires_replan, false);
  assert.ok(result.evidence_dependencies[0]?.issues.includes("DEPENDENCY_STALE"));
});

test("unverified evidence and unknown volatility fail closed", () => {
  const result = assessOperatorIntelligenceDecisionValidity({ decision: decision(), evidence_dependencies: [freshDependency({ verified: false, volatility: "unknown" })], validity_conditions: [stableCondition()], now: NOW });
  assert.equal(result.status, "REVALIDATION_REQUIRED");
  assert.ok(result.evidence_dependencies[0]?.issues.includes("DEPENDENCY_UNVERIFIED"));
  assert.ok(result.evidence_dependencies[0]?.issues.includes("DEPENDENCY_VOLATILITY_REQUIRED"));
});

test("verified changed condition invalidates prior decision and requires replan", () => {
  const result = assessOperatorIntelligenceDecisionValidity({ decision: decision(), evidence_dependencies: [freshDependency()], validity_conditions: [stableCondition({ status: "changed" })], now: NOW });
  assert.equal(result.status, "INVALIDATED_BY_VERIFIED_CHANGE");
  assert.equal(result.decision_valid_now, false);
  assert.equal(result.requires_revalidation, true);
  assert.equal(result.requires_replan, true);
  assert.deepEqual(result.verified_changed_condition_ids, ["condition-a"]);
});

test("future timestamps never make evidence look current", () => {
  const result = assessOperatorIntelligenceDecisionValidity({ decision: decision(), evidence_dependencies: [freshDependency({ observed_at: "2026-08-27T07:50:00.000Z" })], validity_conditions: [stableCondition()], now: NOW });
  assert.equal(result.status, "REVALIDATION_REQUIRED");
  assert.ok(result.evidence_dependencies[0]?.issues.includes("DEPENDENCY_FUTURE_TIMESTAMP_INVALID"));
});

test("caller freshness setting can tighten but never loosen policy", () => {
  const result = assessOperatorIntelligenceDecisionValidity({ decision: decision(), evidence_dependencies: [freshDependency({ max_age_ms: 999999999 })], validity_conditions: [stableCondition()], now: NOW });
  assert.equal(result.evidence_dependencies[0]?.policy_max_age_ms, 15 * 60_000);
  assert.equal(result.freshness_policy.caller_max_age_can_only_tighten_policy, true);
});

test("planning tool exposes decision validity without gaining execution authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V9/);
  assert.match(source, /"validate_decision"/);
  assert.match(source, /decision_validity_contract/);
  assert.match(source, /prior_approval_never_substitutes_for_current_governance/);
  assert.match(source, /executes_business_actions: false/);
});
