import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assessOperatorIntelligenceDecisionReadiness,
  OPERATOR_INTELLIGENCE_DECISION_READINESS_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceDecisionReadinessRuntime.js";

function deliberation(overrides = {}) {
  return {
    status: "SELECTED_FOR_PLANNING",
    selected_candidate: { id: "option-a", mutates: false, requires_human: false },
    ...overrides,
  };
}
function robustness(overrides = {}) { return { status: "ROBUST_ACROSS_TESTED_SCENARIOS", ...overrides }; }
function validity(overrides = {}) { return { status: "VALID_WITHIN_POLICY", decision_valid_now: true, ...overrides }; }
function uncertainty(overrides = {}) { return { status: "NO_UNRESOLVED_UNCERTAINTY", ...overrides }; }
function confidence(overrides = {}) {
  return {
    confidence_band: "high",
    model_numeric_confidence_never_overrides_epistemic_ceiling: true,
    confidence_never_increased: true,
    ...overrides,
  };
}

test("fully supported critical decision is ready for recommendation without execution authority", () => {
  const result = assessOperatorIntelligenceDecisionReadiness({
    deliberation: deliberation(),
    robustness: robustness(),
    validity: validity(),
    uncertainty_priority: uncertainty(),
    confidence_calibration: confidence(),
    decision_critical: true,
  });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_DECISION_READINESS_CONTRACT);
  assert.equal(result.status, "READY_FOR_RECOMMENDATION");
  assert.equal(result.decision_ready, true);
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
  assert.equal(result.governance.readiness_is_not_execution_authority, true);
});

test("evidence-first deliberation cannot become decision ready", () => {
  const result = assessOperatorIntelligenceDecisionReadiness({
    deliberation: deliberation({ status: "EVIDENCE_FIRST" }),
    robustness: robustness(),
    validity: validity(),
    uncertainty_priority: uncertainty(),
    confidence_calibration: confidence(),
  });
  assert.equal(result.status, "RESEARCH_FIRST");
  assert.equal(result.decision_ready, false);
});

test("stale decision validity blocks readiness even when other gates pass", () => {
  const result = assessOperatorIntelligenceDecisionReadiness({
    deliberation: deliberation(),
    robustness: robustness(),
    validity: validity({ status: "REVALIDATION_REQUIRED", decision_valid_now: false }),
    uncertainty_priority: uncertainty(),
    confidence_calibration: confidence(),
  });
  assert.equal(result.status, "REVALIDATION_REQUIRED");
  assert.equal(result.decision_ready, false);
});

test("decision-critical low calibrated confidence blocks readiness", () => {
  const result = assessOperatorIntelligenceDecisionReadiness({
    deliberation: deliberation(),
    robustness: robustness(),
    validity: validity(),
    uncertainty_priority: uncertainty(),
    confidence_calibration: confidence({ confidence_band: "guarded" }),
    decision_critical: true,
  });
  assert.equal(result.status, "CONFIDENCE_TOO_LOW");
  assert.equal(result.decision_ready, false);
  assert.equal(result.minimum_confidence_band, "moderate");
});

test("higher-value unresolved uncertainty forces research before readiness", () => {
  const result = assessOperatorIntelligenceDecisionReadiness({
    deliberation: deliberation(),
    robustness: robustness(),
    validity: validity(),
    uncertainty_priority: uncertainty({ status: "RESOLVE_NEXT", next_action: "RESOLVE_VIA_LIVE_READ" }),
    confidence_calibration: confidence(),
  });
  assert.equal(result.status, "RESEARCH_FIRST");
  assert.equal(result.next_action, "RESOLVE_VIA_LIVE_READ");
});

test("mutating recommendation can only become ready for current human governance", () => {
  const result = assessOperatorIntelligenceDecisionReadiness({
    deliberation: deliberation({
      status: "RECOMMENDATION_REQUIRES_HUMAN",
      selected_candidate: { id: "option-write", mutates: true, requires_human: true },
    }),
    robustness: robustness(),
    validity: validity(),
    uncertainty_priority: uncertainty({ status: "DEFER_LOW_VALUE_UNCERTAINTIES" }),
    confidence_calibration: confidence(),
  });
  assert.equal(result.status, "READY_FOR_HUMAN_GOVERNANCE");
  assert.equal(result.decision_ready, true);
  assert.equal(result.governance.ready_for_human_governance_is_not_human_approval, true);
  assert.equal(result.governance.current_permissions_confirmation_wallet_and_verification_still_apply, true);
});

test("planning tool exposes readiness synthesis without execution authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V8/);
  assert.match(source, /"assess_readiness"/);
  assert.match(source, /decision_readiness_contract/);
  assert.match(source, /raw_model_confidence_never_establishes_readiness/);
  assert.match(source, /mutating_selection_can_only_be_ready_for_governance/);
  assert.match(source, /executes_business_actions: false/);
});
